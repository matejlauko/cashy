import { Wallet } from "lucide-react";

interface AccountsViewProps {
  workspaceId: string;
}

export function AccountsView({ workspaceId }: AccountsViewProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-sm text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-chart-3/10">
          <Wallet className="size-7 text-chart-3" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Accounts</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Add your bank accounts, savings, and credit cards to start tracking
          balances across your household.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Checking
          </span>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Savings
          </span>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Credit card
          </span>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Cash
          </span>
        </div>
      </div>
    </div>
  );
}
