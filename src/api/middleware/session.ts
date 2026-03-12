import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "@/api/context";
import { auth } from "@/auth/auth";

export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!result) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  c.set("user", result.user as AppEnv["Variables"]["user"]);
  c.set("session", result.session as AppEnv["Variables"]["session"]);
  await next();
});
