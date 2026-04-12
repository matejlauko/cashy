import { Hono } from "hono";
import type { AppEnv } from "@/api/context";
import * as balanceSnapshotsDb from "@/db/modules/balance-snapshots";
import { balanceHistoryQuerySchema } from "@/schemas/balance-history";

export const balanceHistoryRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const month = c.req.query("month");
    const result = balanceHistoryQuerySchema.safeParse({ month });
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
    const matrix = await balanceSnapshotsDb.getMonthMatrix(
      workspaceId,
      result.data.month,
    );

    return c.json({
      month: result.data.month,
      accounts: matrix.accounts,
      rows: matrix.rows,
      baseline: matrix.baseline,
    });
  });
