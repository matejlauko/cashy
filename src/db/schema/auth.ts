import {
  sqliteTable,
  text,
  integer,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Instants are stored as epoch milliseconds (UTC); calendar dates as
// 'YYYY-MM-DD' text.
export const timestampMs = (name: string) =>
  integer(name, { mode: "timestamp_ms" });
export const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

// ─── user (Better Auth canonical + google_sub extension) ────────────────────
export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    image: text("image"),
    createdAt: timestampMs("created_at").notNull().default(nowMs),
    updatedAt: timestampMs("updated_at").notNull().default(nowMs),
    googleSub: text("google_sub"),
  },
  (t) => [
    uniqueIndex("user_email_ci_unique").on(sql`lower(${t.email})`),
    uniqueIndex("user_google_sub_unique")
      .on(t.googleSub)
      .where(sql`${t.googleSub} is not null`),
  ],
);

// ─── session (Better Auth canonical) ────────────────────────────────────────
export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestampMs("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestampMs("created_at").notNull().default(nowMs),
    updatedAt: timestampMs("updated_at").notNull().default(nowMs),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

// ─── user_account (Better Auth "account" table, renamed to avoid collision) ─
export const userAccount = sqliteTable(
  "user_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestampMs("access_token_expires_at"),
    refreshTokenExpiresAt: timestampMs("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestampMs("created_at").notNull().default(nowMs),
    updatedAt: timestampMs("updated_at").notNull().default(nowMs),
  },
  (t) => [
    index("user_account_user_id_idx").on(t.userId),
    unique("user_account_provider_account_unique").on(
      t.providerId,
      t.accountId,
    ),
  ],
);

// ─── verification (Better Auth canonical) ───────────────────────────────────
export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    createdAt: timestampMs("created_at").notNull().default(nowMs),
    updatedAt: timestampMs("updated_at").notNull().default(nowMs),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ─── apikey (Better Auth api-key plugin) ─────────────────────────────────────
export const apikey = sqliteTable(
  "apikey",
  {
    id: text("id").primaryKey(),
    configId: text("config_id").notNull(),
    name: text("name"),
    start: text("start"),
    prefix: text("prefix"),
    key: text("key").notNull(),
    // The owning user's id. No FK on purpose: the plugin manages rows itself
    // and the column is a generic reference in better-auth's schema.
    referenceId: text("reference_id").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestampMs("last_refill_at"),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    rateLimitEnabled: integer("rate_limit_enabled", { mode: "boolean" }),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    rateLimitMax: integer("rate_limit_max"),
    requestCount: integer("request_count"),
    remaining: integer("remaining"),
    lastRequest: timestampMs("last_request"),
    expiresAt: timestampMs("expires_at"),
    createdAt: timestampMs("created_at").notNull().default(nowMs),
    updatedAt: timestampMs("updated_at").notNull().default(nowMs),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (t) => [index("apikey_reference_id_idx").on(t.referenceId)],
);
