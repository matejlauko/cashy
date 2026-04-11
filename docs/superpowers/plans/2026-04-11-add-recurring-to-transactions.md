# Add Recurring Payment To Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each recurring item in the recurring list gets a one-click button that creates this month's real transaction from its template. Duplicates are prevented per recurring item per calendar month.

**Architecture:** Add `recurringTransactionId` nullable FK on `financial_transaction`. New backend function `createFromRecurring` enforces: account must exist on the template, no existing transaction for this recurring item in the current month. `listActive` for recurring items is extended with an `addedThisMonth` flag via EXISTS subquery. A new mutation hook and one icon button in the recurring list complete the UI.

**Tech Stack:** Bun, Hono, Drizzle ORM + PostgreSQL (via `postgres.js` and `db:push`), React 19, @tanstack/react-query v5, sonner, Tailwind, Radix UI, lucide-react.

**Reference spec:** `docs/superpowers/specs/2026-04-11-add-recurring-to-transactions-design.md`

**Convention note:** This project does NOT use versioned drizzle migration files. Schema changes are applied via `bun run db:push` which introspects the schema and mutates the live DB. The spec's "new drizzle migration file" phrase is satisfied by this workflow.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/lib/date.ts` | Modify | Add `computeFromRecurringDate(dayOfMonth, today)` pure helper |
| `src/lib/date.test.ts` | Create | Unit tests for the new helper |
| `src/db/schema/app.ts` | Modify | Add `recurringTransactionId` column + composite FK on `financial_transaction` |
| `src/db/modules/recurring-transactions.ts` | Modify | Extend `RecurringTransactionRow` with `addedThisMonth`; `listActive` EXISTS subquery |
| `src/db/modules/transactions.ts` | Modify | New `createFromRecurring` function |
| `src/api/routes/transactions.ts` | Modify | New `POST /from-recurring/:id` route + extended error status map |
| `src/client/app/features/recurring-transactions/use-recurring-transactions.ts` | Modify | Add `addedThisMonth` to the client type |
| `src/client/app/features/recurring-transactions/use-recurring-transaction-mutations.ts` | Modify | New `useAddRecurringToTransactions` hook |
| `src/client/app/views/recurring-view.tsx` | Modify | New icon button with three states |

---

## Task 1: Pure date helper for recurring → transaction date

**Files:**
- Modify: `src/lib/date.ts`
- Create: `src/lib/date.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/date.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { computeFromRecurringDate } from "@/lib/date";

describe("computeFromRecurringDate", () => {
  test("uses dayOfMonth when it is in the past this month", () => {
    expect(computeFromRecurringDate(1, "2026-04-11")).toBe("2026-04-01");
  });

  test("uses today when dayOfMonth matches today", () => {
    expect(computeFromRecurringDate(11, "2026-04-11")).toBe("2026-04-11");
  });

  test("clamps to today when dayOfMonth is still in the future this month", () => {
    expect(computeFromRecurringDate(25, "2026-04-11")).toBe("2026-04-11");
  });

  test("clamps day 31 to last day of a 30-day month when in the past", () => {
    // Today is May 31 — dayOfMonth=31 resolves to 2026-05-31
    expect(computeFromRecurringDate(31, "2026-05-31")).toBe("2026-05-31");
  });

  test("clamps day 31 to today in April (30-day month) when today is earlier than clamped day", () => {
    // April has 30 days. min(31, 30) = 30, which is still > today 11 → return today
    expect(computeFromRecurringDate(31, "2026-04-11")).toBe("2026-04-11");
  });

  test("clamps day 31 to 28 in a non-leap February when today matches", () => {
    // Feb 2026 has 28 days. min(31, 28) = 28. today is 28 → return 2026-02-28
    expect(computeFromRecurringDate(31, "2026-02-28")).toBe("2026-02-28");
  });

  test("clamps day 31 to today in a non-leap February when today is mid-month", () => {
    // min(31, 28) = 28, 28 > 15 → today
    expect(computeFromRecurringDate(31, "2026-02-15")).toBe("2026-02-15");
  });

  test("pads single-digit months and days correctly", () => {
    expect(computeFromRecurringDate(5, "2026-01-10")).toBe("2026-01-05");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/date.test.ts`

