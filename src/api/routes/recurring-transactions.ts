import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "@/api/context";
import { logger } from "@/logger";
import {
  createRecurringTransactionInput,
  updateRecurringTransactionInput,
} from "@/schemas/recurring-transactions";
import * as recurringDb from "@/db/modules/recurring-transactions";
import { RecurringTransactionError } from "@/db/modules/recurring-transactions";

function domainErrorStatus(code: string): ContentfulStatusCode {
  switch (code) {
    case "RECURRING_ARCHIVED":
      return 400;
    default:
      return 400;
  }
}

export const recurringTransactionsRoute = new Hono<AppEnv>()
  // ── GET / — list active recurring transactions ───────────────────
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const recurringTransactions = await recurringDb.listActive(workspaceId);
    return c.json({ recurringTransactions });
  })

  // ── POST / — create recurring transaction ────────────────────────
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

    const result = createRecurringTransactionInput.safeParse(body);
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
      const recurringTransaction = await recurringDb.create(
        workspaceId,
        userId,
        result.data,
      );

      logger.info("Recurring transaction created", {
        requestId: c.get("requestId"),
        userId,
        workspaceId,
        recurringTransactionId: recurringTransaction.id,
      });

      return c.json({ recurringTransaction }, 201);
    } catch (err) {
      if (err instanceof RecurringTransactionError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          domainErrorStatus(err.code),
        );
      }
      throw err;
    }
  })

  // ── PATCH /:id — update recurring transaction ────────────────────
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

    const result = updateRecurringTransactionInput.safeParse(body);
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
      const recurringTransaction = await recurringDb.update(
        id,
        workspaceId,
        userId,
        result.data,
      );

      if (!recurringTransaction) {
        throw new HTTPException(404, {
          message: "Recurring transaction not found",
        });
      }

      logger.info("Recurring transaction updated", {
        requestId: c.get("requestId"),
        userId,
        workspaceId,
        recurringTransactionId: id,
      });

      return c.json({ recurringTransaction });
    } catch (err) {
      if (err instanceof RecurringTransactionError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          domainErrorStatus(err.code),
        );
      }
      throw err;
    }
  })

  // ── POST /:id/archive — archive recurring transaction ────────────
  .post("/:id/archive", async (c) => {
    const id = c.req.param("id");
    const workspaceId = c.get("workspaceId");
    const userId = c.get("user").id;

    try {
      const archived = await recurringDb.archive(id, workspaceId, userId);

      if (!archived) {
        throw new HTTPException(404, {
          message: "Recurring transaction not found",
        });
      }

      logger.info("Recurring transaction archived", {
        requestId: c.get("requestId"),
        userId,
        workspaceId,
        recurringTransactionId: id,
      });

      return c.json({ success: true });
    } catch (err) {
      if (err instanceof RecurringTransactionError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          domainErrorStatus(err.code),
        );
      }
      throw err;
    }
  });
