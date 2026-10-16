import { sql } from "@/db/client";
import { safeIntegerFromDb } from "@/lib/money";
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
  /** Sum of all budget item amounts (minor units, positive) */
  budgetItemsTotal: number;
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
        COALESCE((
          SELECT bs.amount_minor_raw
          FROM balance_snapshot bs
          WHERE bs.financial_account_id = fa.id
            AND bs.workspace_id = fa.workspace_id
            AND bs.effective_date <= ${asOfDate}
          ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
          LIMIT 1
        ), 0) * CASE WHEN fa.type = 'credit_card' THEN -1 ELSE 1 END
          AS signed_balance,
        (
          SELECT MAX(bs.effective_date)
          FROM balance_snapshot bs
          WHERE bs.financial_account_id = fa.id
            AND bs.workspace_id = fa.workspace_id
            AND bs.effective_date <= ${asOfDate}
        ) AS effective_date
      FROM financial_account fa
      WHERE fa.workspace_id = ${workspaceId}
        AND fa.archived_at IS NULL
    ),
    opening_balances AS (
      SELECT
        COALESCE((
          SELECT bs.amount_minor_raw
          FROM balance_snapshot bs
          WHERE bs.financial_account_id = fa.id
            AND bs.workspace_id = fa.workspace_id
            AND bs.effective_date < ${monthStart}
          ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
          LIMIT 1
        ), 0) * CASE WHEN fa.type = 'credit_card' THEN -1 ELSE 1 END
          AS signed_balance
      FROM financial_account fa
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
    ),
    budget_totals AS (
      SELECT
        COALESCE(SUM(bi.amount_minor), 0) AS total
      FROM budget_item bi
      WHERE bi.workspace_id = ${workspaceId}
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
      (SELECT expense_total FROM recurring_totals) AS recurring_expense_total,
      (SELECT total FROM budget_totals) AS budget_items_total
  `;

  const row = rows[0]!;
  return {
    currentBalance: safeIntegerFromDb(row.current_balance, "current_balance"),
    openingMonthBalance: safeIntegerFromDb(
      row.opening_month_balance,
      "opening_month_balance",
    ),
    monthlyIncomeTotal: safeIntegerFromDb(
      row.monthly_income_total,
      "monthly_income_total",
    ),
    monthlyExpenseTotal: safeIntegerFromDb(
      row.monthly_expense_total,
      "monthly_expense_total",
    ),
    monthlySpendingTotal: safeIntegerFromDb(
      row.monthly_spending_total,
      "monthly_spending_total",
    ),
    monthlySpendingExcludingTracked: safeIntegerFromDb(
      row.monthly_spending_excluding_tracked,
      "monthly_spending_excluding_tracked",
    ),
    lastSnapshotDate: (row.last_snapshot_date as string | null) ?? null,
    recurringIncomeTotal: safeIntegerFromDb(
      row.recurring_income_total,
      "recurring_income_total",
    ),
    recurringExpenseTotal: safeIntegerFromDb(
      row.recurring_expense_total,
      "recurring_expense_total",
    ),
    budgetItemsTotal: safeIntegerFromDb(
      row.budget_items_total,
      "budget_items_total",
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
    WITH RECURSIVE date_series(chart_date) AS (
      SELECT ${monthStart} WHERE ${monthStart} <= ${asOfDate}
      UNION ALL
      SELECT date(chart_date, '+1 day')
      FROM date_series
      WHERE chart_date < ${asOfDate}
    ),
    relevant_accounts AS (
      SELECT fa.id AS account_id, fa.type
      FROM financial_account fa
      WHERE fa.workspace_id = ${workspaceId}
        AND EXISTS (
          SELECT 1 FROM balance_snapshot bs
          WHERE bs.financial_account_id = fa.id
            AND bs.workspace_id = fa.workspace_id
        )
    )
    SELECT
      ds.chart_date AS date,
      SUM(
        COALESCE((
          SELECT bs.amount_minor_raw
          FROM balance_snapshot bs
          WHERE bs.financial_account_id = ra.account_id
            AND bs.workspace_id = ${workspaceId}
            AND bs.effective_date <= ds.chart_date
          ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
          LIMIT 1
        ), 0) * CASE WHEN ra.type = 'credit_card' THEN -1 ELSE 1 END
      ) AS total_balance
    FROM date_series ds
    CROSS JOIN relevant_accounts ra
    GROUP BY ds.chart_date
    ORDER BY ds.chart_date ASC
  `;

  return rows.map((r) => ({
    date: r.date as string,
    totalBalance: safeIntegerFromDb(r.total_balance, "total_balance"),
  }));
}
