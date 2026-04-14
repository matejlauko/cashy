import { sql } from "@/db/client";
import { bigintToSafeNumber } from "@/lib/money";
import { nextMonthKey, today } from "@/lib/date";
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

// ─── Balance history (monthly matrix) ────────────────────────────────────────

export type BalanceHistoryAccount = {
  id: string;
  name: string;
  type: "cash" | "checking" | "savings" | "credit_card";
  archivedAt: string | null;
};

export type BalanceHistoryRow = {
  date: string; // YYYY-MM-DD
  balances: Record<string, number>; // accountId → signed minor units (safe int)
};

export type BalanceHistoryMatrix = {
  accounts: BalanceHistoryAccount[];
  rows: BalanceHistoryRow[];
  baseline: { balances: Record<string, number> };
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

export async function getMonthMatrix(
  workspaceId: string,
  month: string, // "YYYY-MM"
): Promise<BalanceHistoryMatrix> {
  const monthStart = `${month}-01`;
  const nextMonthStart = `${nextMonthKey(month)}-01`;

  // 1) Accounts with ≥1 snapshot whose effective_date falls in [monthStart, nextMonthStart)
  const accountRows = await sql`
    SELECT DISTINCT
      fa.id,
      fa.name,
      fa.type,
      fa.archived_at
    FROM financial_account fa
    INNER JOIN balance_snapshot bs
      ON bs.financial_account_id = fa.id
     AND bs.workspace_id = fa.workspace_id
    WHERE fa.workspace_id = ${workspaceId}
      AND bs.workspace_id = ${workspaceId}
      AND bs.effective_date >= ${monthStart}
      AND bs.effective_date < ${nextMonthStart}
    ORDER BY fa.archived_at ASC NULLS FIRST, fa.name
  `;

  const accounts: BalanceHistoryAccount[] = accountRows.map(
    (r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      type: r.type as BalanceHistoryAccount["type"],
      archivedAt: (r.archived_at as string | null) ?? null,
    }),
  );

  // Early return when there is no activity in the month.
  if (accounts.length === 0) {
    return {
      accounts: [],
      rows: [],
      baseline: { balances: {} },
    };
  }

  // 2) In-month snapshots: latest per (account, effective_date)
  //    Signed amount applied at SQL level (credit_card → negate) to match
  //    accounts.ts convention.
  const matrixRows = await sql`
    SELECT DISTINCT ON (bs.financial_account_id, bs.effective_date)
      bs.financial_account_id,
      bs.effective_date::text AS effective_date,
      CASE WHEN fa.type = 'credit_card' THEN -bs.amount_minor_raw
           ELSE bs.amount_minor_raw
      END AS signed_amount_minor_raw
    FROM balance_snapshot bs
    INNER JOIN financial_account fa
      ON fa.id = bs.financial_account_id
     AND fa.workspace_id = bs.workspace_id
    WHERE bs.workspace_id = ${workspaceId}
      AND bs.effective_date >= ${monthStart}
      AND bs.effective_date < ${nextMonthStart}
    ORDER BY
      bs.financial_account_id,
      bs.effective_date,
      bs.created_at DESC,
      bs.id DESC
  `;

  // Pivot into rows grouped by date, newest-first.
  const accountIdSet = new Set(accounts.map((a) => a.id));
  const byDate = new Map<string, Record<string, number>>();
  for (const r of matrixRows as Record<string, unknown>[]) {
    const accountId = r.financial_account_id as string;
    if (!accountIdSet.has(accountId)) continue;
    const date = r.effective_date as string;
    const signed = bigintToSafeNumber(r.signed_amount_minor_raw as bigint);
    if (!byDate.has(date)) byDate.set(date, {});
    byDate.get(date)![accountId] = signed;
  }

  const rows: BalanceHistoryRow[] = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)) // DESC
    .map(([date, balances]) => ({ date, balances }));

  // 3) Baseline: latest snapshot per account with effective_date < monthStart,
  //    signed. Uses all accounts in the workspace; app-code filter keeps only
  //    those present in `accounts` to keep the payload minimal.
  const baselineRows = await sql`
    SELECT DISTINCT ON (bs.financial_account_id)
      bs.financial_account_id,
      CASE WHEN fa.type = 'credit_card' THEN -bs.amount_minor_raw
           ELSE bs.amount_minor_raw
      END AS signed_amount_minor_raw
    FROM balance_snapshot bs
    INNER JOIN financial_account fa
      ON fa.id = bs.financial_account_id
     AND fa.workspace_id = bs.workspace_id
    WHERE bs.workspace_id = ${workspaceId}
      AND bs.effective_date < ${monthStart}
    ORDER BY
      bs.financial_account_id,
      bs.effective_date DESC,
      bs.created_at DESC,
      bs.id DESC
  `;

  const baselineBalances: Record<string, number> = {};
  for (const r of baselineRows as Record<string, unknown>[]) {
    const id = r.financial_account_id as string;
    if (!accountIdSet.has(id)) continue;
    baselineBalances[id] = bigintToSafeNumber(
      r.signed_amount_minor_raw as bigint,
    );
  }

  return {
    accounts,
    rows,
    baseline: { balances: baselineBalances },
  };
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