Expected: FAIL — `computeFromRecurringDate is not a function` (or similar import error).

- [ ] **Step 3: Implement the helper**

Append to `src/lib/date.ts`:

```ts
/**
 * Compute the transaction date when creating a transaction from a recurring
 * item. Uses the recurring item's day-of-month within the current month, but:
 * - clamps day-of-month to the actual length of the current month (so day 31
 *   in a 30-day month becomes day 30, day 31 in February becomes day 28/29),
 * - then clamps to `today` so the result is never in the future.
 *
 * Both `today` and the return value are "YYYY-MM-DD" strings.
 */
export function computeFromRecurringDate(
  dayOfMonth: number,
  today: string,
): string {
  const [year, month, todayDay] = today.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clampedDay = Math.min(dayOfMonth, daysInMonth);
  if (clampedDay > todayDay) {
    return today;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/date.test.ts`

Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/date.ts src/lib/date.test.ts
git commit -m "feat: add computeFromRecurringDate helper"
```

---

## Task 2: Add recurringTransactionId column to financial_transaction

**Files:**
- Modify: `src/db/schema/app.ts:152-188`

- [ ] **Step 1: Add the column to the schema**

In `src/db/schema/app.ts`, modify the `financialTransaction` table. Between `transactionDate` and `deletedAt`, add:

```ts
    recurringTransactionId: text("recurring_transaction_id"),
```

Then inside the `(t) => [ ... ]` callback, after the existing `foreignKey(...)` block, add a second composite FK that references `recurringTransaction` AND includes ON DELETE SET NULL:

```ts
    foreignKey({
      columns: [t.recurringTransactionId, t.workspaceId],
      foreignColumns: [recurringTransaction.id, recurringTransaction.workspaceId],
      name: "financial_transaction_recurring_workspace_fk",
    }).onDelete("set null"),
```

Note: `recurringTransaction` is declared below `financialTransaction` in the file. TypeScript hoisting handles the forward reference for the FK callback (which runs at runtime), but the import/declaration order must remain — do NOT reorder the tables. Drizzle only evaluates the callback when generating SQL, so the reference is resolved at that time.

Also add a composite UNIQUE on `(workspaceId, id)` to `recurringTransaction` if it does not already exist — the composite FK above needs it as a target. Check the file first: if `recurringTransaction` already has `unique("recurring_transaction_id_workspace_unique").on(t.workspaceId, t.id)`, skip this substep. Otherwise, add it inside the existing `(t) => [ ... ]` callback for `recurringTransaction`:

```ts
    unique("recurring_transaction_id_workspace_unique").on(t.workspaceId, t.id),
```

You will also need to add `unique` to the existing `drizzle-orm/pg-core` import at the top of the file if it is not already imported (it is — verify line 11).

- [ ] **Step 2: Apply the schema to the dev DB**

Run: `bun run db:push`

Expected: drizzle-kit shows the diff (new column + new FK + possibly new unique index) and applies it. If it prompts for confirmation on the unique constraint, accept it. If `db:push` asks whether you want to "add column" and "add foreign key", confirm yes.

If the DB is not running locally, start it first (check `compose.yaml` for the dev DB command).

- [ ] **Step 3: Verify the column exists**

Run: `bunx drizzle-kit studio` (opens Studio in the browser), or connect via psql and run:

```sql
\d financial_transaction
```

Expected: `recurring_transaction_id | text |` is present and the new FK constraint is listed.

Close Studio / psql when done.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/app.ts
git commit -m "feat: add recurring_transaction_id FK to financial_transaction"
```

---

## Task 3: Extend listActive with addedThisMonth flag

**Files:**
- Modify: `src/db/modules/recurring-transactions.ts`

- [ ] **Step 1: Add `addedThisMonth` to the row type**

In `src/db/modules/recurring-transactions.ts`, update `RecurringTransactionRow`:

