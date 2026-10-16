import { env as bindings } from "cloudflare:workers";
import { z } from "zod";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

const envSchema = z.object({
  APP_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

export type LogLevel = (typeof LOG_LEVELS)[number];

const result = envSchema.safeParse(bindings);

/**
 * Null when the configuration is valid, otherwise a description of what is
 * missing. This is deliberately not thrown at module scope: Cloudflare runs
 * the module scope once to validate an upload, and an exception there would
 * make the Worker impossible to deploy. The fetch handler refuses every
 * request while this is set (see src/worker.ts).
 */
export const envError: string | null = result.success
  ? null
  : [
      "Environment validation failed:",
      ...result.error.issues.map(
        (issue) => `  ${issue.path.join(".")}: ${issue.message}`,
      ),
      "",
      "Check .dev.vars (local) or the Worker's vars and secrets.",
    ].join("\n");

// The empty fallback only lets module-scope code finish loading; no request
// is served with it.
export const env: z.infer<typeof envSchema> = result.success
  ? result.data
  : {
      APP_URL: "",
      BETTER_AUTH_SECRET: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      LOG_LEVEL: "info",
    };

/** True when the app is served over HTTPS (everywhere except local dev). */
export const isSecureOrigin = env.APP_URL.startsWith("https://");
