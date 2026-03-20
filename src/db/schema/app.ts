import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  date,
  bigint,
  integer,
  uniqueIndex,
  index,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

// ─── Enums ──────────────────────────────────────────────────────────────────
export const accountTypeEnum = pgEnum("account_type", [
  "cash",
  "checking",
  "savings",
  "credit_card",
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
]);

// ─── workspace ──────────────────────────────────────────────────────────────
export const workspace = pgTable("workspace", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedByUserId: text("updated_by_user_id").notNull(),
});

// ─── workspace_membership ───────────────────────────────────────────────────
export const workspaceMembership = pgTable(
  "workspace_membership",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: text("deleted_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedByUserId: text("updated_by_user_id").notNull(),
  },
  (t) => [
    uniqueIndex("workspace_membership_workspace_user_unique")
      .on(t.workspaceId, t.userId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

// ─── financial_account ──────────────────────────────────────────────────────
export const financialAccount = pgTable(
  "financial_account",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id),
    name: text("name").notNull(),
    institutionName: text("institution_name"),
    type: accountTypeEnum("type").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: text("archived_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedByUserId: text("updated_by_user_id").notNull(),
  },
  (t) => [
    // Composite unique needed as FK target for workspace isolation
    unique("financial_account_id_workspace_unique").on(t.workspaceId, t.id),
    // Case-insensitive unique account name per workspace
    uniqueIndex("financial_account_workspace_name_unique").on(
      t.workspaceId,
      sql`lower(${t.name})`,
    ),
    // Partial index: active accounts per workspace
    index("financial_account_workspace_active_idx")
      .on(t.workspaceId)
      .where(sql`${t.archivedAt} is null`),
  ],
);

// ─── balance_snapshot ───────────────────────────────────────────────────────
export const balanceSnapshot = pgTable(
  "balance_snapshot",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id),
    financialAccountId: text("financial_account_id").notNull(),
    effectiveDate: date("effective_date").notNull(),
    amountMinorRaw: bigint("amount_minor_raw", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedByUserId: text("updated_by_user_id").notNull(),
  },
  (t) => [
    // Composite FK: workspace isolation
    foreignKey({
      columns: [t.financialAccountId, t.workspaceId],
      foreignColumns: [financialAccount.id, financialAccount.workspaceId],
      name: "balance_snapshot_account_workspace_fk",
    }),
    // Primary lookup: latest snapshot for account on/before a date
    index("balance_snapshot_account_date_idx").on(
      t.financialAccountId,
      sql`${t.effectiveDate} DESC`,
      sql`${t.createdAt} DESC`,
      sql`${t.id} DESC`,
    ),
    // Workspace-wide date lookup
    index("balance_snapshot_workspace_date_idx").on(
      t.workspaceId,
      sql`${t.effectiveDate} DESC`,
    ),
  ],
);

// ─── financial_transaction ──────────────────────────────────────────────────
export const financialTransaction = pgTable(
  "financial_transaction",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id),
    financialAccountId: text("financial_account_id").notNull(),
    name: text("name").notNull(),
    type: transactionTypeEnum("type").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    transactionDate: date("transaction_date").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: text("deleted_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedByUserId: text("updated_by_user_id").notNull(),
  },
  (t) => [
    // Composite FK: workspace isolation
    foreignKey({
      columns: [t.financialAccountId, t.workspaceId],
      foreignColumns: [financialAccount.id, financialAccount.workspaceId],
      name: "financial_transaction_account_workspace_fk",
    }),
    // Partial index: active transactions by workspace and date
    index("financial_transaction_workspace_date_idx")
      .on(t.workspaceId, sql`${t.transactionDate} DESC`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

// ─── recurring_transaction ──────────────────────────────────────────────────
export const recurringTransaction = pgTable(
  "recurring_transaction",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id),
    name: text("name").notNull(),
    financialAccountId: text("financial_account_id"),
    type: transactionTypeEnum("type").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    dayOfMonth: integer("day_of_month").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: text("archived_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedByUserId: text("updated_by_user_id").notNull(),
  },
  (t) => [
    // Composite FK: workspace isolation (nullable – account is optional)
    foreignKey({
      columns: [t.financialAccountId, t.workspaceId],
      foreignColumns: [financialAccount.id, financialAccount.workspaceId],
      name: "recurring_transaction_account_workspace_fk",
    }),
    // Partial index: active recurring transactions per workspace
    index("recurring_transaction_workspace_active_idx")
      .on(t.workspaceId)
      .where(sql`${t.archivedAt} is null`),
  ],
);

// ─── budget_item ────────────────────────────────────────────────────────────
export const budgetItem = pgTable(
  "budget_item",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id),
    name: text("name").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedByUserId: text("updated_by_user_id").notNull(),
  },
  (t) => [
    index("budget_item_workspace_idx").on(t.workspaceId),
  ],
);
