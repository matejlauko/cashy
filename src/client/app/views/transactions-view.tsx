import { ArrowLeftRight } from "lucide-react";

interface TransactionsViewProps {
  workspaceId: string;
}

export function TransactionsView({ workspaceId }: TransactionsViewProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-sm text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-chart-2/10">
          <ArrowLeftRight className="size-7 text-chart-2" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Transactions</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Log notable income and expenses to understand where your money goes
          each month.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Income
          </span>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Expenses
          </span>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Monthly totals
          </span>
        </div>
      </div>
    </div>
  );
}
