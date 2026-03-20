import { sql } from "@/db/client";
import { bigintToSafeNumber } from "@/lib/money";
import type {
  CreateRecurringTransactionInput,
  UpdateRecurringTransactionInput,
} from "@/schemas/recurring-transactions";

// ─── Domain error ────────────────────────────────────────────────────────────

export class RecurringTransactionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RecurringTransactionError";
  }
}

// ─── Return types ────────────────────────────────────────────────────────────

export type RecurringTransactionRow = {
  id: string;
  name: string;
  financialAccountId: string | null;
  type: "income" | "expense";
  /** Always positive (raw DB value) */
  amountMinor: number;
  /** Positive for income, negative for expense */
  signedAmount: number;
  dayOfMonth: number;
  createdAt: string;
  updatedAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapRow(r: Record<string, unknown>): RecurringTransactionRow {
  const amountMinor = bigintToSafeNumber(r.amount_minor as bigint);
  const type = r.type as "income" | "expense";
  return {
    id: r.id as string,
    name: r.name as string,
    financialAccountId: (r.financial_account_id as string) ?? null,
    type,
    amountMinor,
    signedAmount: type === "income" ? amountMinor : -amountMinor,
    dayOfMonth: Number(r.day_of_month),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listActive(
  workspaceId: string,
): Promise<RecurringTransactionRow[]> {
  const rows = await sql`
    SELECT
      id, name, financial_account_id, type, amount_minor,
      day_of_month, created_at, updated_at
    FROM recurring_transaction
    WHERE workspace_id = ${workspaceId}
      AND archived_at IS NULL
    ORDER BY day_of_month ASC, name ASC
  `;
  return rows.map(mapRow);
}

export async function getById(
  id: string,
  workspaceId: string,
): Promise<RecurringTransactionRow | null> {
  const rows = await sql`
    SELECT
      id, name, financial_account_id, type, amount_minor,
      day_of_month, created_at, updated_at
    FROM recurring_transaction
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
      AND archived_at IS NULL
  `;
  if (rows.length === 0) return null;
  return mapRow(rows[0]!);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function create(
  workspaceId: string,
  userId: string,
  data: CreateRecurringTransactionInput,
): Promise<RecurringTransactionRow> {
  const id = crypto.randomUUID();
  const financialAccountId = data.financialAccountId || null;

  await sql`
    INSERT INTO recurring_transaction (
      id, workspace_id, name, financial_account_id, type,
      amount_minor, day_of_month,
      created_by_user_id, updated_by_user_id
    ) VALUES (
      ${id}, ${workspaceId}, ${data.name}, ${financialAccountId},
      ${data.type}, ${data.amountMinor}, ${data.dayOfMonth},
      ${userId}, ${userId}
    )
  `;

  const row = await getById(id, workspaceId);
  if (!row) {
    throw new Error("Created recurring transaction could not be loaded");
  }
  return row;
}

export async function update(
  id: string,
  workspaceId: string,
  userId: string,
  data: UpdateRecurringTransactionInput,
): Promise<RecurringTransactionRow | null> {
  const existing = await sql`
    SELECT
      id, name, financial_account_id, type, amount_minor,
      day_of_month, archived_at
    FROM recurring_transaction
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
    LIMIT 1
  `;

  if (existing.length === 0) {
    return null;
  }

  if (existing[0]!.archived_at !== null) {
    throw new RecurringTransactionError(
      "RECURRING_ARCHIVED",
      "Cannot update an archived recurring transaction",
    );
  }

  const row = existing[0]!;
  const nextName = data.name ?? (row.name as string);
  const nextFinancialAccountId =
    data.financialAccountId !== undefined
      ? data.financialAccountId || null
      : (row.financial_account_id as string | null);
  const nextType = data.type ?? (row.type as "income" | "expense");
  const nextAmountMinor =
    data.amountMinor ?? bigintToSafeNumber(row.amount_minor as bigint);
  const nextDayOfMonth = data.dayOfMonth ?? Number(row.day_of_month);

  await sql`
    UPDATE recurring_transaction
    SET
      name = ${nextName},
      financial_account_id = ${nextFinancialAccountId},
      type = ${nextType},
      amount_minor = ${nextAmountMinor},
      day_of_month = ${nextDayOfMonth},
      updated_at = now(),
      updated_by_user_id = ${userId}
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
      AND archived_at IS NULL
  `;

  return getById(id, workspaceId);
}

export async function archive(
  id: string,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const existing = await sql`
    SELECT id, archived_at
    FROM recurring_transaction
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
    LIMIT 1
  `;

  if (existing.length === 0) {
    return false;
  }

  // Idempotent: already archived is success
  if (existing[0]!.archived_at !== null) {
    return true;
  }

  const rows = await sql`
    UPDATE recurring_transaction
    SET
      archived_at = now(),
      archived_by_user_id = ${userId},
      updated_at = now(),
      updated_by_user_id = ${userId}
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
      AND archived_at IS NULL
    RETURNING id
  `;

  return rows.length > 0;
}
