import { Hono } from "hono";
import type { AppEnv } from "@/api/context";
import * as dashboardDb from "@/db/modules/dashboard";
import * as accountsDb from "@/db/modules/accounts";
import * as transactionsDb from "@/db/modules/transactions";
import {
  isMonthKey,
  currentMonthKey,
  today,
  lastDayOfMonthFromKey,
} from "@/lib/date";

export const dashboardRoute = new Hono<AppEnv>().get("/", async (c) => {
  const workspaceId = c.get("workspaceId");

  const monthParam = c.req.query("month");
  const monthKey = monthParam && isMonthKey(monthParam)
    ? monthParam
    : currentMonthKey();
  const currentMonth = currentMonthKey();
  const isCurrentMonth = monthKey === currentMonth;
  const asOfDate = isCurrentMonth ? today() : lastDayOfMonthFromKey(monthKey);

  const [summary, chartData, accountBalances, recentTransactions] =
    await Promise.all([
      dashboardDb.getDashboardSummary(workspaceId, monthKey, asOfDate),
      dashboardDb.getBalanceChartData(workspaceId, monthKey, asOfDate),
      accountsDb.listActiveAsOf(workspaceId, asOfDate),
      transactionsDb.listRecent(workspaceId, 5, monthKey),
    ]);

  return c.json({
    summary,
    chartData,
    accountBalances,
    recentTransactions,
    isCurrentMonth,
  });
});