```ts
export type RecurringTransactionRow = {
  id: string;
  name: string;
  financialAccountId: string | null;
  type: "income" | "expense";
  /** Always positive (raw DB value) */
  amountMinor: number;
  /** Positive for income, negative for expense */
  signedAmount: number;
  dayOfMonth: number;
  /** True when a transaction already exists for this recurring item in the current calendar month */
  addedThisMonth: boolean;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Extend mapRow**

Update `mapRow` in the same file to read the new field:

```ts
function mapRow(r: Record<string, unknown>): RecurringTransactionRow {
  const amountMinor = bigintToSafeNumber(r.amount_minor as bigint);
  const type = r.type as "income" | "expense";
  return {
    id: r.id as string,
    name: r.name as string,
    financialAccountId: (r.financial_account_id as string) ?? null,
    type,
    amountMinor,
    signedAmount: type === "income" ? amountMinor : -amountMinor,
    dayOfMonth: Number(r.day_of_month),
    addedThisMonth: r.added_this_month === true,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}
```

- [ ] **Step 3: Update the `listActive` query**

Add the new imports at the top of the file:

```ts
import { currentMonthStart, nextMonthStart } from "@/lib/date";
```

Replace the `listActive` function with:

```ts
export async function listActive(
  workspaceId: string,
): Promise<RecurringTransactionRow[]> {
  const monthStart = currentMonthStart();
  const monthEnd = nextMonthStart();
  const rows = await sql`
    SELECT
      rt.id,
      rt.name,
      rt.financial_account_id,
      rt.type,
      rt.amount_minor,
      rt.day_of_month,
      rt.created_at,
      rt.updated_at,
      EXISTS (
        SELECT 1 FROM financial_transaction ft
        WHERE ft.recurring_transaction_id = rt.id
          AND ft.workspace_id = rt.workspace_id
          AND ft.transaction_date >= ${monthStart}
          AND ft.transaction_date < ${monthEnd}
          AND ft.deleted_at IS NULL
      ) AS added_this_month
    FROM recurring_transaction rt
    WHERE rt.workspace_id = ${workspaceId}
      AND rt.archived_at IS NULL
    ORDER BY rt.day_of_month ASC, rt.name ASC
  `;
  return rows.map(mapRow);
}
```

- [ ] **Step 4: Update `getById` to also return the new field (for consistency)**

Replace `getById` in the same file with:

```ts
export async function getById(
  id: string,
  workspaceId: string,
): Promise<RecurringTransactionRow | null> {
  const monthStart = currentMonthStart();
  const monthEnd = nextMonthStart();
  const rows = await sql`
    SELECT
      rt.id,
      rt.name,
      rt.financial_account_id,
      rt.type,
      rt.amount_minor,
      rt.day_of_month,
      rt.created_at,
      rt.updated_at,
      EXISTS (
        SELECT 1 FROM financial_transaction ft
        WHERE ft.recurring_transaction_id = rt.id
          AND ft.workspace_id = rt.workspace_id
          AND ft.transaction_date >= ${monthStart}
          AND ft.transaction_date < ${monthEnd}
          AND ft.deleted_at IS NULL
      ) AS added_this_month
    FROM recurring_transaction rt
    WHERE rt.id = ${id}
      AND rt.workspace_id = ${workspaceId}
      AND rt.archived_at IS NULL
  `;
  if (rows.length === 0) return null;
  return mapRow(rows[0]!);
}
```

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`

Expected: no errors. If the zod output schema anywhere else enforces a closed shape for this row, you may see a downstream error — fix it at the source.

- [ ] **Step 6: Commit**

```bash
git add src/db/modules/recurring-transactions.ts
git commit -m "feat: return addedThisMonth on recurring transaction rows"
```

---

## Task 4: createFromRecurring db function

**Files:**
- Modify: `src/db/modules/transactions.ts`

- [ ] **Step 1: Add the imports**

At the top of `src/db/modules/transactions.ts`, extend the existing `@/lib/date` import to include the new helper:

```ts
import {
  today,
  currentMonthStart,
  nextMonthStart,
  monthStartFromKey,
  monthEndFromKey,
  computeFromRecurringDate,
} from "@/lib/date";
```

- [ ] **Step 2: Add the new function at the bottom of the Mutations section**

Append after the existing `softDelete` function:

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/modules/transactions.ts
git commit -m "feat: add createFromRecurring transaction mutation"
```

---

## Task 5: API route POST /from-recurring/:id

**Files:**
- Modify: `src/api/routes/transactions.ts`

- [ ] **Step 1: Extend the error-status mapping**

Replace the `domainErrorStatus` function at the top of `src/api/routes/transactions.ts` with:

```ts
function domainErrorStatus(code: string): ContentfulStatusCode {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "ALREADY_ADDED":
      return 409;
    case "INVALID_DATE_RANGE":
    case "ACCOUNT_NOT_FOUND":
    case "TRANSACTION_DELETED":
    case "MISSING_ACCOUNT":
      return 400;
    default:
      return 400;
  }
}
```

- [ ] **Step 2: Add the new route**

Append a new `.post(...)` chain link to `transactionsRoute` before the final `;`. Place it after the existing `POST /` route and before `PATCH /:id`, so it reads in the natural create-related ordering:

```ts
  // ── POST /from-recurring/:id — create transaction from recurring ──
  .post("/from-recurring/:id", async (c) => {
    const id = c.req.param("id");
    const workspaceId = c.get("workspaceId");
    const userId = c.get("user").id;

    try {
      const transaction = await transactionsDb.createFromRecurring(
        workspaceId,
        userId,
        id,
      );

      logger.info("Transaction created from recurring", {
        requestId: c.get("requestId"),
        userId,
        workspaceId,
        transactionId: transaction.id,
        recurringTransactionId: id,
      });

      return c.json({ transaction }, 201);
    } catch (err) {
      if (err instanceof TransactionError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          domainErrorStatus(err.code),
        );
      }
      throw err;
    }
  })
