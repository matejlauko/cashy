import { sql } from "@/db/client";
import { bigintToSafeNumber } from "@/lib/money";
import { today } from "@/lib/date";
import type { BulkBalanceUpdateInput } from "@/schemas/balance-snapshots";

// ─── Domain error ────────────────────────────────────────────────────────────

export class BalanceSnapshotError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BalanceSnapshotError";
  }
}

// ─── Return types ────────────────────────────────────────────────────────────

export type PrefillRow = {
  financialAccountId: string;
  accountName: string;
  accountType: "cash" | "checking" | "savings" | "credit_card";
  amountMinorRaw: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapPrefillRow(r: Record<string, unknown>): PrefillRow {
  return {
    financialAccountId: r.financial_account_id as string,
    accountName: r.account_name as string,
    accountType: r.account_type as PrefillRow["accountType"],
    amountMinorRaw: bigintToSafeNumber(r.amount_minor_raw as bigint),
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getPrefillByDate(
  workspaceId: string,
  effectiveDate: string,
): Promise<PrefillRow[]> {
  const rows = await sql`
    SELECT
      fa.id AS financial_account_id,
      fa.name AS account_name,
      fa.type AS account_type,
      COALESCE(latest.amount_minor_raw, 0) AS amount_minor_raw
    FROM financial_account fa
    LEFT JOIN (
      SELECT DISTINCT ON (bs.financial_account_id)
        bs.financial_account_id,
        bs.amount_minor_raw
      FROM balance_snapshot bs
      WHERE bs.workspace_id = ${workspaceId}
        AND bs.effective_date <= ${effectiveDate}
      ORDER BY bs.financial_account_id, bs.effective_date DESC, bs.created_at DESC, bs.id DESC
    ) latest ON latest.financial_account_id = fa.id
    WHERE fa.workspace_id = ${workspaceId}
      AND fa.archived_at IS NULL
    ORDER BY fa.name ASC
  `;
  return rows.map(mapPrefillRow);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function bulkCreate(
  workspaceId: string,
  userId: string,
  effectiveDate: string,
  snapshots: BulkBalanceUpdateInput["snapshots"],
): Promise<void> {
  const currentDate = today();
  if (effectiveDate > currentDate) {
    throw new BalanceSnapshotError(
      "INVALID_DATE_RANGE",
      "Cannot create snapshots for future dates",
    );
  }

  await sql.begin(async (tx) => {
    const activeRows = await tx`
      SELECT id FROM financial_account
      WHERE workspace_id = ${workspaceId}
        AND archived_at IS NULL
      ORDER BY id
    `;

    const activeIds = new Set(
      activeRows.map((r: Record<string, unknown>) => r.id as string),
    );
    const submittedIds = new Set(snapshots.map((s) => s.financialAccountId));

    if (
      snapshots.length !== activeIds.size ||
      activeIds.size !== submittedIds.size ||
      ![...submittedIds].every((id) => activeIds.has(id))
    ) {
      throw new BalanceSnapshotError(
        "SNAPSHOT_ACCOUNT_MISMATCH",
        "Submitted accounts do not match active accounts",
      );
    }

    for (const snapshot of snapshots) {
      const snapshotId = crypto.randomUUID();
      await tx`
        INSERT INTO balance_snapshot (
          id, workspace_id, financial_account_id, effective_date, amount_minor_raw,
          created_by_user_id, updated_by_user_id
        ) VALUES (
          ${snapshotId}, ${workspaceId}, ${snapshot.financialAccountId},
          ${effectiveDate}, ${snapshot.amountMinorRaw},
          ${userId}, ${userId}
        )
      `;
    }
  });
}
