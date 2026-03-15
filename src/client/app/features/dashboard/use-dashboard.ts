import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/client/rpc";
import type { Account } from "@/client/app/features/accounts/use-accounts";
import type { Transaction } from "@/client/app/features/transactions/use-transactions";

export type DashboardSummary = {
  currentBalance: number;
  openingMonthBalance: number;
  monthlyIncomeTotal: number;
  monthlyExpenseTotal: number;
  monthlySpendingTotal: number;
  monthlySpendingExcludingTracked: number;
  lastSnapshotDate: string | null;
  recurringIncomeTotal: number;
  recurringExpenseTotal: number;
};

export type ChartDataPoint = {
  date: string;
  totalBalance: number;
};

export type DashboardData = {
  summary: DashboardSummary;
  chartData: ChartDataPoint[];
  accountBalances: Account[];
  recentTransactions: Transaction[];
  isCurrentMonth: boolean;
};

export function useDashboard(workspaceId: string, month: string) {
  return useQuery({
    queryKey: ["dashboard", workspaceId, month],
    queryFn: async () => {
      const res = await rpc.api.dashboard.$get({
        query: { month },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          (body as { error?: { message?: string } } | null)?.error?.message ??
          "Failed to load dashboard";
        throw new Error(message);
      }
      const data = (await res.json()) as DashboardData;
      return data;
    },
  });
}
