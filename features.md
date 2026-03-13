# V1 Feature Implementation Plan

## Product & Tech specs

!Important: Read ./PRD.md for product requirements and ./tech.md for technical spec and architecture before reading this file!

## Current State

The base architecture is fully scaffolded: Bun server, Hono API with middleware stack (request-id, logging, secure-headers, session, workspace), Better Auth with Google OAuth + access control, complete Drizzle schema for all tables, login page, app shell with session/workspace management, 6 shadcn/ui components, TanStack Query + React Hook Form + Hono RPC client setup, and utility functions for money/date handling.

**What's missing:** All product feature API routes, DB query modules, shared Zod schemas, and frontend views/features.

## Cross-Cutting Guardrails (apply to all projects)

- API mutation contract:
  - Accept only `application/json`.
  - Return errors as `{ error: { code, message } }`.
  - Map domain failures to stable codes (`ACCOUNT_BALANCE_NOT_ZERO`, `ACCOUNT_NAME_TAKEN`, `ACCOUNT_ARCHIVED`, `INVALID_DATE_RANGE`, `SNAPSHOT_ACCOUNT_MISMATCH`, etc.).
- Workspace safety:
  - Every query/mutation must include `workspace_id = activeWorkspaceId`.
  - All account-referencing writes must validate `(financial_account_id, workspace_id)` ownership and active/archived state rules.
- Business date contract:
  - Accept only `YYYY-MM-DD` date strings for `effectiveDate` and `transactionDate`.
  - Treat dates as literal business dates (no timezone conversion logic in client/server payloads).
  - Disallow future dates for V1 entry flows; allow backfill (past dates).
- Current-month boundaries:
  - Use `month_start <= date < next_month_start` for current-month queries/totals (not just `>= month_start`).
  - Use "as of today" for current-balance calculations (`effective_date <= today`).
- Client cache contract:
  - Query keys must include workspace context, e.g. `["accounts", workspaceId]`, `["transactions", workspaceId, monthStart]`, `["balance-prefill", workspaceId, date]`, `["dashboard", workspaceId]`.
  - Workspace switch invalidates/removes all workspace-scoped cache.
- UX baseline:
  - Explicit states for `no accessible workspace`, `no accounts`, `no current-month balance data`, `no transactions`.
  - Logout is always visible from authenticated shell.

---

## Project 1: App Shell Navigation & UI Foundation

### Problem

The app shell has a single "Dashboard" nav item with no content. Before building features, we need the navigation system, toast notifications for mutation feedback, and additional shadcn components (dialog, alert-dialog, sonner/toast) that every feature will use.

### Solution

- Expand `Section` type in `app-shell.tsx` to `"dashboard" | "accounts" | "transactions"`
- Add nav buttons for all three sections; active section highlighted via `variant="secondary"`
- Render the matching view component in `<main>` based on `activeSection`
- Install shadcn components: `dialog` (forms/modals), `alert-dialog` (destructive confirmations), `sonner` (toast notifications), `tabs` (optional for layout)
- Add `<Toaster />` to the app root in `app.tsx`
- Create placeholder view components that later projects will fill in
- Ensure authenticated header always shows current workspace name and logout action
- Add shell-level "no accessible workspace" state for `403 NO_WORKSPACE_ACCESS` from bootstrap/session query

### UX

- Horizontal nav bar below header with Dashboard | Accounts | Transactions
- Clicking a nav item switches the view instantly (local state, no URL routing)
- Toast appears bottom-right for all mutation success/error feedback
- Confirmation dialogs block with overlay for destructive actions (archive, delete)

### Scope

