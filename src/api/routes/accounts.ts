import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "@/api/context";
import { logger } from "@/logger";
import {
  createAccountInput,
  updateAccountInput,
} from "@/schemas/accounts";
import * as accountsDb from "@/db/modules/accounts";
import { AccountError } from "@/db/modules/accounts";

function domainErrorStatus(code: string): ContentfulStatusCode {
  switch (code) {
    case "ACCOUNT_NAME_TAKEN":
      return 409;
    case "ACCOUNT_ARCHIVED":
    case "ACCOUNT_BALANCE_NOT_ZERO":
      return 400;
    default:
      return 400;
  }
}

export const accountsRoute = new Hono<AppEnv>()
  // ── GET / — list active accounts ─────────────────────────────────
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const accounts = await accountsDb.listActive(workspaceId);
    return c.json({ accounts });
  })

  // ── POST / — create account ──────────────────────────────────────
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

    const result = createAccountInput.safeParse(body);
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
      const account = await accountsDb.create(
        workspaceId,
        userId,
        result.data,
      );

      logger.info("Account created", {
        requestId: c.get("requestId"),
        userId,
        workspaceId,
        accountId: account.id,
      });

      return c.json({ account }, 201);
    } catch (err) {
      if (err instanceof AccountError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          domainErrorStatus(err.code),
        );
      }
      throw err;
    }
  })

  // ── PATCH /:id — update account ──────────────────────────────────
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

    const result = updateAccountInput.safeParse(body);
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
      const account = await accountsDb.update(
        id,
        workspaceId,
        userId,
        result.data,
      );

      if (!account) {
        throw new HTTPException(404, { message: "Account not found" });
      }

      logger.info("Account updated", {
        requestId: c.get("requestId"),
        userId,
        workspaceId,
        accountId: id,
      });

      return c.json({ account });
    } catch (err) {
      if (err instanceof AccountError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          domainErrorStatus(err.code),
        );
      }
      throw err;
    }
  })

  // ── POST /:id/archive — archive account ─────────────────────────
  .post("/:id/archive", async (c) => {
    const id = c.req.param("id");
    const workspaceId = c.get("workspaceId");
    const userId = c.get("user").id;

    try {
      const archived = await accountsDb.archive(id, workspaceId, userId);

      if (!archived) {
        throw new HTTPException(404, {
          message: "Account not found or already archived",
        });
      }

      logger.info("Account archived", {
        requestId: c.get("requestId"),
        userId,
        workspaceId,
        accountId: id,
      });

      return c.json({ success: true });
    } catch (err) {
      if (err instanceof AccountError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          domainErrorStatus(err.code),
        );
      }
      throw err;
    }
  });
