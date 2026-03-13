import { useState } from "react";
import { useDashboard } from "@/client/app/features/dashboard/use-dashboard";
import { MetricCards } from "@/client/app/features/dashboard/metric-cards";
import { BalanceChart } from "@/client/app/features/dashboard/balance-chart";
import { AccountBalances } from "@/client/app/features/dashboard/account-balances";
import { RecentTransactions } from "@/client/app/features/dashboard/recent-transactions";
import { BalanceUpdateFormDialog } from "@/client/app/features/balance-snapshots/balance-update-form";
import { currentMonthStart } from "@/lib/date";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  RefreshCw,
  Plus,
  ArrowLeftRight,
  BarChart3,
} from "lucide-react";

interface DashboardViewProps {
  workspaceId: string;
  onNavigate?: (section: "accounts" | "transactions") => void;
  onEditTransaction?: (transactionId: string) => void;
}

function formatSnapshotDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function DashboardView({
  workspaceId,
  onNavigate,
  onEditTransaction,
}: DashboardViewProps) {
  const { data, isLoading, isError, error } = useDashboard(workspaceId);
  const [balanceUpdateOpen, setBalanceUpdateOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 rounded-xl border p-6">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-7 w-28 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="space-y-2 rounded-xl border p-6">
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="h-6 w-24 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-[250px] animate-pulse rounded-lg border bg-muted/30" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-36 animate-pulse rounded bg-muted" />
          <div className="h-8 w-28 animate-pulse rounded bg-muted" />
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load dashboard"}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, chartData, accountBalances, recentTransactions } = data;
  const hasAccounts = accountBalances.length > 0;
  const monthStart = currentMonthStart();
  const hasCurrentMonthSnapshot =
    summary.lastSnapshotDate !== null && summary.lastSnapshotDate >= monthStart;
  const hasTransactions = recentTransactions.length > 0;

  // No accounts — full empty state
  if (!hasAccounts) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-full bg-muted p-4">
          <Wallet className="size-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Create your first account</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add an account to start tracking your balances and spending.
          </p>
        </div>
        <Button onClick={() => onNavigate?.("accounts")}>
          <Plus className="size-4" />
          Create Account
        </Button>
      </div>
    );
  }

  // Has accounts but no snapshots in the current month
  if (!hasCurrentMonthSnapshot) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-full bg-muted p-4">
          <BarChart3 className="size-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Update your balances to see spending data</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter this month's balances to populate current spending metrics.
          </p>
        </div>
        <Button onClick={() => setBalanceUpdateOpen(true)}>
          <RefreshCw className="size-4" />
          Update Balances
        </Button>
        <BalanceUpdateFormDialog
          open={balanceUpdateOpen}
          onOpenChange={setBalanceUpdateOpen}
          workspaceId={workspaceId}
          onCreateAccount={() => onNavigate?.("accounts")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MetricCards
        currentBalance={summary.currentBalance}
        monthlySpendingTotal={summary.monthlySpendingTotal}
        monthlySpendingExcludingTracked={
          summary.monthlySpendingExcludingTracked
        }
        monthlyIncomeTotal={summary.monthlyIncomeTotal}
        monthlyExpenseTotal={summary.monthlyExpenseTotal}
      />

      {chartData.length > 0 && <BalanceChart data={chartData} />}

      {/* Primary CTA */}
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Button onClick={() => setBalanceUpdateOpen(true)} className="w-full sm:w-auto">
          <RefreshCw className="size-4" />
          Update Balances
        </Button>
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate?.("accounts")}
          >
            <Plus className="size-4" />
            Add Account
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate?.("transactions")}
          >
            <ArrowLeftRight className="size-4" />
            Add Transaction
          </Button>
        </div>
      </div>

      <AccountBalances accounts={accountBalances} />

      {hasTransactions ? (
        <RecentTransactions
          transactions={recentTransactions}
          onEdit={(transactionId) =>
            onEditTransaction
              ? onEditTransaction(transactionId)
              : onNavigate?.("transactions")
          }
        />
      ) : (
        <div className="rounded-lg border px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            No transactions this month.{" "}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => onNavigate?.("transactions")}
            >
              Add a transaction
            </button>{" "}
            to track notable expenses.
          </p>
        </div>
      )}

      {/* Last snapshot date */}
      {summary.lastSnapshotDate && (
        <p className="text-xs text-muted-foreground">
          Last updated: {formatSnapshotDate(summary.lastSnapshotDate)}
        </p>
      )}

      <BalanceUpdateFormDialog
        open={balanceUpdateOpen}
        onOpenChange={setBalanceUpdateOpen}
        workspaceId={workspaceId}
        onCreateAccount={() => onNavigate?.("accounts")}
      />
    </div>
  );
}