- **In scope:** Navigation switching, toast provider, dialog/alert-dialog/sonner component installation, placeholder views
- **Not in scope:** Actual feature content (that's Projects 2-5), URL routing, persisted tab state

### Success Criteria

- User can switch between three views via nav buttons
- Toast notifications render correctly (test with a manual `toast("test")` call)
- Dialog and AlertDialog components are installed and importable
- Workspace identity and logout are visible in the shell at all times
- If user has no workspace access, shell shows a clear blocked state instead of broken content

### Files

- `src/components/ui/dialog.tsx` -- new (shadcn)
- `src/components/ui/alert-dialog.tsx` -- new (shadcn)
- `src/components/ui/sonner.tsx` -- new (shadcn)
- `src/client/app/app-shell.tsx` -- modify: expand Section type, add nav items, render views
- `src/client/app/app.tsx` -- modify: add Toaster provider
- `src/client/app/views/dashboard-view.tsx` -- new (placeholder)
- `src/client/app/views/accounts-view.tsx` -- new (placeholder)
- `src/client/app/views/transactions-view.tsx` -- new (placeholder)

---

## Project 2: Account Management

### Problem

Accounts are the foundational entity. Balance snapshots and transactions both reference accounts via FK. Nothing works without them.

### Solution

**Backend:**

- Zod schemas in `src/schemas/accounts.ts`: `CreateAccountInput` (name, institutionName?, type, initialBalance as number in minor units), `UpdateAccountInput` (name, institutionName?, type), account type enum
- DB module `src/db/modules/accounts.ts` with raw Bun SQL:
  - `listActive(workspaceId)` -- returns active accounts with current balance derived via LATERAL subquery to `balance_snapshot` (latest snapshot per account using `effective_date DESC, created_at DESC, id DESC`). Credit card balances negated in the query.
  - `listArchived(workspaceId)` -- same but `archived_at IS NOT NULL` (used for optional P1 archived section)
  - `getById(id, workspaceId)` -- single account with current balance
  - `create(workspaceId, userId, data)` -- `sql.begin()`: insert `financial_account` + initial `balance_snapshot` for today's date. ID generated as `crypto.randomUUID()`
  - `update(id, workspaceId, userId, data)` -- update metadata only, set `updated_at`/`updated_by_user_id`
  - `archive(id, workspaceId, userId)` -- verify latest effective balance is zero, then set `archived_at`/`archived_by_user_id`. If non-zero, throw with code `ACCOUNT_BALANCE_NOT_ZERO`
- Map normalized-name unique violation to `ACCOUNT_NAME_TAKEN` and show form-level error
- Return zero current balance when an account has no snapshots yet (`COALESCE` safety)
- Hono route `src/api/routes/accounts.ts`: GET `/` (list active), POST `/` (create), PATCH `/:id` (update), POST `/:id/archive` (archive)
- Register in `app.ts` with middleware that protects both `/accounts` and `/accounts/*` paths before `.route("/accounts", accountsRoute)`

**Frontend:**

- `AccountsView`: lists active accounts in cards/rows showing name, institution, type, current balance (formatted via `formatMoneyMinor`). "Create Account" button at top. Each account has Edit and Archive actions.
- `AccountForm`: dialog/sheet used for both create and edit. React Hook Form with Zod resolver. Money input as text with `inputMode="decimal"`, uses `parseMoneyInput` on submit. Account type as select dropdown.
- Archive: AlertDialog confirmation. On success, toast + refetch accounts.
- Empty state: "No accounts yet. Create your first account to start tracking."
- Editing account `type` shows warning: changing type changes sign interpretation in all views/metrics

### UX Flows

1. **Create:** User clicks "Create Account" -> dialog opens -> fills name, optional institution, selects type, enters initial balance -> Save -> account appears in list with that balance
2. **Edit:** User clicks edit on an account -> dialog opens pre-filled -> changes metadata -> Save -> list updates
3. **Archive:** User clicks archive -> AlertDialog "Are you sure? This account must have a zero balance." -> Confirm -> account disappears from active list

### Scope

- **In scope:** CRUD, archive with zero-balance guard, active list with current balances, form validation, workspace isolation, empty state, credit card balance shown as negative
- **Not in scope:** Archived accounts section (P1 per PRD), dashboard integration, balance editing

### Success Criteria

- Create account with initial balance -> appears in list with correct balance
- Edit metadata -> reflected immediately
- Archive with zero balance -> succeeds, account hidden from list
- Archive with non-zero balance -> error message shown
- Duplicate name (case-insensitive) -> deterministic `ACCOUNT_NAME_TAKEN` message
- Credit card balance displayed as negative in the list

---

## Project 3: Balance Update Flow

### Problem

Balance snapshots are the source of truth for financial position. This is the core daily workflow -- the user must be able to quickly update all account balances from one screen.

### Solution

**Backend:**

- Zod schemas in `src/schemas/balance-snapshots.ts`: `BulkBalanceUpdateInput` with `effectiveDate` (YYYY-MM-DD string) and `snapshots: Array<{ financialAccountId: string, amountMinorRaw: number }>`. Prefill query params: `date` as YYYY-MM-DD.
- DB module `src/db/modules/balance-snapshots.ts`:
  - `getPrefillByDate(workspaceId, effectiveDate)` -- for each active account, find latest `balance_snapshot` on or before `effectiveDate` using `DISTINCT ON (financial_account_id)` ordered by `effective_date DESC, created_at DESC, id DESC`. Returns account id, name, type, and prefilled `amountMinorRaw` (0 if no prior snapshot). Raw positive values (no sign conversion -- credit card amounts stay positive in the form).
  - `bulkCreate(workspaceId, userId, effectiveDate, snapshots[])` -- `sql.begin()`: verify all submitted account IDs are active accounts in this workspace, then insert one `balance_snapshot` per account. Reject if account count mismatch (`SNAPSHOT_ACCOUNT_MISMATCH`) and reject future `effectiveDate` (`INVALID_DATE_RANGE`).
- Hono route `src/api/routes/balance-snapshots.ts`: GET `/prefill?date=YYYY-MM-DD`, POST `/bulk`
- Register in `app.ts` with session + workspace middleware

**Frontend:**

- `BalanceUpdateForm`: opened as a dialog/sheet from a button (on dashboard later, temporarily from nav/accounts). Contains:
  - Date input defaulting to today
  - Date input has `max=today` (no future snapshots in V1)
  - One row per active account: account name (credit cards show "amount owed" label), text input with `inputMode="decimal"` prefilled with current value formatted as decimal string (e.g., "1234.56")
  - Save button
- If there are no active accounts, disable the flow and show CTA to create an account
- Changing the date triggers a refetch of prefill data via TanStack Query `["balance-prefill", workspaceId, date]`
- On submit: transform all inputs via `parseMoneyInput`, POST to `/api/balance-snapshots/bulk`
- On success: toast "Balances updated", invalidate query keys `["accounts", workspaceId]`, `["dashboard", workspaceId]`, `["balance-prefill", workspaceId]`, close dialog

### UX Flows

1. **Daily update:** User opens balance update -> sees today's date, all accounts prefilled with latest balances -> changes the ones that changed -> Save -> success toast, dashboard refreshes
2. **Backfill:** User opens balance update -> selects a past date -> form re-prefills from that date's latest data -> enters correct values -> Save

### Scope

- **In scope:** Bulk entry with prefill, date selection, credit card labeling, post-save cache invalidation, "no change" snapshot creation
- **Not in scope:** Viewing historical snapshots, editing individual snapshots, dashboard metrics

### Success Criteria

- Form shows all active accounts with correct prefilled values
- Changing date re-prefills from historical data
- Saving creates exactly one `balance_snapshot` per active account (verify in DB)
- Credit card rows clearly labeled "amount owed"
- Accounts with no prior snapshots prefill as "0.00"
- Post-save: account list shows updated balances
- Future date submit is rejected by schema/server with clear message
- Multiple saves on same date are allowed; latest save wins for effective value

---

## Project 4: Transaction Management

### Problem

Transactions explain income and notable expenses. They drive the "tracked vs untracked spending" decomposition on the dashboard and provide the recent transaction list.

### Solution

**Backend:**

- Zod schemas in `src/schemas/transactions.ts`: `CreateTransactionInput` (name, financialAccountId, amountMinor as positive number, transactionDate as YYYY-MM-DD, type: "income" | "expense"), `UpdateTransactionInput` (same fields, all optional except id)
- DB module `src/db/modules/transactions.ts`:
  - `listCurrentMonth(workspaceId)` -- `WHERE transaction_date >= month_start AND transaction_date < next_month_start AND deleted_at IS NULL`, joined with `financial_account` for account name, ordered `transaction_date DESC, created_at DESC`. Returns with signed amount (income positive, expense negative) and type.
  - `listRecent(workspaceId, limit)` -- same but with LIMIT, for dashboard use
  - `create(workspaceId, userId, data)` -- `sql.begin()`: verify account is active and in workspace, insert `financial_transaction` with `crypto.randomUUID()` id
  - `update(id, workspaceId, userId, data)` -- verify account (if changed) is active, reject updates to soft-deleted rows, update fields + `updated_at`/`updated_by_user_id`
  - `softDelete(id, workspaceId, userId)` -- set `deleted_at`/`deleted_by_user_id`; repeated delete is idempotent
- Reject future `transactionDate` in V1 (`INVALID_DATE_RANGE`) to keep "month so far" metrics trustworthy
- Hono route `src/api/routes/transactions.ts`: GET `/` (list current month), POST `/` (create), PATCH `/:id` (update), POST `/:id/delete` (soft delete)

**Frontend:**

- `TransactionsView`: list of current-month non-deleted transactions. Each row: date, name, account name, signed amount (income green/positive, expense red/negative). "Add Transaction" button at top.
- `TransactionForm`: dialog for create/edit. Fields: name (text), account (select from active accounts -- reuses `["accounts"]` query), amount (text, `inputMode="decimal"`, always positive), date (date input, default today), type (select: Income / Expense with clear sign explanation).
- Date field has `max=today`; client and server both validate no future dates
- Delete: AlertDialog "Delete this transaction?" -> Confirm -> soft delete -> toast + refetch
- Clicking a row in the list opens edit dialog pre-populated
- Empty state: "No transactions this month."

### UX Flows

1. **Add:** User clicks "Add Transaction" -> dialog -> fills form -> Save -> appears in list
2. **Edit:** User clicks a transaction row -> dialog pre-populated -> edit fields -> Save
3. **Delete:** In edit dialog, user clicks Delete -> AlertDialog confirmation -> transaction disappears from list

### Scope

- **In scope:** CRUD, soft delete with confirmation, current-month listing, signed amount display, active-account-only dropdown, empty state
- **Not in scope:** Pagination, filters, search, past-month viewing, dashboard totals

### Success Criteria

- Create transaction -> appears in list with correct signed amount
- Income shows positive/green, expense shows negative/red
- Edit all fields -> reflected immediately
- Soft delete -> hidden from list, toast shown
- Only active accounts in dropdown
- Only current-month non-deleted transactions in list
- Query excludes next/future months by strict month bounds

---

## Project 5: Dashboard

### Problem

The dashboard is the primary value surface. It must answer: What's our total balance? How much have we spent this month? How much of that is tracked vs everyday spending?

### Solution

**Backend:**

- DB module `src/db/modules/dashboard.ts`:
  - `getDashboardSummary(workspaceId)` -- single SQL query with CTEs:
    1. `latest_balances`: each non-archived account's effective balance as of `today` (`effective_date <= today`, latest by `effective_date DESC, created_at DESC, id DESC`), with sign applied (credit card negated)
    2. `opening_balances`: each account's effective balance on day before current month start, with sign applied
    3. `month_transactions`: SUM of income and expense from `financial_transaction` where `transaction_date >= month_start AND transaction_date < next_month_start AND deleted_at IS NULL`
    4. Final SELECT: `current_balance` (SUM of latest_balances), `opening_month_balance` (SUM of opening_balances), `monthly_income_total`, `monthly_expense_total`, `monthly_spending_total` (opening - current + income), `monthly_spending_excluding_tracked` (monthly_spending_total - expenses), `last_snapshot_date` (MAX effective_date)
  - `getBalanceChartData(workspaceId)` -- uses `generate_series(month_start, today, '1 day')` CROSS JOIN all accounts (including archived that had data), LEFT JOIN LATERAL to find latest snapshot per account per day, SUM signed balances per day. Returns `Array<{ date: string, totalBalance: number }>`.
  - `getAccountBalances(workspaceId)` -- reuses accounts.listActive logic or is a lightweight version
  - Reuses `transactions.listRecent(workspaceId, 5)` for recent transactions
- Hono route `src/api/routes/dashboard.ts`: GET `/` returns `{ summary, chartData, accountBalances, recentTransactions }`
- All metrics computed server-side in SQL; client just renders numbers

**Frontend:**

- `DashboardView` composed of:
  - `MetricCards`: 3 primary KPI cards (Current Balance, Monthly Spending, Spending Excl. Tracked) + 2 secondary (Income Total, Expense Total). Large numbers using `formatMoneyMinor`.
  - `BalanceChart`: Recharts `AreaChart` or `LineChart` with data from `chartData`. X-axis: day labels. Y-axis: CZK amounts. Responsive container.
  - `AccountBalances`: compact list of active accounts with name, type badge, and current balance
  - `RecentTransactions`: compact list (5 items) with date, name, account, signed amount. Click to edit (opens transaction form from Project 4).
  - `LastSnapshotDate`: small text indicator "Last updated: Mar 12, 2026"
  - Primary CTA: "Update Balances" button that opens BalanceUpdateForm from Project 3
  - Secondary CTAs: "Add Account", "Add Transaction"
- TanStack Query key: `["dashboard", workspaceId]`, refetches on workspace change and after any mutation
- Empty states: no accounts -> "Create your first account", no balance data -> "Update your balances to see spending data", no transactions -> "Add a transaction to track notable expenses"

### Layout (mobile-first)

1. Primary metric cards (stacked on mobile, row on desktop)
2. Secondary metric cards (smaller, row)
3. Balance chart (full width)
4. "Update Balances" CTA button
5. Per-account balances (list)
6. Recent transactions (list)

### Scope

- **In scope:** All 5 metrics per PRD, chart with carry-forward, per-account balances, recent transactions, last snapshot date, CTAs, empty states, mobile-first layout
- **Not in scope:** Historical month browsing, chart interactions, drill-down

### Success Criteria

- Dashboard loads with a single API call displaying all metrics
- `current_balance` correctly sums accounts (credit cards negative)
- `monthly_spending_total` = `opening_balance - current_balance + month_income`
- `monthly_spending_excluding_tracked` = `monthly_spending_total - month_expenses`
- Chart shows day-by-day balance, carries forward missing days
- After balance update or transaction mutation, dashboard data refreshes
- Empty states guide to next action
- Readable on mobile (stacked cards, scrollable chart)
- Current-month totals exclude non-current-month dates by strict month bounds

---

## Project 6: Integration & Polish

### Problem

Individual features work but need cross-feature cache invalidation consistency, edge case handling, mobile polish, and validation of the complete first-time user flow.

### Solution

- Audit TanStack Query invalidation with workspace-aware keys:
  - account create/edit/archive -> invalidate `["accounts", workspaceId]`, `["dashboard", workspaceId]`, `["balance-prefill", workspaceId]`
  - balance bulk save -> invalidate `["accounts", workspaceId]`, `["dashboard", workspaceId]`, `["balance-prefill", workspaceId]`
  - transaction create/edit/delete -> invalidate `["transactions", workspaceId, monthStart]`, `["dashboard", workspaceId]`
  - workspace switch -> clear all workspace-scoped queries before refetch
- Credit card sign consistency: positive in forms/DB, negative everywhere it's displayed (account list, dashboard metrics, chart)
- First-time flow validation: login -> empty dashboard -> create account -> update balances -> add transaction -> verify dashboard shows correct data
- Mobile layout audit across all views
- Error handling: network failures show toast errors, form validation shows inline errors
- PRD edge cases: backfill on month boundary, opening balance when no prior data exists (should be 0), archived accounts in chart history, no-workspace access state, duplicate-account-name collisions, same-day snapshot overwrite precedence
- Run the manual smoke checklist from `tech.md` section 14 as release gate for V1

### Scope

- **In scope:** Cache invalidation consistency, credit card sign handling, mobile responsiveness, error states, empty states completeness, first-use flow
- **Not in scope:** Performance optimization, E2E test automation, CI/CD, production deployment

### Success Criteria (PRD Section 16)

- User understands current balance and spending within seconds of landing on dashboard
- Daily balance update completes in ~1 minute on mobile
- Both household users can sign in and use the same workspace
- Dashboard is understandable with both balances and transactions
- Historical data preserved when accounts archived or transactions deleted
- No cross-workspace stale data appears after workspace switch

---

## Execution Order & Dependencies

```
P1: Navigation & UI Foundation
 |
 v
P2: Account Management (needs dialog, toast from P1)
 |
 +---> P3: Balance Update Flow (needs accounts from P2)
 |
 +---> P4: Transaction Management (needs accounts from P2)
 |         |
 v         v
P5: Dashboard (needs P2 + P3 + P4 data)
 |
 v
P6: Integration & Polish
```

P3 and P4 can run in parallel after P2. P5 depends on all data features. P6 is the final pass.
