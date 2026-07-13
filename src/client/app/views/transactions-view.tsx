import { useEffect, useState } from "react";
import {
  useTransactions,
  type Transaction,
} from "@/client/app/features/transactions/use-transactions";
import {
  useCreateTransaction,
  useUpdateTransaction,
  useSoftDeleteTransaction,
} from "@/client/app/features/transactions/use-transaction-mutations";
import {
  TransactionFormDialog,
} from "@/client/app/features/transactions/transaction-form";
import {
  DeleteConfirmDialog,
} from "@/client/app/features/transactions/delete-confirm";
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
} from "@/schemas/transactions";
import { TRANSACTION_TYPE_LABELS } from "@/schemas/transactions";
import { formatMoneyMinor } from "@/lib/money";
import { formatDisplayDate, currentMonthKey } from "@/lib/date";
import { MonthNavigator } from "@/client/app/features/shared/month-navigator";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeftRight, Trash2 } from "lucide-react";

interface TransactionsViewProps {
  workspaceId: string;
  focusTransactionId?: string | null;
  onFocusTransactionHandled?: () => void;
}

export function TransactionsView({
  workspaceId,
  focusTransactionId,
  onFocusTransactionHandled,
}: TransactionsViewProps) {
  const [month, setMonth] = useState(currentMonthKey());
  const { data: transactions, isLoading, isError, error } =
    useTransactions(workspaceId, month);

  const createMutation = useCreateTransaction(workspaceId);
  const updateMutation = useUpdateTransaction(workspaceId);
  const deleteMutation = useSoftDeleteTransaction(workspaceId);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingTransaction, setDeletingTransaction] =
    useState<Transaction | null>(null);

  useEffect(() => {
    if (!focusTransactionId || !transactions) return;

    const transaction = transactions.find((tx) => tx.id === focusTransactionId);
    if (transaction) {
      setEditingTransaction(transaction);
      setFormOpen(true);
    }

    onFocusTransactionHandled?.();
  }, [focusTransactionId, onFocusTransactionHandled, transactions]);

  const handleCreate = () => {
    setEditingTransaction(null);
    setFormOpen(true);
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setFormOpen(true);
  };

  const handleDeleteIntent = (transaction: Transaction) => {
    setDeletingTransaction(transaction);
    setDeleteOpen(true);
  };

  const handleFormSubmit = async (
    data: CreateTransactionInput | UpdateTransactionInput,
  ) => {
    if (editingTransaction) {
      await updateMutation.mutateAsync({
        id: editingTransaction.id,
        data: data as UpdateTransactionInput,
      });
    } else {
      await createMutation.mutateAsync(data as CreateTransactionInput);
    }
    setFormOpen(false);
  };

  const handleDeleteConfirm = () => {
    if (!deletingTransaction) return;
    deleteMutation.mutate(deletingTransaction.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        setDeletingTransaction(null);
      },
    });
  };

  const hasTransactions = transactions && transactions.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Transactions</h1>
        <div className="flex items-center gap-2">
          <MonthNavigator month={month} onChange={setMonth} />
          <Button size="sm" onClick={handleCreate}>
            <Plus className="size-4" />
            Add Transaction
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="divide-y rounded-lg border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 p-4">
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Failed to load transactions"}
          </div>
        </div>
      ) : !hasTransactions ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <ArrowLeftRight className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No transactions this month.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a transaction to track notable income and expenses.
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="size-4" />
            Add Transaction
          </Button>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex cursor-pointer items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50"
              onClick={() => handleEdit(tx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleEdit(tx);
                }
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{tx.name}</span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {TRANSACTION_TYPE_LABELS[tx.type]}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span>{formatDisplayDate(tx.transactionDate)}</span>
                  <span className="text-muted-foreground/40">&middot;</span>
                  <span className="truncate">{tx.accountName}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span
                  className={cn(
                    "mr-1 text-sm font-medium tabular-nums",
                    tx.type === "income"
                      ? "text-emerald-600"
                      : "text-destructive",
                  )}
                >
                  {tx.type === "income" ? "+" : ""}
                  {formatMoneyMinor(tx.signedAmount)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteIntent(tx);
                  }}
                  aria-label={`Delete ${tx.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TransactionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editingTransaction}
        onSubmit={handleFormSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
        workspaceId={workspaceId}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        transaction={deletingTransaction}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
