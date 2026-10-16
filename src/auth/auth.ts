import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { apiKey } from "@better-auth/api-key";
import { drizzleDb } from "@/db/drizzle";
import { sql } from "@/db/client";
import * as schema from "@/db/schema/auth";
import { env, isSecureOrigin } from "@/env";
import { logger } from "@/logger";
import { checkAccessAndSync } from "./access-control";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(drizzleDb, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      account: schema.userAccount,
      session: schema.session,
      verification: schema.verification,
      apikey: schema.apikey,
    },
  }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      prompt: "select_account",
      disableSignUp: true,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 45, // 45 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  advanced: {
    // Stated explicitly so cookie names never depend on NODE_ENV, which is
    // not reliably set on Workers.
    useSecureCookies: isSecureOrigin,
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
  },
  // The built-in limiter counts in isolate memory, which on Workers is
  // short-lived and per location, so it would not limit anything.
  rateLimit: { enabled: false },
  telemetry: { enabled: false },
  plugins: [
    apiKey({
      enableSessionForAPIKeys: true,
      // Plugin default is 32 — too short for the CLI's `cli-<hostname>-<date>`
      // key names (a long hostname like `foo-MacBook-Pro-2.local` overflows it).
      maximumNameLength: 128,
      // Plugin default is 10 requests/24h per key — far too low for the CLI
      // (bulk import makes one request per date). Server-level rate limiting
      // is unaffected by this.
      rateLimit: { enabled: false },
    }),
  ],
  user: {
    additionalFields: {
      googleSub: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const newSession = ctx.context.newSession;
      if (!newSession) return;

      // Only process OAuth callback completions
      if (!ctx.path.startsWith("/callback/")) return;

      const userId = newSession.user.id;

      // Get the Google provider account to extract the sub
      const accounts = await sql<{ account_id: string }>`
        SELECT account_id FROM user_account
        WHERE user_id = ${userId} AND provider_id = 'google' LIMIT 1`;

      const googleSub = accounts[0]?.account_id;
      if (!googleSub) {
        logger.warn("Auth deny: no Google provider account found", { userId });
        await ctx.context.internalAdapter.deleteSession(
          newSession.session.token,
        );
        throw ctx.redirect("/login?error=access_denied");
      }

      const result = await checkAccessAndSync({
        userId,
        providerAccountId: googleSub,
        providerEmail: newSession.user.email,
        providerName: newSession.user.name,
        providerImage: newSession.user.image ?? null,
      });

      if (!result.allowed) {
        await ctx.context.internalAdapter.deleteSession(
          newSession.session.token,
        );
        throw ctx.redirect("/login?error=access_denied");
      }
    }),
  },
});

// Warm-up. The first use of auth.api builds every endpoint, which is far more
// CPU than a request gets on the Workers free plan (10 ms); at module scope it
// is charged to the 1 s startup budget instead. Neither call does I/O.
await auth.$context;
await auth.api.getSession({ headers: new Headers() });
