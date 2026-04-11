# Add Recurring Payment To Transactions

Each recurring item in the recurring list gets a one-click button that creates this month's real transaction from its template. Not automatic — the user still triggers each one.

## Goals

- One click creates a real `financial_transaction` from a `recurring_transaction` template for the current calendar month.
- Impossible to create duplicates for the same recurring item in the same month.
- The recurring list visibly shows which items have already been added this month.

## Non-Goals

- Editing amount or date before adding (use the existing transaction form for anything custom).
- Bulk "add all for this month" actions.
- Undo / unlink flows (the schema supports adding these later).
- Automatic scheduled creation on a cron.

## Schema Change

Add a nullable column `recurringTransactionId` (text, foreign key to `recurring_transaction.id`, `ON DELETE SET NULL`) to the `financial_transaction` table. One new Drizzle migration.

The column is nullable because manually-created transactions have no recurring source. `ON DELETE SET NULL` — if the recurring template is deleted, the historical transactions survive but lose their link.

No index added in this pass. The duplicate-detection query filters on `recurringTransactionId` + `transactionDate` in a tiny range and runs per-request against a list that grows with one row per recurring item per month, which is small.

## Backend

### New endpoint

`POST /api/transactions/from-recurring/:id`

- Empty body.
- Returns `201` with `{ transaction: TransactionRow }` on success.
- Returns `400 MISSING_ACCOUNT` if the recurring item has no `financialAccountId`.
- Returns `404 NOT_FOUND` if the recurring item doesn't exist, is archived, or belongs to another workspace.
- Returns `409 ALREADY_ADDED` if a transaction for this recurring item already exists in the current calendar month.

Wired in `src/api/routes/transactions.ts` following the existing POST pattern.

### New db function

`transactionsDb.createFromRecurring(workspaceId, userId, recurringId)` in `src/db/modules/transactions.ts`:

1. Load the recurring item. Verify `workspaceId` match and `archivedAt` is null. If not → `NOT_FOUND`.
2. If `financialAccountId` is null → `MISSING_ACCOUNT`.
3. Compute `transactionDate`:
   - Let `today` = today in the server's local date.
   - Let `clampedDay` = `min(recurring.dayOfMonth, daysInMonth(today))` — handles day 31 in short months.
   - Let `targetDate` = current year/month with `clampedDay`.
   - `transactionDate` = `min(targetDate, today)` — so we never create a future-dated transaction, which the existing zod schema rejects anyway.
4. Check for duplicates: query `financial_transaction` where `recurringTransactionId = :id` AND `transactionDate` is between the first and last day of the current calendar month. If any row exists → `ALREADY_ADDED`. (Manually-created transactions that happen to match by name/amount are not detected — duplicate detection is scoped to button-generated rows via the foreign key.)
5. Insert the new transaction copying `name`, `type`, `amountMinor`, `financialAccountId` from the recurring item, with the computed `transactionDate` and `recurringTransactionId` set.
6. Return the hydrated `TransactionRow`.

All steps run inside a single DB transaction so the duplicate check and the insert are atomic.

### Recurring list query extension

`recurringTransactionsDb.listActive` in `src/db/modules/recurring-transactions.ts` is extended to include an `addedThisMonth: boolean` per item. Implemented as a single LEFT JOIN on `financial_transaction` filtered to the current calendar month with matching `recurringTransactionId`, projected as a non-null existence check.

This avoids a second round-trip and keeps the button state consistent with the rest of the list.

The `RecurringTransactionRow` type in the schema file gets the new field. The zod output schema in `src/schemas/recurring-transactions.ts` is updated to reflect it.

## Frontend

### Mutation hook

New hook in `src/client/app/features/recurring-transactions/use-recurring-transaction-mutations.ts`:

```ts
useAddRecurringToTransactions(workspaceId)
```

- Calls `POST /api/transactions/from-recurring/:id`.
- On success: invalidates the recurring list query (to refresh `addedThisMonth`) and the transactions list query for the current month. Shows a toast `"Added {name} — {amount}"`.
- On `409 ALREADY_ADDED`: shows a neutral toast `"Already added this month"` and still invalidates the recurring list (the UI was out of sync).
- On `400 MISSING_ACCOUNT`: shouldn't normally reach here because the button is disabled in that case, but if it does, toasts `"Set an account on this recurring item first"`.

### Recurring list row

A new icon button in each row of `src/client/app/views/recurring-view.tsx`, placed between the amount and the Edit button.

States:

| Condition | Icon | Disabled | Tooltip |
|-----------|------|----------|---------|
| `addedThisMonth === true` | `Check` | yes | "Already added this month" |
| `financialAccountId === null` | `Plus` | yes | "Set an account on this recurring item first" |
| otherwise | `Plus` | no | "Add this month's transaction" |

The button uses `e.stopPropagation()` so clicking it doesn't also open the edit dialog (the row is already clickable for edit).

Pending state during the mutation: the button shows a spinner and is disabled. No confirmation dialog — one-click means one click.

## Files Touched

- `src/db/schema/app.ts` — add `recurringTransactionId` column to `financial_transaction`
- new drizzle migration file under the existing migrations folder
- `src/db/modules/transactions.ts` — new `createFromRecurring` function
- `src/db/modules/recurring-transactions.ts` — `listActive` returns `addedThisMonth`
- `src/schemas/recurring-transactions.ts` — output type includes `addedThisMonth`
- `src/api/routes/transactions.ts` — new POST route
- `src/client/app/features/recurring-transactions/use-recurring-transaction-mutations.ts` — new hook
- `src/client/app/views/recurring-view.tsx` — new button with three states

## Testing

- Unit test `createFromRecurring`:
  - happy path creates a transaction with the expected date and `recurringTransactionId` set
  - missing account → `MISSING_ACCOUNT`
  - archived / wrong workspace → `NOT_FOUND`
  - second call in the same month → `ALREADY_ADDED`
  - `dayOfMonth = 31` in a 30-day month clamps correctly
  - `dayOfMonth` in the future within the current month clamps to today
- Unit test `listActive` `addedThisMonth` flag: true only when a transaction exists in the current month with the matching link.
- Manual browser check of the three button states in the recurring view.
