import { useState } from "react";
import {
  useBudgetItems,
  type BudgetItem,
} from "@/client/app/features/budget-items/use-budget-items";
import {
  useCreateBudgetItem,
  useUpdateBudgetItem,
  useDeleteBudgetItem,
} from "@/client/app/features/budget-items/use-budget-item-mutations";
import { BudgetItemFormDialog } from "@/client/app/features/budget-items/budget-item-form";
import { DeleteConfirmDialog } from "@/client/app/features/budget-items/delete-confirm";
import { useDashboard } from "@/client/app/features/dashboard/use-dashboard";
import { currentMonthKey } from "@/lib/date";
import { formatMoneyMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import type {
  CreateBudgetItemInput,
  UpdateBudgetItemInput,
} from "@/schemas/budget-items";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricInfo } from "@/components/ui/metric-info";
import { Plus, PiggyBank, Pencil, Trash2 } from "lucide-react";

interface BudgetViewProps {
  workspaceId: string;
}

export function BudgetView({ workspaceId }: BudgetViewProps) {
  const {
    data: budgetItems,
    isLoading,
    isError,
    error,
  } = useBudgetItems(workspaceId);

  const { data: dashboardData } = useDashboard(workspaceId, currentMonthKey());

  const createMutation = useCreateBudgetItem(workspaceId);
  const updateMutation = useUpdateBudgetItem(workspaceId);
  const deleteMutation = useDeleteBudgetItem(workspaceId);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<BudgetItem | null>(null);

  const handleCreate = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const handleEdit = (item: BudgetItem) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  const handleDeleteIntent = (item: BudgetItem) => {
    setDeletingItem(item);
    setDeleteOpen(true);
  };

  const handleFormSubmit = async (
    data: CreateBudgetItemInput | UpdateBudgetItemInput,
  ) => {
    if (editingItem) {
      await updateMutation.mutateAsync({
        id: editingItem.id,
        data: data as UpdateBudgetItemInput,
      });
    } else {
      await createMutation.mutateAsync(data as CreateBudgetItemInput);
    }
    setFormOpen(false);
  };

  const handleDeleteConfirm = () => {
    if (!deletingItem) return;
    deleteMutation.mutate(deletingItem.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        setDeletingItem(null);
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
        <div className="grid grid-cols-2 gap-2">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-1 rounded-xl border px-6 py-4">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-7 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="divide-y rounded-lg border">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
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
            : "Failed to load budget items"}
        </div>
      </div>
    );
  }

  const hasItems = budgetItems && budgetItems.length > 0;
  const totalPlanned = budgetItems?.reduce(
    (sum, item) => sum + item.amountMinor,
    0,
  ) ?? 0;

  const recurringIncome = dashboardData?.summary.recurringIncomeTotal ?? 0;
  const recurringExpense = dashboardData?.summary.recurringExpenseTotal ?? 0;
  const availableToSpend = recurringIncome - recurringExpense - totalPlanned;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Budget</h1>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="size-4" />
          Add Item
        </Button>
      </div>

      {!hasItems ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <PiggyBank className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No budget items yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Set aside monthly amounts for investing, taxes, or other savings
              goals.
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="size-4" />
            Add Budget Item
          </Button>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-2">
            <Card className="gap-1">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Planned
                </CardTitle>
                <CardAction>
                  <MetricInfo metricKey="totalPlanned" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-semibold tabular-nums">
                  {formatMoneyMinor(totalPlanned)}
                </span>
              </CardContent>
            </Card>

            <Card className="gap-1">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Available to Spend
                </CardTitle>
                <CardAction>
                  <MetricInfo metricKey="availableToSpend" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <span
                  className={cn(
                    "text-2xl font-semibold tabular-nums",
                    availableToSpend < 0 && "text-destructive",
                  )}
                >
                  {formatMoneyMinor(availableToSpend)}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Budget items list */}
          <div className="divide-y rounded-lg border">
            {budgetItems.map((item) => (
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
                  <span className="truncate font-medium">{item.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="mr-1 text-sm font-medium tabular-nums">
                    {formatMoneyMinor(item.amountMinor)}
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
                      handleDeleteIntent(item);
                    }}
                    aria-label={`Delete ${item.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <BudgetItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        budgetItem={editingItem}
        onSubmit={handleFormSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        budgetItem={deletingItem}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
