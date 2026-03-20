import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "@/api/context";
import { logger } from "@/logger";
import {
  createBudgetItemInput,
  updateBudgetItemInput,
} from "@/schemas/budget-items";
import * as budgetItemsDb from "@/db/modules/budget-items";

export const budgetItemsRoute = new Hono<AppEnv>()
  // ── GET / — list budget items ─────────────────────────────────────
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const budgetItems = await budgetItemsDb.list(workspaceId);
    return c.json({ budgetItems });
  })

  // ── POST / — create budget item ──────────────────────────────────
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

    const result = createBudgetItemInput.safeParse(body);
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

    const budgetItem = await budgetItemsDb.create(
      workspaceId,
      userId,
      result.data,
    );

    logger.info("Budget item created", {
      requestId: c.get("requestId"),
      userId,
      workspaceId,
      budgetItemId: budgetItem.id,
    });

    return c.json({ budgetItem }, 201);
  })

  // ── PATCH /:id — update budget item ──────────────────────────────
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

    const result = updateBudgetItemInput.safeParse(body);
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

    const budgetItem = await budgetItemsDb.update(
      id,
      workspaceId,
      userId,
      result.data,
    );

    if (!budgetItem) {
      throw new HTTPException(404, {
        message: "Budget item not found",
      });
    }

    logger.info("Budget item updated", {
      requestId: c.get("requestId"),
      userId,
      workspaceId,
      budgetItemId: id,
    });

    return c.json({ budgetItem });
  })

  // ── DELETE /:id — hard delete budget item ─────────────────────────
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const workspaceId = c.get("workspaceId");
    const userId = c.get("user").id;

    const deleted = await budgetItemsDb.hardDelete(id, workspaceId);

    if (!deleted) {
      throw new HTTPException(404, {
        message: "Budget item not found",
      });
    }

    logger.info("Budget item deleted", {
      requestId: c.get("requestId"),
      userId,
      workspaceId,
      budgetItemId: id,
    });

    return c.json({ success: true });
  });
