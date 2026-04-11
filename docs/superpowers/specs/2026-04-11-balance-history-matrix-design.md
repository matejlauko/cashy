# Balance History — Ledger Matrix View

**Date:** 2026-04-11
**Status:** Design approved, ready for implementation plan
**Primary goal:** trajectory/trend of account balances over time (B), with secondary audit/correction support (A)

## Summary

A new top-level tab, **Balance history**, showing a ledger-style matrix of balance snapshots within a single month. Dates form the rows (newest first), accounts form the columns, plus a trailing **Net worth** column. Each cell renders the signed balance with a small delta chip comparing it to the same account in the next-older row (or to the month's carry-in baseline for the first row). Clicking any row reuses the existing bulk-snapshot edit dialog for that date — no new mutation endpoints are introduced. Month navigation mirrors the dashboard: one month at a time, ◀ / ▶ paging, default = current month.

## Goals

- Give the user a single screen to see how each account's balance has moved across a month, alongside the net-worth trajectory.
- Let the user spot and correct erroneous or missing balance entries (audit) without leaving the view.
- Ship with zero new write endpoints by reusing the existing bulk-snapshot edit dialog. (See *Assumption about the edit dialog* in Architecture.)
- Match the conventions of the rest of the app: month-scoped views, local state for section switching, TanStack Query for fetching, raw Bun SQL for queries, shadcn/ui for components.

## Non-goals

- **Inline per-cell editing.** Edits happen at the date granularity via the existing dialog.
- **Multi-month or cross-month views.** One month at a time, consistent with the app.
- **URL routing for month selection.** The app has no routing; month is local state.
- **CSV export.** Out of scope; add later if requested.
- **New charts.** The dashboard already has a balance chart; this view is the tabular companion.
- **Mobile-first layout.** Desktop-first; mobile gets horizontal scroll with a pinned `Date` column.

## Architecture

### Navigation

Add a new section to `src/client/app/app-shell.tsx`:

```ts
const sections = [
  { id: "dashboard", label: "Dashboard" },
  { id: "accounts", label: "Accounts" },
  { id: "balance-history", label: "Balance history" }, // NEW
  { id: "transactions", label: "Transactions" },
  { id: "recurring", label: "Recurring" },
  { id: "budget", label: "Budget" },
];
```

The new section renders `<BalanceHistoryView workspaceId={…} />`.

### File layout

```
src/api/routes/balance-history.ts                              (new, mounted in src/api/app.ts)
src/db/modules/balance-snapshots.ts                            (extend: add getMonthMatrix)
src/schemas/balance-history.ts                                 (new: Zod schemas for request/response)
src/client/app/views/balance-history-view.tsx                  (new)
src/client/app/features/balance-history/balance-history-table.tsx (new)
src/client/app/features/balance-history/delta-chip.tsx         (new IF no reusable chip exists)
src/client/app/features/shared/month-navigator.tsx             (NEW — extracted from dashboard)
```

**Small refactor in scope:** extract the dashboard's existing month-picker into `features/shared/month-navigator.tsx` and consume it from both dashboard and balance-history. This is a targeted improvement on code being touched for this feature — it's not a speculative refactor. If the dashboard picker carries dashboard-specific state that would fight the extraction, fall back to building a fresh component for balance-history and skip the dashboard refactor — don't torture the extraction.

**Assumption about the edit dialog.** The existing bulk-snapshot dialog is currently used to *create* a new day's snapshots, prefilled with the latest prior balances. This spec assumes that same dialog (or a small variant of it) can be opened for an *existing* date D and show the balances actually saved for D, so that saving upserts rather than blindly inserts. The implementation plan must confirm this during its first task: if the existing dialog already supports "open for date D in edit mode", reuse directly; if not, adding that mode is in scope for this feature. Either way, no new API endpoint is introduced — the underlying bulk-write path is the same.

### Backend

#### Endpoint

`GET /api/balance-history?month=YYYY-MM`

- Mounted in `src/api/app.ts`.
- Zod-validated: `month` must match `^\d{4}-(0[1-9]|1[0-2])$`.
- Uses the existing workspace-isolation middleware.
- Returns the response shape below on 200; 400 for an invalid month; 401/403 for auth failures via existing middleware.

#### Response shape (Zod-validated, bigint-safe)

```ts
{
  month: string; // "YYYY-MM", echoed from the request

  accounts: Array<{
    id: string;
    name: string;
    type: "cash" | "checking" | "savings" | "credit_card";
    archivedAt: string | null;
  }>;
  // Ordered: currently-active accounts first (by name), then archived accounts
  // (by name). Includes every account that has ≥1 snapshot whose effective_date
  // falls in the month, even if that account is now archived.

  rows: Array<{
    date: string;                         // "YYYY-MM-DD"
    balances: Record<string, number>;     // accountId → signed minor units (safe integer)
  }>;
  // Sorted DESC by date (newest first). One row per distinct effective_date that
  // has at least one snapshot in the month. Only accounts listed in `accounts`
  // appear as keys. If an account has no snapshot on a given date, that key is
  // omitted for the row (client treats it as "carry-forward from prior row").

  baseline: {
    balances: Record<string, number>;     // accountId → signed minor units (safe integer)
  };
  // For each account in `accounts`, the latest snapshot with
  // effective_date < month_start (null/omitted if none exists).
  // Used by the client to compute deltas for the oldest in-month row.
}
```

**Amounts** are signed minor units encoded as JavaScript-safe integer `number` on the wire, matching the existing repo convention (`bigintToSafeNumber` → JS number; the safe-integer ceiling is ~9×10¹⁵ minor units, far beyond any personal-finance amount in halers or cents). Credit-card amounts are already negated before serialization (matches the existing signed-balance convention in `account-balances`).

#### DB module — `getMonthMatrix(workspaceId, month)`

Added to `src/db/modules/balance-snapshots.ts`. Internally runs three cheap queries and pivots in app code (row counts are tiny — not worth a SQL pivot):

1. **Accounts with in-month activity** — every `financial_account` that has at least one snapshot whose `effective_date` is in `[month_start, month_end]`, regardless of `archived_at`.
2. **In-month snapshots** — the latest snapshot per `(financial_account_id, effective_date)` in the range, using the existing ordering `(effective_date DESC, created_at DESC, id DESC)`. Applies the signed-amount rule (credit card → negate).
3. **Baseline** — `DISTINCT ON (financial_account_id)` latest snapshot with `effective_date < month_start`, one per account in the set from (1), with the same signed-amount rule.

All three queries filter on `workspace_id` in both the WHERE clause and any JOIN predicate — consistent with the existing query modules.

The app-code pivot produces `rows` (newest-first, one per distinct in-month date, keyed by account id) and `baseline` (account id → bigint).

### Frontend

#### `balance-history-view.tsx`

- Owns local state: `month` (default = current month, "YYYY-MM").
- Uses TanStack Query: key `["balance-history", workspaceId, month]`, fetched from `/api/balance-history?month=…`.
- Renders the shared `<MonthNavigator month={month} onChange={setMonth} />`.
- Renders `<BalanceHistoryTable data={query.data} />` or an empty state.
- On edit-dialog save, invalidates `["balance-history", …]` and `["dashboard", …]` (the dashboard's balance chart depends on the same snapshots).

#### `balance-history-table.tsx`

- Pure presentation. Receives the fetched data plus an `onEditRow(date)` callback.
- Renders a `<table>` with:
  - Sticky header row: `Date | {account 1} | … | Net worth`.
  - A `tbody` row per `rows[i]`, sorted newest-first. Each row is a button-role element calling `onEditRow(row.date)` on click or Enter.
  - Archived account columns get a muted background and an "archived" badge next to the account name in the header.
  - Each balance cell renders the signed amount via `formatMoneyMinor`, right-aligned with `tabular-nums`. Below/beside the amount sits a `<DeltaChip>` comparing to the next-older row's balance for that account (or to the `baseline` balance for the oldest row; `null` if no baseline exists → muted dash).
  - The Net-worth column for each row sums the signed balances for that row and renders its own delta chip.
- Optional footer row (sticky-bottom): **Change this month** — per-account and total net worth delta from `baseline` to the newest in-month row. Pure client-side computation.

#### `delta-chip.tsx`

- Props: `{ prev: bigint | null, curr: bigint, accountType: AccountType }`.
- Centralizes the "good direction" rule:
  - For `cash | checking | savings`: larger signed value = green, smaller = red.
  - For `credit_card`: signed value moving *toward zero* = green (less debt), moving away from zero = red.
- Renders `null` → muted dash. Zero delta → muted dash, not a colored chip.
- All of this lives in a single `signedDelta(accountType, prev, curr)` helper so there's one place for the sign rules.
- **Before creating this file**, check if a reusable delta chip already exists in the dashboard (e.g. in `features/dashboard/*`). If so, reuse / generalize it instead of adding a parallel component.

#### `month-navigator.tsx` (shared, extracted)

- Extract the dashboard's current month-picker into this file.
- Props: `{ month: string, onChange: (month: string) => void }`. Shows `◀ April 2026 ▶`.
- Replace the dashboard's inlined version with a call to this component as part of the same PR.

### Data flow

1. User clicks **Balance history** → `balance-history-view` mounts with `month = currentMonth`.
2. TanStack Query fires `GET /api/balance-history?month=2026-04`.
3. API validates, calls `getMonthMatrix`, returns the JSON shape above.
4. Table renders. Client computes delta chips and net-worth totals from `rows` + `baseline`.
5. User clicks a row → existing bulk-snapshot edit dialog opens, prefilled for that date.
6. User saves in the dialog → existing mutation runs → TanStack Query invalidates `balance-history` and `dashboard` keys → table refetches.
7. User presses ▶ on the month navigator → `month` state flips to next month → new query fires.

## Edge cases & error handling

- **Empty month (no in-month snapshots):** because `accounts` is filtered to accounts with in-month activity, all three of `accounts`, `rows`, and `baseline.balances` come back empty. The view renders an empty card: "No balance updates in April 2026" + a button that opens the existing bulk-snapshot form prefilled for today.
- **Single-row month with no prior history:** delta chips render as muted dashes (no `baseline` to diff against).
- **Single-row month with prior history:** delta chips compute against `baseline`.
- **Archived account with in-month snapshots:** included in `accounts` with `archivedAt` set; rendered as a dimmed column with an "archived" badge. Keeping it visible is important for audit — hiding it would silently drop information.
- **Account created mid-month but not yet snapshotted:** not included in `accounts` (no snapshots to show), so no column.
- **Multiple snapshots per account per date:** existing ordering rule — latest `(effective_date DESC, created_at DESC, id DESC)` wins. Older duplicates on the same date are never visible from this view. (This matches the entire rest of the app.)
- **Missing balance for one account on a given date:** the row's `balances` omits that account id. Rendered as a muted dash in that cell. Delta chip for the *next* row for that account compares against the most recent non-missing prior balance (walking older rows, then `baseline`). The row's **Net worth** column sums across only the accounts that *do* have a balance in that row *or* in any prior row (using the most recent known signed balance per account), so net worth does not dip artificially when a single account is missing. Accounts with no known balance as of that row — i.e. created after that date, with no prior snapshot — are simply excluded from the sum. (In practice, the bulk form writes all active accounts, so the missing case mostly applies to dates that predate an account being created.)
- **Invalid `month` query param:** API returns 400 with the Zod error. View surfaces a generic "Could not load balance history" error state (existing pattern).
- **Network / 5xx:** TanStack Query error state → existing error card pattern in the repo.
- **Workspace isolation:** enforced at both the middleware level and in every SQL predicate, consistent with existing query modules.

## Testing

**DB module** (`balance-snapshots.test.ts`, new cases):
- Pivot shape: `rows` sorted newest-first; correct per-account balances for a 3-account, 4-date month.
- Baseline: latest snapshot strictly before month start, per account; absent when no prior history.
- Signed amounts: credit card negated, assets positive.
- Archived accounts with in-month snapshots are present in `accounts` with `archivedAt` set.
- Workspace isolation: snapshots from another workspace never leak into results.
- Duplicate snapshots per `(account, date)`: latest by the standard ordering wins.
- Empty month: `rows: []`, `accounts: []`, `baseline.balances: {}`.

**API route** (new test file):
- Valid month → happy path.
- Invalid month (`2026-13`, `"april"`, missing) → 400 with Zod error.
- Auth: unauthenticated → 401 via existing middleware; cross-workspace → 403.

**Frontend component**:
- Single component test rendering a 3-account, 4-row month via a mocked query:
  - Correct column count (accounts + date + net worth).
  - Delta chips: correct color for each account type and direction (including credit-card "toward zero = green").
  - Net-worth column sums match expected.
  - Oldest row uses baseline to compute its delta.
- Empty-state render: CTA button visible; no table rendered.
- One-row month with no baseline: delta chips render as muted dashes, not colored chips.

No e2e. The repo's existing pattern does not include view-level e2e, so this follows convention.

## Decisions log

- **Layout:** dates as rows (newest first), accounts as columns, trailing net-worth column. Rejected accounts-as-rows because the month "grows downward" as the user enters more snapshots, and that's the natural reading direction for a ledger.
- **Sort direction:** newest first. Matches recent-transactions convention and the "recent activity is what you want first" heuristic.
- **Editing model:** click row → reuse the existing bulk-snapshot edit dialog for that date. No inline per-cell editing. Trades off audit granularity for zero new mutation surface; acceptable for v1.
- **Delta chip semantics:** centralized in `signedDelta(accountType, prev, curr)`. Credit-card "toward zero = green".
- **Month navigator:** extract from dashboard into a shared component. Small, targeted refactor as part of this feature.
- **Archived accounts:** shown as dimmed columns when they have in-month snapshots. Hiding would silently drop audit information.
- **No URL routing for month:** matches the app's current no-router state model.
- **No sparkline / CSV / multi-month:** explicitly out of scope. Dashboard already has the chart; export isn't requested.
- **Response encoding of amounts:** safe-integer `number` on the wire, matching the existing repo convention (`bigintToSafeNumber`). The safe-integer ceiling is effectively unlimited for personal-finance minor units, so string-encoding bigints is unnecessary.

## Open questions

None at spec approval.
