import { createMiddleware } from "hono/factory";
import { getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "@/api/context";
import { sql } from "@/db/client";
import { isSecureOrigin } from "@/env";

export const WORKSPACE_COOKIE_NAME = "active_workspace";
export const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 365 days

export const workspaceMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("user").id;
  const cookieWorkspaceId = getCookie(c, WORKSPACE_COOKIE_NAME);

  if (cookieWorkspaceId) {
    const rows =
      await sql`SELECT workspace_id FROM workspace_membership WHERE user_id = ${userId} AND workspace_id = ${cookieWorkspaceId} AND deleted_at IS NULL LIMIT 1`;

    if (rows.length > 0) {
      c.set("workspaceId", cookieWorkspaceId);
      await next();
      return;
    }
  }

  // Auto-select first available workspace
  const fallbackRows =
    await sql<{ workspace_id: string }>`SELECT workspace_id FROM workspace_membership WHERE user_id = ${userId} AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`;

  if (fallbackRows.length === 0) {
    throw new HTTPException(403, { message: "No workspace access" });
  }

  const workspaceId = fallbackRows[0]!.workspace_id;
  c.set("workspaceId", workspaceId);

  setCookie(c, WORKSPACE_COOKIE_NAME, workspaceId, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecureOrigin,
    path: "/",
    maxAge: WORKSPACE_COOKIE_MAX_AGE,
  });

  await next();
});
