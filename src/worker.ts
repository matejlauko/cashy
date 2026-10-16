import { honoApp } from "@/api/app";
import { sql } from "@/db/client";
import { envError } from "@/env";

// Static assets (the pages and their JS/CSS) are served by Cloudflare before
// the Worker runs. Everything else lands here.
export default {
  async fetch(request, env, ctx) {
    if (envError) {
      // Missing vars or secrets: fail closed rather than run half-configured.
      console.error(envError);
      return new Response("Server misconfigured", { status: 500 });
    }

    const { pathname } = new URL(request.url);

    if (pathname === "/healthz") {
      return new Response("OK");
    }

    if (pathname === "/readyz") {
      try {
        await sql`SELECT 1`;
        return new Response("OK");
      } catch {
        return new Response("Service Unavailable", { status: 503 });
      }
    }

    // Delegate all other requests (including /api/*) to Hono.
    return honoApp.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
