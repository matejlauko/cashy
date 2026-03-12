import type { AppEnv } from "@/api/context";
import { logger } from "@/logger";
import { createMiddleware } from "hono/factory";

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = performance.now();
  await next();
  const durationMs = Math.round(performance.now() - start);
  let userId: string | undefined;
  let workspaceId: string | undefined;

  try {
    userId = c.get("user")?.id;
  } catch {
    userId = undefined;
  }

  try {
    workspaceId = c.get("workspaceId");
  } catch {
    workspaceId = undefined;
  }

  logger.info("Request completed", {
    requestId: c.get("requestId"),
    method: c.req.method,
    route: c.req.path,
    status: c.res.status,
    userId,
    workspaceId,
    durationMs,
  });
});
