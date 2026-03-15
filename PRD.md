# Personal Money Tracker PRD / MVP Plan

## 1. Product Summary

Build a small, internet-accessible household money tracker for manual use by a shared workspace.

V1 is intentionally narrow:

- Manual account balance snapshots are the source of truth.
- Manual transactions add context and help explain spending, but do not change balances.
- The dashboard focuses on the current calendar month only.
- The product is designed for one household now, while leaving room for one user to belong to multiple workspaces later.

This document covers the product scope and UX only. Technical implementation choices are intentionally deferred.

## 2. Problem Statement

The product should help a household answer three questions quickly:

1. What is our current total cash position across all accounts?
2. How much have we spent so far this month?
3. How much of that spending came from manually tracked transactions versus everyday spending visible only through balance changes?

The current approach is manual by design. Users will regularly enter account balances and occasionally log notable transactions. The app must make this fast, trustworthy, and easy to read on mobile and desktop.

## 3. Goals

### Primary Goals

- Show current total balance across all household accounts.
- Show current-month spending using balance changes plus manual income/expense annotations.
- Make daily or near-daily balance updates fast from a single bulk form.
- Support shared use by multiple household members in the same workspace.
- Keep the UI simple, modern, and readable on both mobile and desktop.

### Secondary Goals

- Provide a clear recent transaction list for context.
- Preserve historical records when accounts or transactions are hidden.
- Keep the product model simple enough to ship pragmatically, while avoiding dead ends for future growth.

## 4. Non-Goals for V1

- Budgets or remaining budget calculations
- Categories or spending breakdowns
- Transfers between own accounts
- Automatic bank sync or imports
- Multiple currencies
- Invitations, signup, or self-serve workspace creation
- User profile management beyond sign in and logout
- Role-based permissions
- Alerts for stale balance updates
- Historical month browsing
- Pagination, advanced filtering, or search
- Native mobile apps

## 5. Target Users and Context

### Primary Users

- Two adults in one household sharing the same financial workspace
- Both users can view and edit all workspace data

### Usage Pattern

- Quick balance snapshot entry almost every day
- Occasional transaction entry for salary, rent, loan payment, large bill, or other notable items
- Frequent dashboard checks to understand current position and current-month spending
- Mostly browser use, mobile first, with desktop support

## 6. Product Principles

### 1. Balance Updates Are the Source of Truth

The app should reflect real money position primarily from manually entered account balances.

### 2. Transactions Are Explanations, Not Ledger Postings

Transactions help explain income and major expenses, but they do not mutate account balances.

### 3. Current Month First

The dashboard and lists should optimize for the current month only. Older data may exist, but V1 does not provide month browsing.

### 4. Shared but Simple

Multiple users can collaborate in a workspace, but everyone has the same access.

### 5. Archive, Don’t Destroy

Historical records should remain intact even when accounts or transactions are hidden from the main UI.

## 7. Scope Overview

### In Scope

- Google sign-in
- Preconfigured users and workspace memberships
- Multiple workspaces supported in the model
- One user potentially belonging to multiple workspaces in the future
- Dashboard for current-month metrics
- Account creation, editing, and archiving
- Bulk account balance update flow
- Manual transaction creation, editing, and soft deletion
- Recent transaction list
- Current-month balance chart
- Responsive browser UI
- English UI with localized date/number formatting
- CZK currency only
- Recurring transaction tracking with dashboard summary

### Out of Scope

- Any budgeting features
- Any automation or suggested entries
- Any reconciliation workflow
- Any transaction categories or tags
- Any import/export workflow
- Any historical reporting beyond current-month dashboard calculations

## 8. Core Concepts and Business Rules

### 8.1 Workspace

A workspace represents one shared household dataset.

Rules:

- All financial data belongs to exactly one workspace.
- Users may belong to multiple workspaces in the future.
- In V1, all members of a workspace can view and edit everything.
- If a user has only one workspace, the product should enter it directly after login.
- If a user has multiple workspaces, V1 should auto-enter the first available workspace (no workspace selector UI in V1).

### 8.2 User

User accounts are pre-created outside the product.

Rules:

- Only pre-authorized Google accounts can sign in.
- There is no signup flow.
- There is no invitation flow.
- There is no profile editing in V1.
- Users can sign out.

### 8.3 Account

An account represents a place where money or debt is held.

Supported account types:

- Cash
- Checking
- Savings
- Credit card

Account fields for product purposes:

- Name
- Bank / institution name
- Account type
- Active / archived state

Rules:

