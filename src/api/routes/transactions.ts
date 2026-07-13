import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "@/api/context";
import { currentMonthKey, isMonthKey } from "@/lib/date";
import { logger } from "@/logger";
import {
  createTransactionInput,
  updateTransactionInput,
} from "@/schemas/transactions";
import * as transactionsDb from "@/db/modules/transactions";
import { TransactionError } from "@/db/modules/transactions";

function domainErrorStatus(code: string): ContentfulStatusCode {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "ALREADY_ADDED":
      return 409;
    case "INVALID_DATE_RANGE":
    case "ACCOUNT_NOT_FOUND":
    case "TRANSACTION_DELETED":
    case "MISSING_ACCOUNT":
      return 400;
    default:
      return 400;
  }
}

export const transactionsRoute = new Hono<AppEnv>()
  // ── GET / — list transactions for a month (default: current) ──────
  .get("/", async (c) => {
    const month = c.req.query("month") ?? currentMonthKey();
    if (!isMonthKey(month)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid month, expected YYYY-MM",
          },
        },
        400,
      );
    }

    const workspaceId = c.get("workspaceId");
    const transactions = await transactionsDb.listMonth(workspaceId, month);
    return c.json({ transactions });
  })

  // ── POST / — create transaction ────────────────────────────────────
  .post("/", async (c) => {
    const contentType = c.req.header("content-type")?.toLowerCase();
    if (!contentType?.includes("application/json")) {
      throw new HTTPException(400, {
        message: "Content-Type must be application/json",
      });
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }

    const result = createTransactionInput.safeParse(body);
    if (!result.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: result.error.issues,
          },
        },
        400,
      );
    }

    const workspaceId = c.get("workspaceId");
    const userId = c.get("user").id;

    try {
      const transaction = await transactionsDb.create(
        workspaceId,
        userId,
        result.data,
      );

      logger.info("Transaction created", {
        requestId: c.get("requestId"),
        userId,
        workspaceId,
        transactionId: transaction.id,
      });

      return c.json({ transaction }, 201);
    } catch (err) {
      if (err instanceof TransactionError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          domainErrorStatus(err.code),
        );
      }
      throw err;
    }
  })

  // ── POST /from-recurring/:id — create transaction from recurring ──
  .post("/from-recurring/:id", async (c) => {
    const id = c.req.param("id");
    const workspaceId = c.get("workspaceId");
    const userId = c.get("user").id;

    try {
      const transaction = await transactionsDb.createFromRecurring(
        workspaceId,
        userId,
        id,
      );

      logger.info("Transaction created from recurring", {
        requestId: c.get("requestId"),
        userId,
        workspaceId,
        transactionId: transaction.id,
        recurringTransactionId: id,
      });

      return c.json({ transaction }, 201);
    } catch (err) {
      if (err instanceof TransactionError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          domainErrorStatus(err.code),
        );
      }
      throw err;
    }
  })

  // ── PATCH /:id — update transaction ────────────────────────────────
  .patch("/:id", async (c) => {
    const contentType = c.req.header("content-type")?.toLowerCase();
    if (!contentType?.includes("application/json")) {
      throw new HTTPException(400, {
        message: "Content-Type must be application/json",
      });
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }

    const result = updateTransactionInput.safeParse(body);
    if (!result.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: result.error.issues,
          },
        },
        400,
      );
    }

    const id = c.req.param("id");
    const workspaceId = c.get("workspaceId");
    const userId = c.get("user").id;

    try {
      const transaction = await transactionsDb.update(
        id,
        workspaceId,
        userId,
        result.data,
      );

      if (!transaction) {
        throw new HTTPException(404, { message: "Transaction not found" });
      }

      logger.info("Transaction updated", {
        requestId: c.get("requestId"),
        userId,
        workspaceId,
        transactionId: id,
      });

      return c.json({ transaction });
    } catch (err) {
      if (err instanceof TransactionError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          domainErrorStatus(err.code),
        );
      }
      throw err;
    }
  })

  // ── POST /:id/delete — soft delete transaction ────────────────────
  .post("/:id/delete", async (c) => {
    const id = c.req.param("id");
    const workspaceId = c.get("workspaceId");
    const userId = c.get("user").id;

    try {
      const deleted = await transactionsDb.softDelete(id, workspaceId, userId);

      if (!deleted) {
        throw new HTTPException(404, {
          message: "Transaction not found",
        });
      }

      logger.info("Transaction deleted", {
        requestId: c.get("requestId"),
        userId,
        workspaceId,
        transactionId: id,
      });

      return c.json({ success: true });
    } catch (err) {
      if (err instanceof TransactionError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          domainErrorStatus(err.code),
        );
      }
      throw err;
    }
  });
