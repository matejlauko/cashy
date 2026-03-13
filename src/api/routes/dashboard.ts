import { Hono } from "hono";
import type { AppEnv } from "@/api/context";
import * as dashboardDb from "@/db/modules/dashboard";
import * as accountsDb from "@/db/modules/accounts";
import * as transactionsDb from "@/db/modules/transactions";

export const dashboardRoute = new Hono<AppEnv>().get("/", async (c) => {
  const workspaceId = c.get("workspaceId");

  const [summary, chartData, accountBalances, recentTransactions] =
    await Promise.all([
      dashboardDb.getDashboardSummary(workspaceId),
      dashboardDb.getBalanceChartData(workspaceId),
      accountsDb.listActive(workspaceId),
      transactionsDb.listRecent(workspaceId, 5),
    ]);

  return c.json({ summary, chartData, accountBalances, recentTransactions });
});
