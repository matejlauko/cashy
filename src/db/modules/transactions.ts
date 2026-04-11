import { sql } from "@/db/client";
import { bigintToSafeNumber } from "@/lib/money";
import {
  today,
  currentMonthStart,
  nextMonthStart,
  monthStartFromKey,
  monthEndFromKey,
  computeFromRecurringDate,
} from "@/lib/date";
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
} from "@/schemas/transactions";

// ─── Domain error ────────────────────────────────────────────────────────────

export class TransactionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TransactionError";
  }
}

// ─── Return types ────────────────────────────────────────────────────────────

export type TransactionRow = {
  id: string;
  name: string;
  type: "income" | "expense";
  /** Always positive (raw DB value) */
  amountMinor: number;
  /** Positive for income, negative for expense */
  signedAmount: number;
  transactionDate: string;
  financialAccountId: string;
  accountName: string;
  createdAt: string;
  updatedAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapRow(r: Record<string, unknown>): TransactionRow {
  const amountMinor = bigintToSafeNumber(r.amount_minor as bigint);
  const type = r.type as "income" | "expense";
  return {
    id: r.id as string,
    name: r.name as string,
    type,
    amountMinor,
    signedAmount: type === "income" ? amountMinor : -amountMinor,
    transactionDate:
      r.transaction_date instanceof Date
        ? r.transaction_date.toISOString().slice(0, 10)
        : String(r.transaction_date),
    financialAccountId: r.financial_account_id as string,
    accountName: r.account_name as string,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listCurrentMonth(
  workspaceId: string,
): Promise<TransactionRow[]> {
  const monthStart = currentMonthStart();
  const monthEnd = nextMonthStart();

  const rows = await sql`
    SELECT
      ft.id,
      ft.name,
      ft.type,
      ft.amount_minor,
      ft.transaction_date,
      ft.financial_account_id,
      fa.name AS account_name,
      ft.created_at,
      ft.updated_at
    FROM financial_transaction ft
    JOIN financial_account fa
      ON fa.id = ft.financial_account_id
      AND fa.workspace_id = ft.workspace_id
    WHERE ft.workspace_id = ${workspaceId}
      AND ft.transaction_date >= ${monthStart}
      AND ft.transaction_date < ${monthEnd}
      AND ft.deleted_at IS NULL
    ORDER BY ft.transaction_date DESC, ft.created_at DESC
  `;
  return rows.map(mapRow);
}

export async function listRecent(
  workspaceId: string,
  limit: number,
  monthKey: string,
): Promise<TransactionRow[]> {
  const monthStart = monthStartFromKey(monthKey);
  const monthEnd = monthEndFromKey(monthKey);

  const rows = await sql`
    SELECT
      ft.id,
      ft.name,
      ft.type,
      ft.amount_minor,
      ft.transaction_date,
      ft.financial_account_id,
      fa.name AS account_name,
      ft.created_at,
      ft.updated_at
    FROM financial_transaction ft
    JOIN financial_account fa
      ON fa.id = ft.financial_account_id
      AND fa.workspace_id = ft.workspace_id
    WHERE ft.workspace_id = ${workspaceId}
      AND ft.transaction_date >= ${monthStart}
      AND ft.transaction_date < ${monthEnd}
      AND ft.deleted_at IS NULL
    ORDER BY ft.transaction_date DESC, ft.created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(mapRow);
}

export async function getById(
  id: string,
  workspaceId: string,
): Promise<TransactionRow | null> {
  const rows = await sql`
    SELECT
      ft.id,
      ft.name,
      ft.type,
      ft.amount_minor,
      ft.transaction_date,
      ft.financial_account_id,
      fa.name AS account_name,
      ft.created_at,
      ft.updated_at
    FROM financial_transaction ft
    JOIN financial_account fa
      ON fa.id = ft.financial_account_id
      AND fa.workspace_id = ft.workspace_id
    WHERE ft.id = ${id}
      AND ft.workspace_id = ${workspaceId}
      AND ft.deleted_at IS NULL
  `;
  if (rows.length === 0) return null;
  return mapRow(rows[0]!);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function create(
  workspaceId: string,
  userId: string,
  data: CreateTransactionInput,
): Promise<TransactionRow> {
  const currentDate = today();
  if (data.transactionDate > currentDate) {
    throw new TransactionError(
      "INVALID_DATE_RANGE",
      "Cannot create transactions for future dates",
    );
  }

  const transactionId = crypto.randomUUID();

  await sql.begin(async (tx) => {
    // Verify account is active and in workspace
    const accountRows = await tx`
      SELECT id FROM financial_account
      WHERE id = ${data.financialAccountId}
        AND workspace_id = ${workspaceId}
        AND archived_at IS NULL
      LIMIT 1
    `;
    if (accountRows.length === 0) {
      throw new TransactionError(
        "ACCOUNT_NOT_FOUND",
        "Account not found or is archived",
      );
    }

    await tx`
      INSERT INTO financial_transaction (
        id, workspace_id, financial_account_id, name, type,
        amount_minor, transaction_date,
        created_by_user_id, updated_by_user_id
      ) VALUES (
        ${transactionId}, ${workspaceId}, ${data.financialAccountId},
        ${data.name}, ${data.type}, ${data.amountMinor},
        ${data.transactionDate}, ${userId}, ${userId}
      )
    `;
  });

  const transaction = await getById(transactionId, workspaceId);
  if (!transaction) {
    throw new Error("Created transaction could not be loaded");
  }
  return transaction;
}

export async function update(
  id: string,
  workspaceId: string,
  userId: string,
  data: UpdateTransactionInput,
): Promise<TransactionRow | null> {
  if (data.transactionDate !== undefined && data.transactionDate > today()) {
    throw new TransactionError(
      "INVALID_DATE_RANGE",
      "Cannot set transaction date to a future date",
    );
  }

  // Check transaction exists and is not soft-deleted
  const existing = await sql`
    SELECT
      id,
      name,
      type,
      amount_minor,
      transaction_date,
      financial_account_id,
      deleted_at
    FROM financial_transaction
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
    LIMIT 1
  `;

  if (existing.length === 0) {
    return null; // not found
  }

  if (existing[0]!.deleted_at !== null) {
    throw new TransactionError(
      "TRANSACTION_DELETED",
      "Cannot update a deleted transaction",
    );
  }

  const existingRow = existing[0]!;
  const existingAccountId = existingRow.financial_account_id as string;
  const nextAccountId = data.financialAccountId ?? existingAccountId;

  // If account changed, verify new account is active and in workspace
  if (nextAccountId !== existingAccountId) {
    const accountRows = await sql`
      SELECT id FROM financial_account
      WHERE id = ${nextAccountId}
        AND workspace_id = ${workspaceId}
        AND archived_at IS NULL
      LIMIT 1
    `;
    if (accountRows.length === 0) {
      throw new TransactionError(
        "ACCOUNT_NOT_FOUND",
        "Account not found or is archived",
      );
    }
  }

  const nextName = data.name ?? (existingRow.name as string);
  const nextType = data.type ?? (existingRow.type as "income" | "expense");
  const nextAmountMinor =
    data.amountMinor ??
    bigintToSafeNumber(existingRow.amount_minor as bigint);
  const nextTransactionDate =
    data.transactionDate ?? String(existingRow.transaction_date);

  await sql`
    UPDATE financial_transaction
    SET
      name = ${nextName},
      financial_account_id = ${nextAccountId},
      type = ${nextType},
      amount_minor = ${nextAmountMinor},
      transaction_date = ${nextTransactionDate},
      updated_at = now(),
      updated_by_user_id = ${userId}
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
      AND deleted_at IS NULL
  `;

  return getById(id, workspaceId);
}

export async function softDelete(
  id: string,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const existing = await sql`
    SELECT id, deleted_at
    FROM financial_transaction
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
    LIMIT 1
  `;

  if (existing.length === 0) {
    return false; // not found
  }

  // Idempotent: already deleted is success
  if (existing[0]!.deleted_at !== null) {
    return true;
  }

  const rows = await sql`
    UPDATE financial_transaction
    SET
      deleted_at = now(),
      deleted_by_user_id = ${userId},
      updated_at = now(),
      updated_by_user_id = ${userId}
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
      AND deleted_at IS NULL
    RETURNING id
  `;

  return rows.length > 0;
}

export async function createFromRecurring(
  workspaceId: string,
  userId: string,
  recurringId: string,
): Promise<TransactionRow> {
  const transactionId = crypto.randomUUID();

  await sql.begin(async (tx) => {
    const recurringRows = await tx`
      SELECT id, name, financial_account_id, type, amount_minor, day_of_month
      FROM recurring_transaction
      WHERE id = ${recurringId}
        AND workspace_id = ${workspaceId}
        AND archived_at IS NULL
      LIMIT 1
    `;
    if (recurringRows.length === 0) {
      throw new TransactionError(
        "NOT_FOUND",
        "Recurring transaction not found",
      );
    }
    const recurring = recurringRows[0]!;

    const financialAccountId = (recurring.financial_account_id as string | null) ?? null;
    if (!financialAccountId) {
      throw new TransactionError(
        "MISSING_ACCOUNT",
        "Set a default account on this recurring item first",
      );
    }

    const transactionDate = computeFromRecurringDate(
      Number(recurring.day_of_month),
      today(),
    );

    const monthStart = currentMonthStart();
    const monthEnd = nextMonthStart();
    const duplicateRows = await tx`
      SELECT id FROM financial_transaction
      WHERE recurring_transaction_id = ${recurringId}
        AND workspace_id = ${workspaceId}
        AND transaction_date >= ${monthStart}
        AND transaction_date < ${monthEnd}
        AND deleted_at IS NULL
      LIMIT 1
    `;
    if (duplicateRows.length > 0) {
      throw new TransactionError(
        "ALREADY_ADDED",
        "A transaction for this recurring item already exists this month",
      );
    }

    const accountRows = await tx`
      SELECT id FROM financial_account
      WHERE id = ${financialAccountId}
        AND workspace_id = ${workspaceId}
        AND archived_at IS NULL
      LIMIT 1
    `;
    if (accountRows.length === 0) {
      throw new TransactionError(
        "ACCOUNT_NOT_FOUND",
        "Account not found or is archived",
      );
    }

    await tx`
      INSERT INTO financial_transaction (
        id, workspace_id, financial_account_id, name, type,
        amount_minor, transaction_date, recurring_transaction_id,
        created_by_user_id, updated_by_user_id
      ) VALUES (
        ${transactionId}, ${workspaceId}, ${financialAccountId},
        ${recurring.name as string}, ${recurring.type as "income" | "expense"},
        ${recurring.amount_minor as bigint}, ${transactionDate}, ${recurringId},
        ${userId}, ${userId}
      )
    `;
  });

  const transaction = await getById(transactionId, workspaceId);
  if (!transaction) {
    throw new Error("Created transaction could not be loaded");
  }
  return transaction;
}