- `name` is required.
- `bank / institution name` is optional, so cash can be modeled cleanly.
- Account names should be unique within a workspace to reduce ambiguity in forms and lists.
- Credit card balances are entered and stored as positive owed amounts, but displayed and calculated as negative.
- Account metadata can be edited after creation.
- Ongoing balance changes must happen only through the balance update flow, not through account edit.
- Archived accounts are hidden from default active UI and new-entry forms, but their historical records remain available for historical calculations and old references.
- To keep current totals unambiguous, an account should be archived only after its latest effective balance is zero.

### 8.4 Account Balance Update

An account balance update is a dated snapshot of one account’s balance.

Rules:

- Balance updates are entered in bulk from one screen covering all active accounts.
- The form defaults to today’s date.
- Users can choose a past date to backfill missed entries.
- When a date is selected, each account row should prefill with the latest known balance on or before that date. If none exists, it prefills as `0`.
- Saving the bulk form creates a balance update record for every active account shown in the form, even if the value was unchanged.
- This supports an explicit “no change today” snapshot instead of silently carrying forward a missing day.
- Multiple balance updates may exist for the same account on the same date.
- For any given date, the latest saved record by timestamp is the effective balance for that account on that date.
- Older same-day records remain stored for history/audit purposes.
- Archived accounts are excluded from new bulk balance update forms.

### 8.5 Transaction

A transaction is a manually entered notable money event.

Fields:

- Name
- Account
- Amount
- Date
- Type: income or expense

Rules:

- Users always enter a positive amount.
- The sign shown in the UI is derived from the type: income is positive, expense is negative.
- Every transaction belongs to one account.
- Transactions do not update balances.
- Transactions exist to explain income and major expenses, not to behave as a double-entry ledger.
- Transfers between own accounts are out of scope in V1.
- Transactions can be edited.
- Transactions can be soft-deleted.

Soft-delete decision for V1:

- A soft-deleted transaction is hidden from the default UI and excluded from user-visible transaction totals.
- The underlying record remains stored for auditability and possible future recovery.

### 8.6 Recurring Transaction

A recurring transaction represents a regular monthly income or expense that the household expects every month, such as rent, salary, loan payments, or subscriptions.

Fields:

- Name
- Bank name (optional free text)
- Type: income or expense
- Amount
- Day of month (1–31)

Rules:

- Users always enter a positive amount. The sign shown in the UI is derived from the type.
- Day of month indicates when the recurring item typically occurs each month.
- All recurring transaction data belongs to exactly one workspace.
- Recurring transactions can be created, edited, and archived.
- Archiving hides the recurring transaction from the active list and excludes it from recurring totals. The underlying record is preserved.
- Recurring totals are displayed on the dashboard as informational KPIs. They do not affect balance calculations, spending metrics, or any other dashboard numbers.
- Recurring transactions are independent of financial accounts and balance snapshots.

### 8.7 Historical Visibility

Rules:

- Archived accounts should still appear in historical chart calculations and old references.
- Soft-deleted transactions should not appear in default transaction lists.
- V1 does not provide a dedicated historical browsing surface outside the current month.
- Past-dated entries may still affect current-month calculations when relevant, especially for opening balance.

## 9. Metric Definitions

All dashboard math uses stored business dates (`date` fields) only.

For V1:

- Business events are stored as date-only values (`YYYY-MM-DD`) without time-of-day.
- Month calculations are based on those stored date values.
- Audit and logging timestamps are stored as timezone-aware timestamps.

### 9.1 Effective Account Balance

For a given account and date:

- Find the latest balance update on that date by save timestamp.
- If none exists on that date, carry forward the latest earlier balance.
- If no earlier balance exists, use `0`.

Credit card rule:

- User input is a positive owed amount.
- Stored balance value remains positive owed amount.
- Displayed and calculated effective balance is derived as negative.

### 9.2 Opening Month Balance

`opening_month_balance` =
sum of each account’s effective balance immediately before the first day of the current month.

If an account has no earlier balance history, its contribution is `0`.

### 9.3 Current Balance

`current_balance` =
sum of each non-deleted account’s current effective balance.

In practice, archived accounts should already be at `0` because archiving should happen after zeroing them out.

### 9.4 Monthly Spending So Far (Total)

`monthly_spending_total` =
`opening_month_balance - current_balance + sum(current_month_income_transactions)`

Where:

- `current_month_income_transactions` includes only non-deleted income transactions dated in the current month.

This matches the intended logic:

- balance decreases imply spending
- income is added back so spending is not understated

