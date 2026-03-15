import { useState } from "react";
import {
  useRecurringTransactions,
  type RecurringTransaction,
} from "@/client/app/features/recurring-transactions/use-recurring-transactions";
import {
  useCreateRecurringTransaction,
  useUpdateRecurringTransaction,
  useArchiveRecurringTransaction,
} from "@/client/app/features/recurring-transactions/use-recurring-transaction-mutations";
import { RecurringTransactionFormDialog } from "@/client/app/features/recurring-transactions/recurring-transaction-form";
import { ArchiveConfirmDialog } from "@/client/app/features/recurring-transactions/archive-confirm";
import type {
  CreateRecurringTransactionInput,
  UpdateRecurringTransactionInput,
} from "@/schemas/recurring-transactions";
import { TRANSACTION_TYPE_LABELS } from "@/schemas/transactions";
import { formatMoneyMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Repeat, Pencil, Archive } from "lucide-react";

interface RecurringViewProps {
  workspaceId: string;
}

function formatDayOfMonth(day: number): string {
  const suffix =
    day === 1 || day === 21 || day === 31
      ? "st"
      : day === 2 || day === 22
        ? "nd"
        : day === 3 || day === 23
          ? "rd"
          : "th";
  return `${day}${suffix}`;
}

export function RecurringView({ workspaceId }: RecurringViewProps) {
  const {
    data: recurringTransactions,
    isLoading,
    isError,
    error,
  } = useRecurringTransactions(workspaceId);

  const createMutation = useCreateRecurringTransaction(workspaceId);
  const updateMutation = useUpdateRecurringTransaction(workspaceId);
  const archiveMutation = useArchiveRecurringTransaction(workspaceId);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringTransaction | null>(
    null,
  );
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivingItem, setArchivingItem] =
    useState<RecurringTransaction | null>(null);

  const handleCreate = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const handleEdit = (item: RecurringTransaction) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  const handleArchiveIntent = (item: RecurringTransaction) => {
    setArchivingItem(item);
    setArchiveOpen(true);
  };

  const handleFormSubmit = async (
    data: CreateRecurringTransactionInput | UpdateRecurringTransactionInput,
  ) => {
    if (editingItem) {
      await updateMutation.mutateAsync({
        id: editingItem.id,
        data: data as UpdateRecurringTransactionInput,
      });
    } else {
      await createMutation.mutateAsync(
        data as CreateRecurringTransactionInput,
      );
    }
    setFormOpen(false);
  };

  const handleArchiveConfirm = () => {
    if (!archivingItem) return;
    archiveMutation.mutate(archivingItem.id, {
      onSuccess: () => {
        setArchiveOpen(false);
        setArchivingItem(null);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-6 w-28 animate-pulse rounded bg-muted" />
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="divide-y rounded-lg border">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Failed to load recurring transactions"}
        </div>
      </div>
    );
  }

  const hasItems = recurringTransactions && recurringTransactions.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Recurring</h1>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="size-4" />
          Add Recurring
        </Button>
      </div>

      {!hasItems ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <Repeat className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No recurring transactions yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your regular monthly income and expenses like rent, salary, or
              subscriptions.
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="size-4" />
            Add Recurring
          </Button>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {recurringTransactions.map((item) => (
            <div
              key={item.id}
              className="flex cursor-pointer items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50"
              onClick={() => handleEdit(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleEdit(item);
                }
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {TRANSACTION_TYPE_LABELS[item.type]}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span>{formatDayOfMonth(item.dayOfMonth)} of month</span>
                  {item.bankName && (
                    <>
                      <span className="text-muted-foreground/40">
                        &middot;
                      </span>
                      <span className="truncate">{item.bankName}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span
                  className={cn(
                    "mr-1 text-sm font-medium tabular-nums",
                    item.type === "income"
                      ? "text-emerald-600"
                      : "text-destructive",
                  )}
                >
                  {item.type === "income" ? "+" : ""}
                  {formatMoneyMinor(item.signedAmount)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(item);
                  }}
                  aria-label={`Edit ${item.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArchiveIntent(item);
                  }}
                  aria-label={`Archive ${item.name}`}
                >
                  <Archive className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RecurringTransactionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        recurringTransaction={editingItem}
        onSubmit={handleFormSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <ArchiveConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        recurringTransaction={archivingItem}
        onConfirm={handleArchiveConfirm}
        isPending={archiveMutation.isPending}
      />
    </div>
  );
}
