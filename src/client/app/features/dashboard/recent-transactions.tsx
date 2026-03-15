import type { Transaction } from "@/client/app/features/transactions/use-transactions";
import { formatMoneyMinor } from "@/lib/money";
import { formatDisplayDate } from "@/lib/date";
import { cn } from "@/lib/utils";

export type RecentTransactionsProps = {
  transactions: Transaction[];
  onEdit?: (id: string) => void;
  isCurrentMonth?: boolean;
};

export function RecentTransactions({
  transactions,
  onEdit,
  isCurrentMonth = true,
}: RecentTransactionsProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        {isCurrentMonth ? "Recent Transactions" : "Transactions"}
      </h2>
      <div className="divide-y rounded-lg border">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className={cn(
              "flex items-center gap-4 px-4 py-2",
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
            <span className="shrink-0 text-xs text-muted-foreground w-12">
              {formatDisplayDate(tx.transactionDate)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {tx.name}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {tx.accountName}
            </span>
            <span
              className={cn(
                "shrink-0 text-sm font-medium tabular-nums text-right w-32",
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