### 9.5 Monthly Spending So Far (Excluding Manually Tracked Transactions)

`monthly_spending_excluding_transactions` =
`monthly_spending_total - sum(current_month_expense_transactions)`

Where:

- `current_month_expense_transactions` includes only non-deleted expense transactions dated in the current month.

This number is meant to approximate everyday / uncaptured spending that is visible through balance changes but not explicitly logged as notable transactions.

### 9.6 Monthly Transaction Totals

- `monthly_transaction_income_total` = sum of current-month non-deleted income transactions
- `monthly_transaction_expense_total` = sum of current-month non-deleted expense transactions

### 9.7 Recurring Transaction Totals

- `recurring_income_total` = sum of all active (non-archived) recurring income transaction amounts
- `recurring_expense_total` = sum of all active (non-archived) recurring expense transaction amounts

These totals are purely informational. They do not affect current balance, monthly spending, or any other dashboard metric. They are displayed as a separate row of KPI cards on the dashboard, visible only when at least one active recurring transaction exists.

### 9.8 Total Balance Chart

The chart shows total balance over time for the current month.

Rules:

- X-axis is day-by-day across the current month up to today.
- For each day, use each account’s end-of-day effective balance.
- If a day has no new update, carry forward the last known balance.
- If an account has never had a balance before that day, treat it as `0`.
- Chart history should continue to reflect accounts that were later archived.

## 10. Information Architecture

V1 should be small and clear. The product needs four primary authenticated surfaces:

1. Login
2. Dashboard
3. Transactions
4. Accounts
5. Recurring

The dashboard is the home and primary workflow surface.

## 11. Functional Requirements by Area

### 11.1 Authentication and Workspace Access

#### Requirements

- The login page offers Google sign-in only.
- Only pre-authorized Google users can access the app.
- Unauthorized users see an access denied state.
- If the authenticated user belongs to one workspace, they are routed directly into it.
- If the authenticated user belongs to multiple workspaces, the app auto-enters the first available workspace.
- The app must always make the current workspace clear.
- The app must provide logout.

#### UX Notes

- No signup, invite, or account recovery UX is needed in V1.
- Keep the login page minimal and trustworthy.

### 11.2 Dashboard

#### Purpose

The dashboard is the default landing page after entering a workspace. It should answer the most important questions immediately and make balance updates the obvious next action.

#### Required Content

Primary metrics:

- Current balance
- Monthly spending so far (total)
- Monthly spending so far (excluding manually tracked transactions)

Secondary metrics:

- Monthly transaction expense total
- Monthly transaction income total

Tertiary metrics (shown only when recurring transactions exist):

- Recurring income total
- Recurring expense total

Supporting content:

- Total balance over time chart for the current month
- Per-account current balances for active accounts
- Recent transactions list
- Last balance snapshot date for trust/context

#### Required Actions

Primary CTA:

- Update balances

Secondary actions:

- Create account
- Add transaction
- Edit account
- Edit transaction
- Logout

#### Layout Expectations

- Mobile-first
- KPI cards first
- Chart directly beneath primary numbers
- Account balances and recent transactions visible without deep navigation
- The screen should feel calm, modern, and low-noise rather than dense

#### Recent Transactions on Dashboard

- Show a compact reverse-chronological list of recent non-deleted transactions
- Each row shows date, name, account, and signed amount
- Tapping/clicking a row opens edit

### 11.3 Accounts

#### Account List

The accounts area manages active and archived accounts.

Requirements:

- Show active accounts by default
- Each account row/card shows name, bank/institution, type, and current balance
- Provide edit action on each active account
- Provide archive action on each active account
- Archived accounts should be hidden from the main active view
- If archived accounts are exposed at all in V1, they should appear in a separate archived section

#### Create Account

Form fields:

- Name
- Bank / institution name
- Account type
- Initial balance

Rules:

- Initial balance is required.
- Credit card initial balance is entered as a positive owed amount.
- After creation, the user should see the account in active lists immediately.
- The initial balance should seed the account’s first effective balance.

Product decision:

- Account creation includes initial balance for simplicity.
- Later balance changes happen only via the bulk balance update flow.

#### Edit Account

Editable fields:

- Name
- Bank / institution name
- Account type

Not editable here:

- Current balance

Reason:

- Balance should have one source of truth: balance updates.

#### Archive Account

Requirements:

- Archiving requires explicit confirmation.
- Archived accounts stop appearing in active account lists and new-entry forms.
- Historical chart calculations and old references must remain intact.
- To avoid hidden money in current totals, account archive should only be allowed when the latest effective balance is `0`.

