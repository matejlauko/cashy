import type { Account } from "@/client/app/features/accounts/use-accounts";
import { ACCOUNT_TYPE_LABELS } from "@/schemas/accounts";
import { formatMoneyMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

export type AccountBalancesProps = {
  accounts: Account[];
};

export function AccountBalances({ accounts }: AccountBalancesProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Account Balances
      </h2>
      <div className="divide-y rounded-lg border">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">
                {account.name}
              </span>
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {ACCOUNT_TYPE_LABELS[account.type]}
              </span>
            </div>
            <span
              className={cn(
                "shrink-0 text-sm font-medium tabular-nums",
                account.currentBalance < 0 && "text-destructive",
              )}
            >
              {formatMoneyMinor(account.currentBalance)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
