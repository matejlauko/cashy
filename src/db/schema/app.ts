import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  unique,
  foreignKey,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user, timestampMs, nowMs } from "./auth";

// ─── Enums (text + CHECK; SQLite has no enum type) ──────────────────────────
const ACCOUNT_TYPES = ["cash", "checking", "savings", "credit_card"] as const;
const TRANSACTION_TYPES = ["income", "expense"] as const;

// Calendar dates are 'YYYY-MM-DD' text.
const DATE_GLOB = sql.raw("'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'");

// ─── workspace ──────────────────────────────────────────────────────────────
export const workspace = sqliteTable("workspace", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestampMs("created_at").notNull().default(nowMs),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedAt: timestampMs("updated_at").notNull().default(nowMs),
  updatedByUserId: text("updated_by_user_id").notNull(),
});

// ─── workspace_membership ───────────────────────────────────────────────────
export const workspaceMembership = sqliteTable(
  "workspace_membership",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    deletedAt: timestampMs("deleted_at"),
    deletedByUserId: text("deleted_by_user_id"),
    createdAt: timestampMs("created_at").notNull().default(nowMs),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedAt: timestampMs("updated_at").notNull().default(nowMs),
    updatedByUserId: text("updated_by_user_id").notNull(),
  },
  (t) => [
    uniqueIndex("workspace_membership_workspace_user_unique")
      .on(t.workspaceId, t.userId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

// ─── financial_account ──────────────────────────────────────────────────────
export const financialAccount = sqliteTable(
  "financial_account",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id),
    name: text("name").notNull(),
    institutionName: text("institution_name"),
    type: text("type", { enum: ACCOUNT_TYPES }).notNull(),
    archivedAt: timestampMs("archived_at"),
    archivedByUserId: text("archived_by_user_id"),
    createdAt: timestampMs("created_at").notNull().default(nowMs),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedAt: timestampMs("updated_at").notNull().default(nowMs),
    updatedByUserId: text("updated_by_user_id").notNull(),
  },
  (t) => [
    // Composite unique needed as FK target for workspace isolation
    unique("financial_account_id_workspace_unique").on(t.workspaceId, t.id),
    // Case-insensitive unique account name per workspace (SQLite's lower()
    // folds ASCII only)
    uniqueIndex("financial_account_workspace_name_unique").on(
      t.workspaceId,
      sql`lower(${t.name})`,
    ),
    // Partial index: active accounts per workspace
    index("financial_account_workspace_active_idx")
      .on(t.workspaceId)
      .where(sql`${t.archivedAt} is null`),
    check(
      "financial_account_type_check",
      sql`${t.type} in ('cash', 'checking', 'savings', 'credit_card')`,
    ),
  ],
);

// ─── balance_snapshot ───────────────────────────────────────────────────────
export const balanceSnapshot = sqliteTable(
  "balance_snapshot",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id),
    financialAccountId: text("financial_account_id").notNull(),
    effectiveDate: text("effective_date").notNull(),
    amountMinorRaw: integer("amount_minor_raw", { mode: "number" }).notNull(),
    createdAt: timestampMs("created_at").notNull().default(nowMs),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedAt: timestampMs("updated_at").notNull().default(nowMs),
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
    check(
      "balance_snapshot_effective_date_check",
      sql`${t.effectiveDate} glob ${DATE_GLOB}`,
    ),
  ],
);

// ─── financial_transaction ──────────────────────────────────────────────────
export const financialTransaction = sqliteTable(
  "financial_transaction",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id),
    financialAccountId: text("financial_account_id").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: TRANSACTION_TYPES }).notNull(),
    amountMinor: integer("amount_minor", { mode: "number" }).notNull(),
    transactionDate: text("transaction_date").notNull(),
    recurringTransactionId: text("recurring_transaction_id"),
    deletedAt: timestampMs("deleted_at"),
    deletedByUserId: text("deleted_by_user_id"),
    createdAt: timestampMs("created_at").notNull().default(nowMs),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedAt: timestampMs("updated_at").notNull().default(nowMs),
    updatedByUserId: text("updated_by_user_id").notNull(),
  },
  (t) => [
    // Composite FK: workspace isolation
    foreignKey({
      columns: [t.financialAccountId, t.workspaceId],
      foreignColumns: [financialAccount.id, financialAccount.workspaceId],
      name: "financial_transaction_account_workspace_fk",
    }),
    foreignKey({
      columns: [t.recurringTransactionId, t.workspaceId],
      foreignColumns: [recurringTransaction.id, recurringTransaction.workspaceId],
      name: "financial_transaction_recurring_workspace_fk",
    }),
    // Partial index: active transactions by workspace and date
    index("financial_transaction_workspace_date_idx")
      .on(t.workspaceId, sql`${t.transactionDate} DESC`)
      .where(sql`${t.deletedAt} is null`),
    // financial_transaction_recurring_month_unique (one transaction per
    // recurring item per month) is defined in a custom migration:
    // drizzle-kit emits broken SQL for multi-argument index expressions.
    check(
      "financial_transaction_type_check",
      sql`${t.type} in ('income', 'expense')`,
    ),
    check(
      "financial_transaction_date_check",
      sql`${t.transactionDate} glob ${DATE_GLOB}`,
    ),
  ],
);

// ─── recurring_transaction ──────────────────────────────────────────────────
export const recurringTransaction = sqliteTable(
  "recurring_transaction",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id),
    name: text("name").notNull(),
    financialAccountId: text("financial_account_id"),
    type: text("type", { enum: TRANSACTION_TYPES }).notNull(),
    amountMinor: integer("amount_minor", { mode: "number" }).notNull(),
    dayOfMonth: integer("day_of_month").notNull(),
    archivedAt: timestampMs("archived_at"),
    archivedByUserId: text("archived_by_user_id"),
    createdAt: timestampMs("created_at").notNull().default(nowMs),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedAt: timestampMs("updated_at").notNull().default(nowMs),
    updatedByUserId: text("updated_by_user_id").notNull(),
  },
  (t) => [
    // Composite unique needed as FK target for workspace isolation
    unique("recurring_transaction_id_workspace_unique").on(t.workspaceId, t.id),
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
    check(
      "recurring_transaction_type_check",
      sql`${t.type} in ('income', 'expense')`,
    ),
  ],
);

// ─── budget_item ────────────────────────────────────────────────────────────
export const budgetItem = sqliteTable(
  "budget_item",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id),
    name: text("name").notNull(),
    amountMinor: integer("amount_minor", { mode: "number" }).notNull(),
    createdAt: timestampMs("created_at").notNull().default(nowMs),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedAt: timestampMs("updated_at").notNull().default(nowMs),
    updatedByUserId: text("updated_by_user_id").notNull(),
  },
  (t) => [
    index("budget_item_workspace_idx").on(t.workspaceId),
  ],
);
