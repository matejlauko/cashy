import { sql } from "@/db/client";
import { bigintToSafeNumber } from "@/lib/money";
import { today } from "@/lib/date";
import type { CreateAccountInput, UpdateAccountInput } from "@/schemas/accounts";

const ACCOUNT_NAME_UNIQUE_CONSTRAINT = "financial_account_workspace_name_unique";

// ─── Domain error ────────────────────────────────────────────────────────────

export class AccountError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

// ─── Return types ────────────────────────────────────────────────────────────

export type AccountRow = {
  id: string;
  name: string;
  institutionName: string | null;
  type: "cash" | "checking" | "savings" | "credit_card";
  currentBalance: number;
  createdAt: string;
  updatedAt: string;
};

export type ArchivedAccountRow = AccountRow & {
  archivedAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapAccountRow(r: Record<string, unknown>): AccountRow {
  return {
    id: r.id as string,
    name: r.name as string,
    institutionName: (r.institution_name as string) ?? null,
    type: r.type as AccountRow["type"],
    currentBalance: bigintToSafeNumber(r.current_balance as bigint),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function isUniqueNameViolation(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as { code: string }).code === "23505" &&
    ("constraint" in err
      ? (err as { constraint: string }).constraint === ACCOUNT_NAME_UNIQUE_CONSTRAINT
      : "constraint_name" in err
        ? (err as { constraint_name: string }).constraint_name ===
          ACCOUNT_NAME_UNIQUE_CONSTRAINT
        : err.message?.includes(ACCOUNT_NAME_UNIQUE_CONSTRAINT))
  );
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listActive(workspaceId: string): Promise<AccountRow[]> {
  const rows = await sql`
    SELECT
      fa.id,
      fa.name,
      fa.institution_name,
      fa.type,
      fa.created_at,
      fa.updated_at,
      COALESCE(
        CASE WHEN fa.type = 'credit_card' THEN -latest.amount_minor_raw
             ELSE latest.amount_minor_raw
        END,
        0
      ) AS current_balance
    FROM financial_account fa
    LEFT JOIN LATERAL (
      SELECT bs.amount_minor_raw
      FROM balance_snapshot bs
      WHERE bs.financial_account_id = fa.id
        AND bs.workspace_id = fa.workspace_id
      ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
      LIMIT 1
    ) latest ON true
    WHERE fa.workspace_id = ${workspaceId}
      AND fa.archived_at IS NULL
    ORDER BY fa.name ASC
  `;
  return rows.map(mapAccountRow);
}

export async function listActiveAsOf(
  workspaceId: string,
  asOfDate: string,
): Promise<AccountRow[]> {
  const rows = await sql`
    SELECT
      fa.id,
      fa.name,
      fa.institution_name,
      fa.type,
      fa.created_at,
      fa.updated_at,
      COALESCE(
        CASE WHEN fa.type = 'credit_card' THEN -latest.amount_minor_raw
             ELSE latest.amount_minor_raw
        END,
        0
      ) AS current_balance
    FROM financial_account fa
    LEFT JOIN LATERAL (
      SELECT bs.amount_minor_raw
      FROM balance_snapshot bs
      WHERE bs.financial_account_id = fa.id
        AND bs.workspace_id = fa.workspace_id
        AND bs.effective_date <= ${asOfDate}
      ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
      LIMIT 1
    ) latest ON true
    WHERE fa.workspace_id = ${workspaceId}
      AND fa.archived_at IS NULL
    ORDER BY fa.name ASC
  `;
  return rows.map(mapAccountRow);
}

export async function listArchived(
  workspaceId: string,
): Promise<ArchivedAccountRow[]> {
  const rows = await sql`
    SELECT
      fa.id,
      fa.name,
      fa.institution_name,
      fa.type,
      fa.created_at,
      fa.updated_at,
      fa.archived_at,
      COALESCE(
        CASE WHEN fa.type = 'credit_card' THEN -latest.amount_minor_raw
             ELSE latest.amount_minor_raw
        END,
        0
      ) AS current_balance
    FROM financial_account fa
    LEFT JOIN LATERAL (
      SELECT bs.amount_minor_raw
      FROM balance_snapshot bs
      WHERE bs.financial_account_id = fa.id
        AND bs.workspace_id = fa.workspace_id
      ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
      LIMIT 1
    ) latest ON true
    WHERE fa.workspace_id = ${workspaceId}
      AND fa.archived_at IS NOT NULL
    ORDER BY fa.name ASC
  `;
  return rows.map((r: Record<string, unknown>) => ({
    ...mapAccountRow(r),
    archivedAt: String(r.archived_at),
  }));
}

export async function getById(
  id: string,
  workspaceId: string,
): Promise<AccountRow | null> {
  const rows = await sql`
    SELECT
      fa.id,
      fa.name,
      fa.institution_name,
      fa.type,
      fa.created_at,
      fa.updated_at,
      COALESCE(
        CASE WHEN fa.type = 'credit_card' THEN -latest.amount_minor_raw
             ELSE latest.amount_minor_raw
        END,
        0
      ) AS current_balance
    FROM financial_account fa
    LEFT JOIN LATERAL (
      SELECT bs.amount_minor_raw
      FROM balance_snapshot bs
      WHERE bs.financial_account_id = fa.id
        AND bs.workspace_id = fa.workspace_id
      ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
      LIMIT 1
    ) latest ON true
    WHERE fa.id = ${id}
      AND fa.workspace_id = ${workspaceId}
  `;
  if (rows.length === 0) return null;
  return mapAccountRow(rows[0]!);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function create(
  workspaceId: string,
  userId: string,
  data: CreateAccountInput,
): Promise<AccountRow> {
  const accountId = crypto.randomUUID();
  const snapshotId = crypto.randomUUID();
  const effectiveDate = today();
  const institutionName = data.institutionName?.trim() || null;

  try {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO financial_account (
          id, workspace_id, name, institution_name, type,
          created_by_user_id, updated_by_user_id
        ) VALUES (
          ${accountId}, ${workspaceId}, ${data.name}, ${institutionName}, ${data.type},
          ${userId}, ${userId}
        )
      `;

      await tx`
        INSERT INTO balance_snapshot (
          id, workspace_id, financial_account_id, effective_date, amount_minor_raw,
          created_by_user_id, updated_by_user_id
        ) VALUES (
          ${snapshotId}, ${workspaceId}, ${accountId}, ${effectiveDate}, ${data.initialBalance},
          ${userId}, ${userId}
        )
      `;
    });
  } catch (err) {
    if (isUniqueNameViolation(err)) {
      throw new AccountError(
        "ACCOUNT_NAME_TAKEN",
        "An account with this name already exists in this workspace",
      );
    }
    throw err;
  }

  const account = await getById(accountId, workspaceId);
  if (!account) {
    throw new Error("Created account could not be loaded");
  }
  return account;
}

export async function update(
  id: string,
  workspaceId: string,
  userId: string,
  data: UpdateAccountInput,
): Promise<AccountRow | null> {
  const institutionName = data.institutionName?.trim() || null;

  try {
    const rows = await sql`
      UPDATE financial_account
      SET
        name = ${data.name},
        institution_name = ${institutionName},
        type = ${data.type},
        updated_at = now(),
        updated_by_user_id = ${userId}
      WHERE id = ${id}
        AND workspace_id = ${workspaceId}
        AND archived_at IS NULL
      RETURNING id
    `;

    if (rows.length === 0) {
      // Distinguish not-found vs archived
      const check = await sql`
        SELECT archived_at FROM financial_account
        WHERE id = ${id} AND workspace_id = ${workspaceId}
      `;
      if (check.length > 0 && check[0]!.archived_at !== null) {
        throw new AccountError(
          "ACCOUNT_ARCHIVED",
          "Cannot update an archived account",
        );
      }
      return null; // not found
    }
  } catch (err) {
    if (err instanceof AccountError) throw err;
    if (isUniqueNameViolation(err)) {
      throw new AccountError(
        "ACCOUNT_NAME_TAKEN",
        "An account with this name already exists in this workspace",
      );
    }
    throw err;
  }

  return getById(id, workspaceId);
}

export async function archive(
  id: string,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const accountRows = await sql`
    SELECT archived_at
    FROM financial_account
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
    LIMIT 1
  `;

  if (accountRows.length === 0) {
    return false;
  }

  if (accountRows[0]!.archived_at !== null) {
    return false;
  }

  // Check latest effective balance (raw, not negated — zero means zero owed for credit cards too)
  const balanceRows = await sql`
    SELECT bs.amount_minor_raw
    FROM balance_snapshot bs
    WHERE bs.financial_account_id = ${id}
      AND bs.workspace_id = ${workspaceId}
    ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
    LIMIT 1
  `;

  if (balanceRows.length > 0) {
    const rawBalance = balanceRows[0]!.amount_minor_raw as bigint;
    if (rawBalance !== 0n) {
      throw new AccountError(
        "ACCOUNT_BALANCE_NOT_ZERO",
        "Account balance must be zero before archiving",
      );
    }
  }

  const rows = await sql`
    UPDATE financial_account
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