### 11.4 Balance Update Flow

This is the core data-entry workflow and the primary dashboard action.

#### Entry Point

- Main CTA on dashboard

#### Form Structure

- Date picker, defaulting to today
- One row per active account
- Each row shows account name and editable balance input
- Credit card rows should clearly indicate that the input is the amount owed

#### Form Behavior

- Inputs prefill from the latest known balance on or before the selected date
- User may change some values and leave others untouched
- Saving creates a full dated snapshot for all active accounts on screen
- Saving with no edited values still creates an explicit no-change snapshot for that date
- If the selected date already has one or more saved snapshots, the form loads the latest effective values for that date

#### Post-Save Behavior

- Return to dashboard or close modal/sheet with refreshed metrics
- Recompute the current-month chart and metrics immediately
- Show a clear success state

### 11.5 Transactions

#### Transactions List

Requirements:

- Show a simple reverse-chronological list
- No filters
- No pagination
- Focus on current-month non-deleted transactions

Each row shows:

- Date
- Name
- Account
- Signed amount

#### Add Transaction

Form fields:

- Name
- Account
- Amount
- Date
- Type: income / expense

Rules:

- Amount must be positive
- Type determines sign in displays and totals
- Archived accounts should not appear in new transaction forms
- Saving a transaction updates current-month transaction totals immediately if relevant

#### Edit Transaction

Requirements:

- User can edit all transaction fields
- Updated transaction immediately refreshes totals and recent transaction list

#### Delete Transaction

Requirements:

- Delete action requires confirmation
- Delete is soft-delete only
- Deleted transaction disappears from default UI
- Deleted transaction no longer contributes to user-visible transaction totals

### 11.6 Recurring Transactions

#### Recurring Transaction List

Requirements:

- Show active (non-archived) recurring transactions ordered by day of month
- Each row shows name, bank name (if present), day of month, type, and amount
- Provide edit action on each recurring transaction
- Provide archive action on each recurring transaction
- Clicking a row opens edit

Each row shows:

- Name
- Bank name (if set)
- Day of month (formatted as ordinal, e.g. "15th of month")
- Type badge (income / expense)
- Signed amount

#### Add Recurring Transaction

Form fields:

- Name
- Bank name (optional)
- Amount
- Day of month (1–31)
- Type: income / expense

Rules:

- Amount must be positive
- Type determines sign in displays and totals
- Day of month must be between 1 and 31

#### Edit Recurring Transaction

Requirements:

- User can edit all recurring transaction fields
- Updated recurring transaction immediately refreshes the list and dashboard totals

#### Archive Recurring Transaction

Requirements:

- Archive action requires explicit confirmation
- Archived recurring transactions disappear from the active list
- Archived recurring transactions no longer contribute to recurring totals on the dashboard
- The underlying record is preserved

## 12. Key User Flows

### 12.1 First Useful Session

1. User signs in with Google.
2. User enters their workspace.
3. User sees an empty dashboard.
4. User creates the first account.
5. User creates additional accounts as needed.
6. User updates balances from the dashboard CTA.
7. User optionally adds a notable transaction.
8. Dashboard now shows current balance, current-month spending, chart, and recent transactions.

### 12.2 Daily Balance Update

1. User opens dashboard.
2. User taps/clicks `Update balances`.
3. Date defaults to today.
4. User reviews prefilled balances for all active accounts.
5. User changes only the accounts that changed, or leaves everything unchanged.
6. User saves.
7. System stores a snapshot for all active accounts for that date.
8. Dashboard refreshes with updated metrics and chart.

### 12.3 Backfill a Missed Day

1. User opens `Update balances`.
2. User selects a past date.
3. Form prefills from the latest known balances on or before that date.
4. User enters the correct balances for that missed day.
5. User saves.
6. Current-month chart and metrics recompute using the backfilled data.

### 12.4 Log a Notable Transaction

1. User chooses `Add transaction`.
2. User enters name, account, amount, date, and type.
3. User saves.
4. Transaction appears in recent/current-month transaction lists.
5. Dashboard transaction totals and derived spending figures refresh if applicable.

### 12.5 Archive an Old Account

1. User opens account edit/details.
2. User confirms the account’s current effective balance is `0`.
3. User archives the account.
4. Account disappears from active lists and future update forms.
5. Historical chart calculations and old references remain intact.

### 12.6 Add a Recurring Transaction

1. User navigates to the Recurring section.
2. User taps/clicks `Add Recurring`.
3. User enters name, optional bank name, amount, day of month, and type.
4. User saves.
5. Recurring transaction appears in the active list.
6. Dashboard recurring totals update to reflect the new item.

