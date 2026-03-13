import type { Transaction } from "@/client/app/features/transactions/use-transactions";
import { formatMoneyMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

export type RecentTransactionsProps = {
  transactions: Transaction[];
  onEdit?: (id: string) => void;
};

export function RecentTransactions({
  transactions,
  onEdit,
}: RecentTransactionsProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Recent Transactions
      </h2>
      <div className="divide-y rounded-lg border">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className={cn(
              "flex items-center justify-between gap-4 px-4 py-3",
              onEdit &&
                "cursor-pointer transition-colors hover:bg-muted/50",
            )}
            onClick={() => onEdit?.(tx.id)}
            role={onEdit ? "button" : undefined}
            tabIndex={onEdit ? 0 : undefined}
            onKeyDown={
              onEdit
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onEdit(tx.id);
                    }
                  }
                : undefined
            }
          >
            <div className="min-w-0">
              <span className="truncate text-sm font-medium">{tx.name}</span>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{tx.transactionDate}</span>
                <span className="text-muted-foreground/40">&middot;</span>
                <span className="truncate">{tx.accountName}</span>
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 text-sm font-medium tabular-nums",
                tx.type === "income" ? "text-emerald-600" : "text-destructive",
              )}
            >
              {tx.type === "income" ? "+" : ""}
              {formatMoneyMinor(tx.signedAmount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
