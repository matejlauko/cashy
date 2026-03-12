import { z } from "zod";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  APP_URL: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  LOG_LEVEL: z.enum(LOG_LEVELS),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;
export type LogLevel = (typeof LOG_LEVELS)[number];

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const lines = result.error.issues.map(
    (issue) => `  ${issue.path.join(".")}: ${issue.message}`,
  );
  console.error(
    [
      "Environment validation failed:",
      ...lines,
      "",
      "Check your .env file or environment variables.",
    ].join("\n"),
  );
  process.exit(1);
}

export const env = result.data;