### 12.7 Archive a Recurring Transaction

1. User navigates to the Recurring section.
2. User clicks the archive button on a recurring transaction.
3. User confirms in the archive dialog.
4. Recurring transaction disappears from the active list.
5. Dashboard recurring totals update to exclude the archived item.

## 13. UX Requirements

### Visual Style

- Modern, clean, and simple
- Neutral, calm interface rather than highly decorative UI
- Strong hierarchy around the three main numbers
- Minimal friction for repeated daily use

### Responsiveness

- Designed mobile first
- Must still work well on desktop
- Common actions should be reachable without excessive scrolling or deep navigation

### Language and Localization

- UI copy is in English
- Date formatting follows browser locale
- Number formatting follows browser locale
- Currency is always CZK

### Form UX

- Defaults should reduce typing
- Credit card inputs must be clearly explained to avoid sign confusion
- Income/expense type selection must make sign behavior obvious
- Destructive actions must always require confirmation

### Empty States

The product needs useful empty states for:

- No accessible workspace
- No accounts yet
- No current-month balance data yet
- No transactions yet
- No recurring transactions yet

Each empty state should:

- explain what is missing
- show the next best action
- avoid onboarding tours or multi-step setup flows

## 14. Security, Privacy, and Trust Requirements

These are product requirements, not implementation details.

- The app is private and authenticated; no financial data is visible publicly.
- Users can access only workspaces they belong to.
- Workspace data must be isolated from other workspaces.
- The system should retain created/updated timestamps and acting user for key records to support trust and future auditability.
- Business dates for financial entries are stored as date-only values; audit/log timestamps are timezone-aware.
- Sensitive actions such as archive and delete require confirmation.
- Logout must be available at all times from the authenticated app.

## 15. Product Decisions and Assumptions Locked for V1

- Budget functionality is removed from V1 entirely.
- Current-month dashboarding is the only reporting surface in V1.
- Users may enter past dates for backfill, even though the app does not offer past-month browsing.
- If no balance exists before the current month, the opening balance contribution is `0`.
- Bulk balance save always writes a full snapshot for all active accounts shown, even when unchanged.
- Multiple same-day balance updates are allowed; latest save timestamp wins.
- Credit card balance input is positive owed amount; displayed and calculated as negative.
- If a user has multiple workspaces, V1 auto-selects the first available workspace and does not provide a workspace selector UI.
- Transaction amount input is always positive; sign comes from income/expense type.
- Recurring transaction amounts represent monthly obligations. Frequency is always monthly.
- Day of month for recurring transactions is stored as an integer 1–31. No special handling for months with fewer than 31 days.
- Recurring totals on the dashboard are purely informational and do not affect balance, spending, or any other calculated metric.
- Recurring transactions are not linked to financial accounts; bank name is an optional free-text field.
- Transfers are out of scope.
- Filters, pagination, and stale-data alerts are out of scope.

## 16. MVP Success Criteria

The MVP is successful if:

- A user can understand current balance and current-month spending within a few seconds of landing on the dashboard.
- A user can complete a daily balance update for all active accounts in roughly one minute or less on mobile.
- Both household users can sign in and work in the same workspace without permission friction.
- The dashboard remains understandable even when using both balances and manual transactions together.
- Users trust that historical data is preserved when accounts are archived or transactions are soft-deleted.

## 17. Future Expansion Opportunities (Explicitly Deferred)

- Budgets and remaining budget
- Month browsing and historical reports
- Transaction categories
- Transfers between own accounts
- Search and filters
- Attachments or notes
- Import/export
- Notifications and stale-update reminders
- Richer audit log
- Self-serve workspace/user management

## 18. Build Priority Within Product Scope

### P0

- Google sign-in with pre-authorized access
- Workspace selection logic
- Account CRUD with archive
- Bulk balance update flow
- Dashboard metrics and chart
- Transaction CRUD with soft delete
- Responsive UI shell

### P1

- Recurring transaction CRUD with archive and dashboard summary
- Archived account section
- Last balance snapshot context on dashboard
- Additional polish for empty states and trust messaging

## 19. Summary

V1 should feel like a small, reliable household cash-position tracker, not a full finance platform.

The core loop is:

1. maintain accounts
2. save balance snapshots often
3. optionally log notable transactions
4. read the dashboard

If the product executes that loop well, it will already deliver the main value:

- current total balance
- current-month spending
- quick shared visibility for a household
