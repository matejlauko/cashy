import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "@/api/context";
import {
  WORKSPACE_COOKIE_NAME,
  WORKSPACE_COOKIE_MAX_AGE,
} from "@/api/middleware/workspace";
import { sql } from "@/db/client";
import { isSecureOrigin } from "@/env";
import { logger } from "@/logger";

export const workspacesRoute = new Hono<AppEnv>().post(
  "/set-active",
  async (c) => {
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
      throw new HTTPException(400, {
        message: "Invalid JSON body",
      });
    }

    const workspaceId =
      typeof body === "object" && body !== null && "workspaceId" in body
        ? (body as { workspaceId: unknown }).workspaceId
        : undefined;

    if (typeof workspaceId !== "string" || workspaceId.trim().length === 0) {
      throw new HTTPException(400, { message: "workspaceId is required" });
    }

    const normalizedWorkspaceId = workspaceId.trim();

    const userId = c.get("user").id;

    const rows =
      await sql`SELECT id FROM workspace_membership WHERE user_id = ${userId} AND workspace_id = ${normalizedWorkspaceId} AND deleted_at IS NULL LIMIT 1`;

    if (rows.length === 0) {
      throw new HTTPException(403, {
        message: "Not a member of this workspace",
      });
    }

    setCookie(c, WORKSPACE_COOKIE_NAME, normalizedWorkspaceId, {
      httpOnly: true,
      sameSite: "Lax",
      secure: isSecureOrigin,
      path: "/",
      maxAge: WORKSPACE_COOKIE_MAX_AGE,
    });

    logger.info("Workspace switched", {
      requestId: c.get("requestId"),
      userId,
      workspaceId: normalizedWorkspaceId,
    });

    return c.json({ activeWorkspaceId: normalizedWorkspaceId });
  },
);
