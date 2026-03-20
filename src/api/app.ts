import type { AppEnv } from "@/api/context";
import { auth } from "@/auth/auth";
import { Hono } from "hono";

import { errorHandler } from "@/api/middleware/error-handler";
import { requestIdMiddleware } from "@/api/middleware/request-id";
import { requestLogger } from "@/api/middleware/request-logger";
import { secureHeadersMiddleware } from "@/api/middleware/secure-headers";
import { sessionMiddleware } from "@/api/middleware/session";
import { workspaceMiddleware } from "@/api/middleware/workspace";

import { sessionRoute } from "@/api/routes/session";
import { workspacesRoute } from "@/api/routes/workspaces";
import { accountsRoute } from "@/api/routes/accounts";
import { balanceSnapshotsRoute } from "@/api/routes/balance-snapshots";
import { transactionsRoute } from "@/api/routes/transactions";
import { dashboardRoute } from "@/api/routes/dashboard";
import { recurringTransactionsRoute } from "@/api/routes/recurring-transactions";
import { budgetItemsRoute } from "@/api/routes/budget-items";

const app = new Hono<AppEnv>().basePath("/api");

// ── Global middleware (all /api/* routes) ──────────────────────────
app.use("*", requestIdMiddleware);
app.use("*", requestLogger);
app.use("*", secureHeadersMiddleware);

// ── Error handler ──────────────────────────────────────────────────
app.onError(errorHandler);
app.notFound((c) => {
  return c.json(
    { error: { code: "NOT_FOUND", message: "Route not found" } },
    { status: 404 },
  );
});

// ── Better Auth (no session/workspace middleware) ──────────────────
app.on(["POST", "GET"], "/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// ── Protected route middleware ─────────────────────────────────────
app.use("/session", sessionMiddleware, workspaceMiddleware);
app.use("/workspaces/*", sessionMiddleware, workspaceMiddleware);
app.use("/accounts", sessionMiddleware, workspaceMiddleware);
app.use("/accounts/*", sessionMiddleware, workspaceMiddleware);
app.use("/balance-snapshots", sessionMiddleware, workspaceMiddleware);
app.use("/balance-snapshots/*", sessionMiddleware, workspaceMiddleware);
app.use("/transactions", sessionMiddleware, workspaceMiddleware);
app.use("/transactions/*", sessionMiddleware, workspaceMiddleware);
app.use("/dashboard", sessionMiddleware, workspaceMiddleware);
app.use("/dashboard/*", sessionMiddleware, workspaceMiddleware);
app.use("/recurring-transactions", sessionMiddleware, workspaceMiddleware);
app.use("/recurring-transactions/*", sessionMiddleware, workspaceMiddleware);
app.use("/budget-items", sessionMiddleware, workspaceMiddleware);
app.use("/budget-items/*", sessionMiddleware, workspaceMiddleware);

// ── Routes (chained for RPC type inference) ────────────────────────
const routes = app
  .route("/session", sessionRoute)
  .route("/workspaces", workspacesRoute)
  .route("/accounts", accountsRoute)
  .route("/balance-snapshots", balanceSnapshotsRoute)
  .route("/transactions", transactionsRoute)
  .route("/dashboard", dashboardRoute)
  .route("/recurring-transactions", recurringTransactionsRoute)
  .route("/budget-items", budgetItemsRoute);

export type AppType = typeof routes;
export { routes as honoApp };
