import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "@/api/context";
import { logger } from "@/logger";
import {
  bulkBalanceUpdateInput,
  prefillQuerySchema,
} from "@/schemas/balance-snapshots";
import * as balanceSnapshotsDb from "@/db/modules/balance-snapshots";
import { BalanceSnapshotError } from "@/db/modules/balance-snapshots";

function domainErrorStatus(code: string): ContentfulStatusCode {
  switch (code) {
    case "SNAPSHOT_ACCOUNT_MISMATCH":
      return 400;
    case "INVALID_DATE_RANGE":
      return 400;
    default:
      return 400;
  }
}

export const balanceSnapshotsRoute = new Hono<AppEnv>()
  // ── GET /prefill — prefill balances for a date ─────────────────────
  .get("/prefill", async (c) => {
    const date = c.req.query("date");
    const result = prefillQuerySchema.safeParse({ date });
    if (!result.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters",
            details: result.error.issues,
          },
        },
        400,
      );
    }

    const workspaceId = c.get("workspaceId");
    const prefill = await balanceSnapshotsDb.getPrefillByDate(
      workspaceId,
      result.data.date,
    );
    return c.json({ prefill });
  })

  // ── POST /bulk — bulk create balance snapshots ─────────────────────
  .post("/bulk", async (c) => {
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

    const result = bulkBalanceUpdateInput.safeParse(body);
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
      await balanceSnapshotsDb.bulkCreate(
        workspaceId,
        userId,
        result.data.effectiveDate,
        result.data.snapshots,
      );

      logger.info("Bulk balance update", {
        requestId: c.get("requestId"),
        userId,
        workspaceId,
        effectiveDate: result.data.effectiveDate,
        snapshotCount: result.data.snapshots.length,
      });

      return c.json({ success: true }, 201);
    } catch (err) {
      if (err instanceof BalanceSnapshotError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          domainErrorStatus(err.code),
        );
      }
      throw err;
    }
  });
