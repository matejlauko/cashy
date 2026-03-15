import { sql } from "@/db/client";
import { bigintToSafeNumber } from "@/lib/money";
import { monthStartFromKey, monthEndFromKey } from "@/lib/date";

// ─── Return types ────────────────────────────────────────────────────────────

export type DashboardSummary = {
  /** Sum of all active account balances as of today (minor units, credit cards negated) */
  currentBalance: number;
  /** Sum of all active account balances as of day before month start (minor units) */
  openingMonthBalance: number;
  /** Sum of income transactions this month (minor units, positive) */
  monthlyIncomeTotal: number;
  /** Sum of expense transactions this month (minor units, positive) */
  monthlyExpenseTotal: number;
  /** opening - current + income (minor units) */
  monthlySpendingTotal: number;
  /** spending_total - expenses (minor units) */
  monthlySpendingExcludingTracked: number;
  /** Most recent effective_date across all active accounts, or null */
  lastSnapshotDate: string | null;
  /** Sum of active recurring income transactions (minor units, positive) */
  recurringIncomeTotal: number;
  /** Sum of active recurring expense transactions (minor units, positive) */
  recurringExpenseTotal: number;
};

export type ChartDataPoint = {
  /** YYYY-MM-DD date string */
  date: string;
  /** Total signed balance across all accounts in minor units */
  totalBalance: number;
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getDashboardSummary(
  workspaceId: string,
  monthKey: string,
  asOfDate: string,
): Promise<DashboardSummary> {
  const monthStart = monthStartFromKey(monthKey);
  const monthEnd = monthEndFromKey(monthKey);

  const rows = await sql`
    WITH latest_balances AS (
      SELECT
        COALESCE(
          CASE WHEN fa.type = 'credit_card' THEN -latest.amount_minor_raw
               ELSE latest.amount_minor_raw
          END,
          0
        ) AS signed_balance,
        latest.effective_date
      FROM financial_account fa
      LEFT JOIN LATERAL (
        SELECT bs.amount_minor_raw, bs.effective_date
        FROM balance_snapshot bs
        WHERE bs.financial_account_id = fa.id
          AND bs.workspace_id = fa.workspace_id
          AND bs.effective_date <= ${asOfDate}
        ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
        LIMIT 1
      ) latest ON true
      WHERE fa.workspace_id = ${workspaceId}
        AND fa.archived_at IS NULL
    ),
    opening_balances AS (
      SELECT
        COALESCE(
          CASE WHEN fa.type = 'credit_card' THEN -opening.amount_minor_raw
               ELSE opening.amount_minor_raw
          END,
          0
        ) AS signed_balance
      FROM financial_account fa
      LEFT JOIN LATERAL (
        SELECT bs.amount_minor_raw
        FROM balance_snapshot bs
        WHERE bs.financial_account_id = fa.id
          AND bs.workspace_id = fa.workspace_id
          AND bs.effective_date < ${monthStart}
        ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
        LIMIT 1
      ) opening ON true
      WHERE fa.workspace_id = ${workspaceId}
        AND fa.archived_at IS NULL
    ),
    month_transactions AS (
      SELECT
        COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount_minor ELSE 0 END), 0) AS income_total,
        COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount_minor ELSE 0 END), 0) AS expense_total
      FROM financial_transaction ft
      WHERE ft.workspace_id = ${workspaceId}
        AND ft.transaction_date >= ${monthStart}
        AND ft.transaction_date < ${monthEnd}
        AND ft.deleted_at IS NULL
    ),
    recurring_totals AS (
      SELECT
        COALESCE(SUM(CASE WHEN rt.type = 'income' THEN rt.amount_minor ELSE 0 END), 0) AS income_total,
        COALESCE(SUM(CASE WHEN rt.type = 'expense' THEN rt.amount_minor ELSE 0 END), 0) AS expense_total
      FROM recurring_transaction rt
      WHERE rt.workspace_id = ${workspaceId}
        AND rt.archived_at IS NULL
    )
    SELECT
      (SELECT COALESCE(SUM(signed_balance), 0) FROM latest_balances) AS current_balance,
      (SELECT COALESCE(SUM(signed_balance), 0) FROM opening_balances) AS opening_month_balance,
      (SELECT income_total FROM month_transactions) AS monthly_income_total,
      (SELECT expense_total FROM month_transactions) AS monthly_expense_total,
      (SELECT COALESCE(SUM(signed_balance), 0) FROM opening_balances)
        - (SELECT COALESCE(SUM(signed_balance), 0) FROM latest_balances)
        + (SELECT income_total FROM month_transactions) AS monthly_spending_total,
      (SELECT COALESCE(SUM(signed_balance), 0) FROM opening_balances)
        - (SELECT COALESCE(SUM(signed_balance), 0) FROM latest_balances)
        + (SELECT income_total FROM month_transactions)
        - (SELECT expense_total FROM month_transactions) AS monthly_spending_excluding_tracked,
      (SELECT MAX(effective_date) FROM latest_balances) AS last_snapshot_date,
      (SELECT income_total FROM recurring_totals) AS recurring_income_total,
      (SELECT expense_total FROM recurring_totals) AS recurring_expense_total
  `;

  const row = rows[0]!;
  return {
    currentBalance: bigintToSafeNumber(row.current_balance as bigint),
    openingMonthBalance: bigintToSafeNumber(
      row.opening_month_balance as bigint,
    ),
    monthlyIncomeTotal: bigintToSafeNumber(
      row.monthly_income_total as bigint,
    ),
    monthlyExpenseTotal: bigintToSafeNumber(
      row.monthly_expense_total as bigint,
    ),
    monthlySpendingTotal: bigintToSafeNumber(
      row.monthly_spending_total as bigint,
    ),
    monthlySpendingExcludingTracked: bigintToSafeNumber(
      row.monthly_spending_excluding_tracked as bigint,
    ),
    lastSnapshotDate: row.last_snapshot_date
      ? String(row.last_snapshot_date)
      : null,
    recurringIncomeTotal: bigintToSafeNumber(
      row.recurring_income_total as bigint,
    ),
    recurringExpenseTotal: bigintToSafeNumber(
      row.recurring_expense_total as bigint,
    ),
  };
}

export async function getBalanceChartData(
  workspaceId: string,
  monthKey: string,
  asOfDate: string,
): Promise<ChartDataPoint[]> {
  const monthStart = monthStartFromKey(monthKey);

  const rows = await sql`
    WITH date_series AS (
      SELECT d::date AS chart_date
      FROM generate_series(
        ${monthStart}::date,
        ${asOfDate}::date,
        '1 day'::interval
      ) AS d
    ),
    relevant_accounts AS (
      SELECT DISTINCT fa.id AS account_id, fa.type
      FROM financial_account fa
      WHERE fa.workspace_id = ${workspaceId}
        AND EXISTS (
          SELECT 1 FROM balance_snapshot bs
          WHERE bs.financial_account_id = fa.id
            AND bs.workspace_id = fa.workspace_id
        )
    ),
    daily_balances AS (
      SELECT
        ds.chart_date,
        COALESCE(
          CASE WHEN ra.type = 'credit_card' THEN -latest.amount_minor_raw
               ELSE latest.amount_minor_raw
          END,
          0
        ) AS signed_balance
      FROM date_series ds
      CROSS JOIN relevant_accounts ra
      LEFT JOIN LATERAL (
        SELECT bs.amount_minor_raw
        FROM balance_snapshot bs
        WHERE bs.financial_account_id = ra.account_id
          AND bs.workspace_id = ${workspaceId}
          AND bs.effective_date <= ds.chart_date
        ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
        LIMIT 1
      ) latest ON true
    )
    SELECT
      chart_date::text AS date,
      SUM(signed_balance) AS total_balance
    FROM daily_balances
    GROUP BY chart_date
    ORDER BY chart_date ASC
  `;

  return rows.map((r: Record<string, unknown>) => ({
    date: String(r.date),
    totalBalance: bigintToSafeNumber(r.total_balance as bigint),
  }));
}
