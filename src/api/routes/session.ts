import { Hono } from "hono";
import type { AppEnv } from "@/api/context";
import { sql } from "@/db/client";

export const sessionRoute = new Hono<AppEnv>().get("/", async (c) => {
  const user = c.get("user");
  const workspaceId = c.get("workspaceId");

  const rows =
    await sql<{ id: string; name: string }>`SELECT w.id, w.name FROM workspace w JOIN workspace_membership wm ON wm.workspace_id = w.id WHERE wm.user_id = ${user.id} AND wm.deleted_at IS NULL ORDER BY w.name ASC`;

  const workspaces = rows.map((r) => ({
    id: r.id,
    name: r.name,
  }));

  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    },
    workspaces,
    activeWorkspaceId: workspaceId,
  });
});