```

Routing note: `/from-recurring/:id` must be registered BEFORE any `/:id` route that could swallow it. In the current file `PATCH /:id` and `POST /:id/delete` come after, so inserting the new route between `POST /` and `PATCH /:id` is correct. Hono matches routes in declaration order within the same method, and `from-recurring` is a distinct path segment so there is no ambiguity with `POST /:id/delete` either — but keeping the create routes grouped at the top is still the cleanest option.

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`

Expected: no errors. If you see a type error in the RPC client side, defer it — Task 6 is where the client consumes this route.

- [ ] **Step 4: Commit**

```bash
git add src/api/routes/transactions.ts
git commit -m "feat: add POST /api/transactions/from-recurring/:id route"
```

---

## Task 6: Client mutation hook

**Files:**
- Modify: `src/client/app/features/recurring-transactions/use-recurring-transaction-mutations.ts`
- Modify: `src/client/app/features/recurring-transactions/use-recurring-transactions.ts`

- [ ] **Step 1: Add `addedThisMonth` to the client type**

In `src/client/app/features/recurring-transactions/use-recurring-transactions.ts`, update the `RecurringTransaction` type:

```ts
export type RecurringTransaction = {
  id: string;
  name: string;
  financialAccountId: string | null;
  type: "income" | "expense";
  amountMinor: number;
  signedAmount: number;
  dayOfMonth: number;
  addedThisMonth: boolean;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Add the mutation hook**

In `src/client/app/features/recurring-transactions/use-recurring-transaction-mutations.ts`, add the required imports at the top if missing:

```ts
import { currentMonthStart } from "@/lib/date";
```

Append the new hook to the end of the file:

```ts
export function useAddRecurringToTransactions(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recurringId: string) => {
      const res = await rpc.api.transactions["from-recurring"][":id"].$post({
        param: { id: recurringId },
      });
      if (!res.ok) {
        const err = await parseApiError(res);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      return res.json();
    },
    onSuccess: (data) => {
      const monthStart = currentMonthStart();
      queryClient.invalidateQueries({
        queryKey: ["transactions", workspaceId, monthStart],
      });
      queryClient.invalidateQueries({
        queryKey: ["recurring-transactions", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", workspaceId],
      });
      const name = (data as { transaction: { name: string } }).transaction.name;
      toast.success(`Added ${name}`);
    },
    onError: (err: AppError) => {
      if (err.code === "ALREADY_ADDED") {
        queryClient.invalidateQueries({
          queryKey: ["recurring-transactions", workspaceId],
        });
        toast.message("Already added this month");
        return;
      }
      toast.error(err.message);
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`

Expected: no errors. If the RPC path `rpc.api.transactions["from-recurring"][":id"].$post` fails to typecheck, double-check that the route from Task 5 was saved and the Hono `AppType` re-exports correctly. If the issue persists, confirm the dev server has been restarted at least once (Hono's type inference is at compile time, so a restart isn't technically required, but it's worth checking the route was indeed exported).

- [ ] **Step 4: Commit**

```bash
git add \
  src/client/app/features/recurring-transactions/use-recurring-transactions.ts \
  src/client/app/features/recurring-transactions/use-recurring-transaction-mutations.ts
git commit -m "feat: add useAddRecurringToTransactions hook"
```

---

## Task 7: Recurring view — one-click button

**Files:**
- Modify: `src/client/app/views/recurring-view.tsx`

- [ ] **Step 1: Update imports**

In `src/client/app/views/recurring-view.tsx`:

Add `Check` and `Loader2` to the lucide-react import:

```ts
import { Plus, Repeat, Pencil, Archive, Check, Loader2 } from "lucide-react";
```

Add the new mutation hook to the existing import from `use-recurring-transaction-mutations`:

```ts
import {
  useCreateRecurringTransaction,
  useUpdateRecurringTransaction,
  useArchiveRecurringTransaction,
  useAddRecurringToTransactions,
} from "@/client/app/features/recurring-transactions/use-recurring-transaction-mutations";
```

- [ ] **Step 2: Instantiate the mutation**

Inside the `RecurringView` component body, alongside the existing mutations around line 51-53, add:

```ts
  const addMutation = useAddRecurringToTransactions(workspaceId);
```

- [ ] **Step 3: Add the button to each row**

In the row's right-side button cluster (currently just Edit + Archive, around lines 206-240), insert a new button BEFORE the Edit button. The button has three states driven by `item.addedThisMonth`, `item.financialAccountId`, and `addMutation.isPending` (for the specific item being mutated).

Since `addMutation.isPending` is a single global flag for the hook, gate it by tracking which item is currently being added. Add local state near the other dialog states:

```ts
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
```

Replace the button cluster inside the row (the `<div className="flex shrink-0 items-center gap-1">` block that currently contains the amount span, Edit, and Archive buttons) with:

```tsx
              <div className="flex shrink-0 items-center gap-1">
                <span
                  className={cn(
                    "mr-1 text-sm font-medium tabular-nums",
                    item.type === "income"
                      ? "text-emerald-600"
                      : "text-destructive",
                  )}
                >
                  {item.type === "income" ? "+" : ""}
                  {formatMoneyMinor(item.signedAmount)}
                </span>
                {(() => {
                  const isAddingThis =
                    addMutation.isPending && addingItemId === item.id;
                  const disabled =
                    isAddingThis ||
                    item.addedThisMonth ||
                    !item.financialAccountId;
                  const tooltip = item.addedThisMonth
                    ? "Already added this month"
                    : !item.financialAccountId
                      ? "Set an account on this recurring item first"
                      : "Add this month's transaction";
                  return (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddingItemId(item.id);
                        addMutation.mutate(item.id, {
                          onSettled: () => setAddingItemId(null),
                        });
                      }}
                      aria-label={tooltip}
                      title={tooltip}
                    >
                      {isAddingThis ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : item.addedThisMonth ? (
                        <Check className="size-4" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                    </Button>
                  );
                })()}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(item);
                  }}
                  aria-label={`Edit ${item.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArchiveIntent(item);
                  }}
                  aria-label={`Archive ${item.name}`}
                >
                  <Archive className="size-4" />
                </Button>
              </div>
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/client/app/views/recurring-view.tsx
git commit -m "feat: add one-click add-to-transactions button in recurring view"
```

---

## Task 8: Manual end-to-end verification

No automated DB integration tests exist in this project, so the end-to-end flow must be verified manually before declaring done.

**Files:** (no code changes in this task)

- [ ] **Step 1: Start the dev server**

Run: `bun run dev`

Watch for the "server listening" log line. Keep this running in the background during verification.

- [ ] **Step 2: Prepare test data**

Open the app in a browser. In the Recurring view, create (or confirm the existence of) at least three recurring items for testing:

1. "Rent" — expense, `dayOfMonth = 1`, with a default account set
2. "Salary" — income, `dayOfMonth = 25`, with a default account set
3. "Netflix (no account)" — expense, `dayOfMonth = 15`, with NO default account (leave the field empty in the form)

If you can't create without an account due to form UX, pick any existing recurring item and edit it to remove the account. If the form doesn't allow removing the account either, mentally substitute this test with a SQL check: `UPDATE recurring_transaction SET financial_account_id = NULL WHERE name = 'Netflix';` against the dev DB.

- [ ] **Step 3: Happy path — add "Rent"**

Click the Plus button on the "Rent" row.

Expected:
- Spinner appears briefly on the button
- Toast "Added Rent"
- Button swaps to a Check icon and becomes disabled
- Switching to the Transactions view shows a new transaction named "Rent", amount matching, dated `2026-04-01` (today clamped to dayOfMonth=1 which is in the past)

- [ ] **Step 4: Duplicate prevention — click "Rent" again**

Return to Recurring view. Try clicking the (now disabled) Check button. Nothing should happen (button is disabled). Confirmed not reachable.

Then, force the duplicate path by deleting the client-side cache: hard-refresh the page (Cmd+Shift+R). The Rent row should still show a disabled Check icon because `addedThisMonth` is computed server-side.

- [ ] **Step 5: Future day clamping — add "Salary"**

Click the Plus button on the "Salary" row (dayOfMonth=25, today is 2026-04-11).

Expected:
- Toast "Added Salary"
- Transactions view shows a new "Salary" transaction dated `2026-04-11` (clamped to today because the 25th hasn't arrived yet)

- [ ] **Step 6: Missing account — "Netflix (no account)"**

Hover over the Plus button on the Netflix row.

Expected:
- Button is visibly disabled
- Tooltip reads "Set an account on this recurring item first"
- Clicking does nothing

- [ ] **Step 7: Dashboard + transactions list refresh**

After adding Rent and Salary, navigate to the Dashboard view.

Expected: the metric cards (monthly spending, recurring income, etc.) reflect the new transactions without a manual refresh. This verifies the query invalidation keys.

- [ ] **Step 8: Server-side duplicate path (optional)**

Open Postman / the browser devtools fetch tab and POST manually:

```
POST /api/transactions/from-recurring/<rent-recurring-id>
```

Expected: `409 ALREADY_ADDED` with body `{ error: { code: "ALREADY_ADDED", message: "..." } }`.

- [ ] **Step 9: No commit for this task**

This task is verification-only. If any step failed, open a new commit with the fix and re-verify before declaring the plan complete.

---

## Post-implementation checklist

- [ ] `bunx tsc --noEmit` is clean
- [ ] `bun test` passes (date helper tests + existing schema tests)
- [ ] Manual verification in Task 8 passed every step
- [ ] All commits are present on the current branch in chronological order:
  1. `feat: add computeFromRecurringDate helper`
  2. `feat: add recurring_transaction_id FK to financial_transaction`
  3. `feat: return addedThisMonth on recurring transaction rows`
  4. `feat: add createFromRecurring transaction mutation`
  5. `feat: add POST /api/transactions/from-recurring/:id route`
  6. `feat: add useAddRecurringToTransactions hook`
  7. `feat: add one-click add-to-transactions button in recurring view`
