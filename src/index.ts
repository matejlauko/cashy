import { honoApp } from "@/api/app";
import { auth } from "@/auth/auth";
import { sql } from "@/db/client";
import { env } from "@/env";
import { logger } from "@/logger";
import index from "./index.html";
import login from "./login.html";

let server: ReturnType<typeof Bun.serve>;

server = Bun.serve({
  port: env.PORT,

  routes: {
    // HTML entrypoints at internal paths — Bun requires HTMLBundle as a
    // static route value (it cannot be returned from a handler function).
    // Public / and /login go through fetch() with auth checks below.
    // "/_app": index,
    // "/_login": login,
    "/": index,
    "/login": login,

    "/healthz": new Response("OK"),

    "/readyz": async () => {
      try {
        await sql`SELECT 1`;
        return new Response("OK");
      } catch {
        return new Response("Service Unavailable", { status: 503 });
      }
    },
  },

  async fetch(req): Promise<Response> {
    const url = new URL(req.url);

    // // Auth-based redirects for HTML entrypoints.
    // // Uses auth.api.getSession() directly (not Hono middleware).
    // if (url.pathname === "/") {
    //   try {
    //     const session = await auth.api.getSession({
    //       headers: req.headers,
    //     });
    //     if (!session) {
    //       return Response.redirect(new URL("/login", url), 302);
    //     }
    //   } catch {
    //     // Session check failed — redirect to login (fail secure)
    //     return Response.redirect(new URL("/login", url), 302);
    //   }
    //   return server.fetch(
    //     new Request(new URL("/_app", url), { headers: req.headers }),
    //   );
    // }

    // if (url.pathname === "/login") {
    //   try {
    //     const session = await auth.api.getSession({
    //       headers: req.headers,
    //     });
    //     if (session) {
    //       return Response.redirect(new URL("/", url), 302);
    //     }
    //   } catch {
    //     // Session check failed — show login page (fail secure)
    //   }
    //   return server.fetch(
    //     new Request(new URL("/_login", url), { headers: req.headers }),
    //   );
    // }

    // Delegate all other requests (including /api/*) to Hono.
    return honoApp.fetch(req);
  },

  development: env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

logger.info("Server started", {
  route: server.url.toString(),
  method: null,
  status: null,
});
