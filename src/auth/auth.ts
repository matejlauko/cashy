import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { apiKey } from "@better-auth/api-key";
import { drizzleDb } from "@/db/drizzle";
import { sql } from "@/db/client";
import * as schema from "@/db/schema/auth";
import { env } from "@/env";
import { logger } from "@/logger";
import { checkAccessAndSync } from "./access-control";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(drizzleDb, {
    provider: "pg",
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
      const accounts =
        await sql`SELECT account_id FROM user_account WHERE user_id = ${userId} AND provider_id = 'google' LIMIT 1`;

      if (accounts.length === 0) {
        logger.warn("Auth deny: no Google provider account found", { userId });
        await ctx.context.internalAdapter.deleteSession(
          newSession.session.token,
        );
        throw ctx.redirect("/login?error=access_denied");
      }

      const googleSub = accounts[0].account_id;
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
