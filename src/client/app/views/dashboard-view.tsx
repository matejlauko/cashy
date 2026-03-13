import { BarChart3 } from "lucide-react";

interface DashboardViewProps {
  workspaceId: string;
}

export function DashboardView({ workspaceId }: DashboardViewProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-sm text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-chart-1/10">
          <BarChart3 className="size-7 text-chart-1" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Dashboard</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your financial overview will appear here once you set up accounts and
          start tracking balances.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Balance metrics
          </span>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Spending chart
          </span>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Recent activity
          </span>
        </div>
      </div>
    </div>
  );
}
