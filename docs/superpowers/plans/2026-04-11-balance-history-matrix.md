# Balance History Ledger Matrix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new "Balance history" tab showing a monthly ledger-style matrix (rows = dates, columns = accounts + net worth) with per-cell delta chips, row-click reuses the existing balance update dialog for editing.

**Architecture:** New `GET /api/balance-history?month=YYYY-MM` endpoint returns a pivoted matrix for one month plus a "baseline" row (latest snapshot strictly before month start) for delta computation. Client fetches via TanStack Query, renders as an HTML table with sticky header, and reuses the existing `BalanceUpdateFormDialog` (extended with an `initialDate` prop) for row-click edits. No new write endpoints — the existing "latest snapshot wins" semantics make re-submitting for a date equivalent to editing.

**Tech Stack:** Bun + Hono + Bun SQL + Drizzle (schema only) + React 19 + TanStack Query + shadcn/ui + Tailwind 4 + Zod.

**Spec reference:** `docs/superpowers/specs/2026-04-11-balance-history-matrix-design.md`

**Testing philosophy (matches repo convention):** The repo has Zod schema unit tests but no DB module tests, no API route integration tests, and no component tests. This plan writes TDD tests where precedent exists (Zod schemas + pure function helpers) and uses typecheck + manual dev-server verification for DB/API/UI layers. Filling that gap is out of scope — it's its own infrastructure project.

---

## File Map

| Purpose | File | Action |
|---|---|---|
| DB query `getMonthMatrix` | `src/db/modules/balance-snapshots.ts` | modify (add function + types) |
| Zod schemas for API | `src/schemas/balance-history.ts` | create |
| Zod schema tests | `src/schemas/balance-history.test.ts` | create |
| API route | `src/api/routes/balance-history.ts` | create |
| API app wiring | `src/api/app.ts` | modify (mount route, middleware) |
| Pure helper `signedDelta` | `src/client/app/features/balance-history/signed-delta.ts` | create |
| Pure helper tests | `src/client/app/features/balance-history/signed-delta.test.ts` | create |
| Query hook | `src/client/app/features/balance-history/use-balance-history.ts` | create |
| Delta chip UI | `src/client/app/features/balance-history/delta-chip.tsx` | create |
| Matrix table UI | `src/client/app/features/balance-history/balance-history-table.tsx` | create |
| View | `src/client/app/views/balance-history-view.tsx` | create |
| Move month navigator to shared | `src/client/app/features/shared/month-navigator.tsx` | create (moved from dashboard) |
| Dashboard import update | `src/client/app/features/dashboard/use-dashboard.ts` or wherever it's used | modify |
| Edit dialog: `initialDate` prop | `src/client/app/features/balance-snapshots/balance-update-form.tsx` | modify |
| Add balance-history to invalidation list | `src/client/app/features/balance-snapshots/use-balance-mutations.ts` | modify |
| Nav entry + render block | `src/client/app/app-shell.tsx` | modify |

Total: 10 new files, 6 modified files.

---

## Task 1: Add `getMonthMatrix` to balance-snapshots DB module

**Files:**
- Modify: `src/db/modules/balance-snapshots.ts`

No test infrastructure exists for DB modules in this repo. We will verify in Task 11 by running the dev server and inspecting the API response. Typecheck is the gate for this task.

- [ ] **Step 1: Add types + function skeleton**

Append to `src/db/modules/balance-snapshots.ts` (after the existing `PrefillRow` type block, before the `Queries` section):

```typescript
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
```

- [ ] **Step 2: Import `nextMonthKey` helper**

At the top of `src/db/modules/balance-snapshots.ts`, add the import alongside the existing `today` import:

```typescript
import { nextMonthKey, today } from "@/lib/date";
```

`nextMonthKey` is already exported from `@/lib/date` (used by the month navigator) — no new helper to write.

- [ ] **Step 3: Implement `getMonthMatrix`**

Append after the `getPrefillByDate` function:

```typescript
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
    ORDER BY (fa.archived_at IS NOT NULL), fa.name
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
      bs.effective_date,
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
  const byDate = new Map<string, Record<string, number>>();
  for (const r of matrixRows as Record<string, unknown>[]) {
    const date = r.effective_date as string;
    const accountId = r.financial_account_id as string;
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

  const accountIdSet = new Set(accounts.map((a) => a.id));
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
```

- [ ] **Step 4: Typecheck**

Run: `bun run tsc --noEmit` (or whatever the repo's typecheck script is — check `package.json` scripts for `typecheck`, `check`, `lint`).

Expected: no errors in `src/db/modules/balance-snapshots.ts` or related files.

If typecheck fails on `nextMonthKey` import, complete Step 2 first.

- [ ] **Step 5: Commit**

```bash
git add src/db/modules/balance-snapshots.ts
git commit -m "feat: add getMonthMatrix DB query for balance history view"
```

---

## Task 2: Zod schemas + schema tests for balance-history API

**Files:**
- Create: `src/schemas/balance-history.ts`
- Create: `src/schemas/balance-history.test.ts`

- [ ] **Step 1: Write the failing schema tests**

Create `src/schemas/balance-history.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { balanceHistoryQuerySchema } from "@/schemas/balance-history";

describe("balanceHistoryQuerySchema", () => {
  test("accepts a valid YYYY-MM string", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "2026-04" });
    expect(result.success).toBe(true);
  });

  test("accepts single-digit-like months with leading zero", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "2026-01" });
    expect(result.success).toBe(true);
  });

  test("accepts December", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "2026-12" });
    expect(result.success).toBe(true);
  });

  test("rejects month without leading zero", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "2026-4" });
    expect(result.success).toBe(false);
  });

  test("rejects month 13", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "2026-13" });
    expect(result.success).toBe(false);
  });

  test("rejects month 00", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "2026-00" });
    expect(result.success).toBe(false);
  });

  test("rejects non-string input", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: 202604 });
    expect(result.success).toBe(false);
  });

  test("rejects missing field", () => {
    const result = balanceHistoryQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("rejects garbage string", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "april" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/schemas/balance-history.test.ts`

Expected: FAIL with "Cannot find module '@/schemas/balance-history'" or similar.

- [ ] **Step 3: Implement the schema**

Create `src/schemas/balance-history.ts`:

```typescript
import { z } from "zod";

const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Must be a valid YYYY-MM month key");

export const balanceHistoryQuerySchema = z.object({
  month: monthKeySchema,
});

export type BalanceHistoryQuery = z.infer<typeof balanceHistoryQuerySchema>;

// ─── Response shape (for client-side typing; not validated server-side) ────

export type BalanceHistoryAccountDto = {
  id: string;
  name: string;
  type: "cash" | "checking" | "savings" | "credit_card";
  archivedAt: string | null;
};

export type BalanceHistoryRowDto = {
  date: string; // YYYY-MM-DD
  balances: Record<string, number>; // signed minor units
};

export type BalanceHistoryResponse = {
  month: string;
  accounts: BalanceHistoryAccountDto[];
  rows: BalanceHistoryRowDto[];
  baseline: { balances: Record<string, number> };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/schemas/balance-history.test.ts`

Expected: all 9 tests pass.

- [ ] **Step 5: Typecheck**

Run: `bun run tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/schemas/balance-history.ts src/schemas/balance-history.test.ts
git commit -m "feat: add Zod schema + types for balance history API"
```

---

## Task 3: API route — `GET /api/balance-history`

**Files:**
- Create: `src/api/routes/balance-history.ts`
- Modify: `src/api/app.ts`

- [ ] **Step 1: Create the route file**

Create `src/api/routes/balance-history.ts`:

```typescript
import { Hono } from "hono";
import type { AppEnv } from "@/api/context";
import * as balanceSnapshotsDb from "@/db/modules/balance-snapshots";
import { balanceHistoryQuerySchema } from "@/schemas/balance-history";

export const balanceHistoryRoute = new Hono<AppEnv>()
  // ── GET / — monthly matrix of balance snapshots ──────────────────
  .get("/", async (c) => {
    const month = c.req.query("month");
    const result = balanceHistoryQuerySchema.safeParse({ month });
    if (!result.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters",
            details: result.error.issues,
          },
        },
        400,
      );
    }

    const workspaceId = c.get("workspaceId");
    const matrix = await balanceSnapshotsDb.getMonthMatrix(
      workspaceId,
      result.data.month,
    );

    return c.json({
      month: result.data.month,
      accounts: matrix.accounts,
      rows: matrix.rows,
      baseline: matrix.baseline,
    });
  });
```

**Verify the `AppEnv` import path.** Check `src/api/routes/balance-snapshots.ts` for the exact import — it may be `@/api/context` or `@/api/types` or inlined. Mirror whatever that file does.

- [ ] **Step 2: Mount in app.ts**

Modify `src/api/app.ts`.

Find the import block for existing routes (search for `balanceSnapshotsRoute`) and add:

```typescript
import { balanceHistoryRoute } from "@/api/routes/balance-history";
```

Find the protected-route middleware block (search for `sessionMiddleware, workspaceMiddleware` — there will be lines like `app.use("/session", sessionMiddleware, workspaceMiddleware);`) and add:

```typescript
app.use("/balance-history", sessionMiddleware, workspaceMiddleware);
```

Find the `routes` chain (search for `.route("/balance-snapshots", balanceSnapshotsRoute)`) and add **after** the balance-snapshots line to keep related routes together:

```typescript
const routes = app
  .route("/session", sessionRoute)
  .route("/workspaces", workspacesRoute)
  .route("/accounts", accountsRoute)
  .route("/balance-snapshots", balanceSnapshotsRoute)
  .route("/balance-history", balanceHistoryRoute) // NEW
  .route("/transactions", transactionsRoute)
  .route("/dashboard", dashboardRoute)
  .route("/recurring-transactions", recurringTransactionsRoute)
  .route("/budget-items", budgetItemsRoute);
```

- [ ] **Step 3: Typecheck**

Run: `bun run tsc --noEmit`

Expected: no errors. In particular, `AppType` (exported from `app.ts`) should now include the new route without type conflicts — this is critical for Hono RPC type inference on the client.

- [ ] **Step 4: Smoke-test with curl against the dev server**

Start the dev server in a separate terminal: `bun --hot ./src/index.ts` (or whatever the repo's dev command is — check `package.json` scripts).

Log in via the UI to get a session cookie, then:

```bash
curl -i -b "<session cookie>" \
  "http://localhost:3000/api/balance-history?month=2026-04"
```

Expected: `200 OK` with JSON body shaped `{ month, accounts, rows, baseline }`. 400 for `?month=garbage`. 401 for no auth.

If you don't want to mess with cookies, you can postpone this verification to Task 11 (end-to-end) and only check typecheck here.

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/balance-history.ts src/api/app.ts
git commit -m "feat: add GET /api/balance-history route"
```

---

## Task 4: Pure helper `signedDelta` + unit tests

**Files:**
- Create: `src/client/app/features/balance-history/signed-delta.ts`
- Create: `src/client/app/features/balance-history/signed-delta.test.ts`

This helper encodes the "good direction" rule: assets grow = good, credit-card signed balance moving toward zero (less debt) = good.

- [ ] **Step 1: Write the failing tests**

Create `src/client/app/features/balance-history/signed-delta.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { signedDelta } from "./signed-delta";

describe("signedDelta (assets)", () => {
  test("assets: positive change is UP direction", () => {
    expect(signedDelta("checking", 10000, 12000)).toEqual({
      delta: 2000,
      direction: "up",
    });
  });

  test("assets: negative change is DOWN direction", () => {
    expect(signedDelta("savings", 50000, 45000)).toEqual({
      delta: -5000,
      direction: "down",
    });
  });

  test("assets: zero change is FLAT direction", () => {
    expect(signedDelta("cash", 10000, 10000)).toEqual({
      delta: 0,
      direction: "flat",
    });
  });
});

describe("signedDelta (credit_card)", () => {
  test("less debt (signed value toward zero from below) is UP direction", () => {
    // -10000 → -8000 means less debt (signed went from -10000 to -8000, +2000)
    expect(signedDelta("credit_card", -10000, -8000)).toEqual({
      delta: 2000,
      direction: "up",
    });
  });

  test("more debt (signed value further from zero below) is DOWN direction", () => {
    expect(signedDelta("credit_card", -8000, -10000)).toEqual({
      delta: -2000,
      direction: "down",
    });
  });

  test("flat credit-card balance is FLAT", () => {
    expect(signedDelta("credit_card", -5000, -5000)).toEqual({
      delta: 0,
      direction: "flat",
    });
  });

  test("credit card paid off: -1000 → 0 is UP", () => {
    expect(signedDelta("credit_card", -1000, 0)).toEqual({
      delta: 1000,
      direction: "up",
    });
  });
});

describe("signedDelta (no previous value)", () => {
  test("returns null delta and 'none' direction when prev is null", () => {
    expect(signedDelta("checking", null, 5000)).toEqual({
      delta: null,
      direction: "none",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/app/features/balance-history/signed-delta.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/client/app/features/balance-history/signed-delta.ts`:

```typescript
export type AccountType = "cash" | "checking" | "savings" | "credit_card";

export type Direction = "up" | "down" | "flat" | "none";

export type DeltaResult = {
  delta: number | null;
  direction: Direction;
};

/**
 * Compute a delta between two SIGNED minor-unit balances for the same account
 * and classify the direction as "up" (good), "down" (bad), "flat", or "none".
 *
 * Because `curr` and `prev` are already signed (credit cards carry negative
 * values), a numerically larger value always means "more favorable" for the
 * user: an asset going up, or a credit-card balance moving toward zero.
 */
export function signedDelta(
  _accountType: AccountType,
  prev: number | null,
  curr: number,
): DeltaResult {
  if (prev === null) return { delta: null, direction: "none" };
  const delta = curr - prev;
  if (delta > 0) return { delta, direction: "up" };
  if (delta < 0) return { delta, direction: "down" };
  return { delta: 0, direction: "flat" };
}
```

**Note:** The `accountType` parameter is currently unused because signed amounts already encode the direction correctly (credit card values are pre-negated by the API). The parameter is kept in the signature so future per-type adjustments don't require an API change. Prefix with `_` to silence the unused-parameter lint.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/app/features/balance-history/signed-delta.test.ts`

Expected: all 9 tests pass.

- [ ] **Step 5: Typecheck**

Run: `bun run tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/client/app/features/balance-history/signed-delta.ts src/client/app/features/balance-history/signed-delta.test.ts
git commit -m "feat: add signedDelta helper for balance history deltas"
```

---

## Task 5: Move month navigator to a shared location

**Files:**
- Create: `src/client/app/features/shared/month-navigator.tsx` (moved content)
- Delete: `src/client/app/features/dashboard/month-navigator.tsx`
- Modify: any dashboard file importing the old path

- [ ] **Step 1: Find existing usages**

Run: `rg -n "features/dashboard/month-navigator" src/`

Record the list of files that import it. There is at least the dashboard view.

- [ ] **Step 2: Create the new shared file**

Create `src/client/app/features/shared/month-navigator.tsx` with the exact content of the existing `src/client/app/features/dashboard/month-navigator.tsx`:

```typescript
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  prevMonthKey,
  nextMonthKey,
  currentMonthKey,
  formatMonthLabel,
} from "@/lib/date";

type MonthNavigatorProps = {
  month: string;
  onChange: (month: string) => void;
};

export function MonthNavigator({ month, onChange }: MonthNavigatorProps) {
  const isCurrentMonth = month === currentMonthKey();

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => onChange(prevMonthKey(month))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-[140px] text-center text-sm font-medium">
        {formatMonthLabel(month)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => onChange(nextMonthKey(month))}
        disabled={isCurrentMonth}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Delete the old file**

```bash
rm src/client/app/features/dashboard/month-navigator.tsx
```

- [ ] **Step 4: Update imports in every file listed in Step 1**

Replace `from "@/client/app/features/dashboard/month-navigator"` with `from "@/client/app/features/shared/month-navigator"` everywhere the old path appears.

- [ ] **Step 5: Typecheck**

Run: `bun run tsc --noEmit`

Expected: no errors (import paths all resolve).

- [ ] **Step 6: Verify dashboard still works**

Start the dev server: `bun --hot ./src/index.ts`. Open the dashboard. Click through months with the ◀ / ▶ buttons. Expected: behavior unchanged.

- [ ] **Step 7: Commit**

```bash
git add -A src/client/app/features/shared/month-navigator.tsx src/client/app/features/dashboard/month-navigator.tsx
# plus any dashboard files whose imports changed — list them explicitly
git commit -m "refactor: move MonthNavigator to shared/ for reuse"
```

---

## Task 6: Adapt `BalanceUpdateFormDialog` for edit mode + extend invalidation

**Files:**
- Modify: `src/client/app/features/balance-snapshots/balance-update-form.tsx`
- Modify: `src/client/app/features/balance-snapshots/use-balance-mutations.ts`

The existing dialog creates new snapshots for a date, prefilled from the latest snapshot *at or before* that date. The existing `latest-wins` ordering in the DB means re-submitting for an existing date implicitly overwrites it. So "edit" is achieved by **(a)** letting callers specify the initial date and **(b)** keeping the date field locked to that date.

- [ ] **Step 1: Add an `initialDate` prop to the dialog component**

Modify `src/client/app/features/balance-snapshots/balance-update-form.tsx`.

Change the props interface:

```typescript
interface BalanceUpdateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onCreateAccount?: () => void;
  /**
   * When provided, the dialog opens in "edit existing date" mode:
   * - the date field is preset to this value and disabled,
   * - prefill shows the balances saved for that date (the existing
   *   `effective_date <= date` query already returns the correct data),
   * - submitting creates a new set of snapshots for the same date; the
   *   DB's latest-wins ordering makes this effectively an upsert.
   */
  initialDate?: string;
}
```

Change the function signature to destructure `initialDate`:

```typescript
export function BalanceUpdateFormDialog({
  open,
  onOpenChange,
  workspaceId,
  onCreateAccount,
  initialDate,
}: BalanceUpdateFormDialogProps) {
```

Change the `useState(today())` initializer and the "reset on open" effect:

```typescript
const [date, setDate] = useState(initialDate ?? today());
```

and:

```typescript
// Reset form state when dialog opens
useEffect(() => {
  if (open) {
    setDate(initialDate ?? today());
    setFormError(null);
  }
}, [open, initialDate]);
```

Find the `<Input type="date" ...>` element and make it disabled in edit mode:

```typescript
<Input
  id="balance-date"
  type="date"
  max={today()}
  value={date}
  onChange={(e) => setDate(e.target.value)}
  disabled={initialDate !== undefined}
/>
```

And update `DialogTitle` to reflect edit mode:

```typescript
<DialogTitle>
  {initialDate ? "Edit balances" : "Update Balances"}
</DialogTitle>
<DialogDescription>
  {initialDate
    ? `Edit balances recorded for ${initialDate}. Saving creates a new snapshot that supersedes the previous one.`
    : "Enter current balances for all active accounts."}
</DialogDescription>
```

- [ ] **Step 2: Add `balance-history` key to mutation invalidation**

Modify `src/client/app/features/balance-snapshots/use-balance-mutations.ts`. In the `onSuccess` handler, add a fourth invalidation:

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["accounts", workspaceId] });
  queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] });
  queryClient.invalidateQueries({
    queryKey: ["balance-prefill", workspaceId],
  });
  queryClient.invalidateQueries({
    queryKey: ["balance-history", workspaceId],
  });
  toast.success("Balances updated");
},
```

- [ ] **Step 3: Typecheck**

Run: `bun run tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Verify dashboard flow still works**

In the dev server, click "Update Balances" on the dashboard. Dialog opens, date defaults to today, date field is **enabled** (because `initialDate` is undefined). Submit. Expected: unchanged behavior.

- [ ] **Step 5: Commit**

```bash
git add src/client/app/features/balance-snapshots/balance-update-form.tsx src/client/app/features/balance-snapshots/use-balance-mutations.ts
git commit -m "feat: add initialDate edit mode to BalanceUpdateFormDialog"
```

---

## Task 7: Query hook `useBalanceHistory`

**Files:**
- Create: `src/client/app/features/balance-history/use-balance-history.ts`

- [ ] **Step 1: Create the hook**

Create `src/client/app/features/balance-history/use-balance-history.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/client/rpc";
import type { BalanceHistoryResponse } from "@/schemas/balance-history";

export function useBalanceHistory(workspaceId: string, month: string) {
  return useQuery({
    queryKey: ["balance-history", workspaceId, month],
    queryFn: async (): Promise<BalanceHistoryResponse> => {
      const res = await rpc.api["balance-history"].$get({
        query: { month },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          (body as { error?: { message?: string } } | null)?.error?.message ??
          "Failed to load balance history";
        throw new Error(message);
      }
      return (await res.json()) as BalanceHistoryResponse;
    },
    enabled: !!month,
  });
}
```

**Verify the RPC path.** If `rpc.api["balance-history"]` fails type inference, the issue is in Task 3 Step 2 — re-check the route mount in `src/api/app.ts`. Hono RPC infers route names from the `.route("/name", handler)` chain.

- [ ] **Step 2: Typecheck**

Run: `bun run tsc --noEmit`

Expected: no errors. Response type should be fully inferred through the chain — if you see `any` showing up in the return, check that `AppType` was correctly updated in Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/client/app/features/balance-history/use-balance-history.ts
git commit -m "feat: add useBalanceHistory query hook"
```

---

## Task 8: `DeltaChip` component

**Files:**
- Create: `src/client/app/features/balance-history/delta-chip.tsx`

- [ ] **Step 1: Create the component**

Create `src/client/app/features/balance-history/delta-chip.tsx`:

```typescript
import { cn } from "@/lib/utils";
import { formatMoneyMinor } from "@/lib/money";
import { signedDelta, type AccountType } from "./signed-delta";

type DeltaChipProps = {
  prev: number | null;
  curr: number;
  accountType: AccountType;
  className?: string;
};

/**
 * Small colored pill showing the signed delta between two balances.
 * Up (good) = green. Down (bad) = red. Flat = muted dash. None = muted dash.
 */
export function DeltaChip({ prev, curr, accountType, className }: DeltaChipProps) {
  const { delta, direction } = signedDelta(accountType, prev, curr);

  if (direction === "none" || direction === "flat") {
    return (
      <span
        className={cn(
          "text-[11px] font-medium text-muted-foreground tabular-nums",
          className,
        )}
      >
        —
      </span>
    );
  }

  const sign = delta! > 0 ? "+" : "";
  const label = `${sign}${formatMoneyMinor(delta!)}`;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        direction === "up" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        direction === "down" && "bg-rose-500/10 text-rose-600 dark:text-rose-400",
        className,
      )}
    >
      {label}
    </span>
  );
}
```

**Verify `cn` import path.** It should be `@/lib/utils` per shadcn convention — check an existing UI file if uncertain.

- [ ] **Step 2: Typecheck**

Run: `bun run tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/client/app/features/balance-history/delta-chip.tsx
git commit -m "feat: add DeltaChip component for balance history"
```

---

## Task 9: `BalanceHistoryTable` component

**Files:**
- Create: `src/client/app/features/balance-history/balance-history-table.tsx`

The table renders rows newest-first, computes deltas against the next-older row in the same account (or `baseline` for the oldest row), and shows a trailing net-worth column plus a "change this month" footer.

- [ ] **Step 1: Create the component**

Create `src/client/app/features/balance-history/balance-history-table.tsx`:

```typescript
import { cn } from "@/lib/utils";
import { formatMoneyMinor } from "@/lib/money";
import type { BalanceHistoryResponse } from "@/schemas/balance-history";
import { DeltaChip } from "./delta-chip";

type BalanceHistoryTableProps = {
  data: BalanceHistoryResponse;
  onEditRow: (date: string) => void;
};

/**
 * For each row (ordered newest-first), compute the "previous" balance per
 * account by walking older rows. Missing cells carry forward the last known
 * signed balance; accounts with no prior known value at all are excluded
 * from the net-worth sum for that row.
 */
function buildRowViews(data: BalanceHistoryResponse) {
  // rows[0] = newest. We want to compute deltas vs the next-older row of
  // the same account. Walking oldest → newest is simpler for carry-forward.
  const accountIds = data.accounts.map((a) => a.id);
  const reversed = [...data.rows].reverse(); // oldest first

  // Carry-forward state seeded with the baseline.
  const lastKnown: Record<string, number | null> = {};
  for (const id of accountIds) {
    lastKnown[id] = data.baseline.balances[id] ?? null;
  }

  // For each row in oldest-first order, emit a view with per-account
  // { curr, prev } and the row's net worth based on carry-forward state
  // BEFORE applying this row's updates.
  const views = reversed.map((row) => {
    const cells: Record<
      string,
      { curr: number | null; prev: number | null }
    > = {};
    for (const id of accountIds) {
      const prev = lastKnown[id]; // may be null (no history yet)
      const curr = row.balances[id];
      cells[id] = {
        curr: curr !== undefined ? curr : null,
        prev: prev ?? null,
      };
    }

    // Net worth for this row: sum of curr (or carry-forward from lastKnown
    // when curr is missing) across accounts that have any known value.
    let rowNet = 0;
    let rowHasAny = false;
    for (const id of accountIds) {
      const curr = row.balances[id];
      const effective = curr !== undefined ? curr : lastKnown[id];
      if (effective !== null && effective !== undefined) {
        rowNet += effective;
        rowHasAny = true;
      }
    }

    // Update carry-forward state AFTER computing deltas.
    for (const id of accountIds) {
      const curr = row.balances[id];
      if (curr !== undefined) lastKnown[id] = curr;
    }

    return {
      date: row.date,
      cells,
      rowNet: rowHasAny ? rowNet : null,
    };
  });

  // Baseline net worth (used for "Change this month" footer).
  let baselineNet = 0;
  let baselineHasAny = false;
  for (const id of accountIds) {
    const v = data.baseline.balances[id];
    if (v !== undefined) {
      baselineNet += v;
      baselineHasAny = true;
    }
  }

  // Net-worth prev-lookup map for delta chips: for each view, the previous
  // row's net worth is the net of the view just before it in oldest-first
  // order, and for the very first view it's the baseline (if any).
  const netPrev: (number | null)[] = [];
  for (let i = 0; i < views.length; i++) {
    if (i === 0) {
      netPrev.push(baselineHasAny ? baselineNet : null);
    } else {
      netPrev.push(views[i - 1]!.rowNet);
    }
  }

  // Flip back to newest-first for rendering.
  const displayRows = views
    .map((v, i) => ({
      date: v.date,
      cells: v.cells,
      rowNet: v.rowNet,
      rowNetPrev: netPrev[i] ?? null,
    }))
    .reverse();

  // "Change this month" — newest view's net minus baseline net.
  const newest = views[views.length - 1];
  const monthChange =
    newest && newest.rowNet !== null && baselineHasAny
      ? newest.rowNet - baselineNet
      : null;

  return { displayRows, baselineNet: baselineHasAny ? baselineNet : null, monthChange };
}

export function BalanceHistoryTable({ data, onEditRow }: BalanceHistoryTableProps) {
  const { displayRows, monthChange } = buildRowViews(data);

  if (displayRows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium">
              Date
            </th>
            {data.accounts.map((account) => (
              <th
                key={account.id}
                className={cn(
                  "px-3 py-2 text-right font-medium",
                  account.archivedAt && "text-muted-foreground",
                )}
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>{account.name}</span>
                  {account.archivedAt && (
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      archived
                    </span>
                  )}
                </div>
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Net worth</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, rowIdx) => (
            <tr
              key={row.date}
              onClick={() => onEditRow(row.date)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEditRow(row.date);
                }
              }}
              tabIndex={0}
              role="button"
              className={cn(
                "cursor-pointer border-t outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/60",
                rowIdx % 2 === 1 && "bg-muted/20",
              )}
            >
              <td className="sticky left-0 z-10 bg-inherit px-3 py-2 font-mono text-xs">
                {row.date}
              </td>
              {data.accounts.map((account) => {
                const cell = row.cells[account.id]!;
                return (
                  <td
                    key={account.id}
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      account.archivedAt && "text-muted-foreground",
                    )}
                  >
                    {cell.curr === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <span>{formatMoneyMinor(cell.curr)}</span>
                        <DeltaChip
                          prev={cell.prev}
                          curr={cell.curr}
                          accountType={account.type}
                        />
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right tabular-nums font-medium">
                {row.rowNet === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-col items-end gap-0.5">
                    <span>{formatMoneyMinor(row.rowNet)}</span>
                    <DeltaChip
                      prev={row.rowNetPrev}
                      curr={row.rowNet}
                      accountType="checking"
                    />
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        {monthChange !== null && (
          <tfoot>
            <tr className="border-t bg-muted/40">
              <td
                className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground"
                colSpan={data.accounts.length + 1}
              >
                Change this month
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <span
                  className={cn(
                    "font-medium",
                    monthChange > 0 && "text-emerald-600 dark:text-emerald-400",
                    monthChange < 0 && "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {monthChange > 0 ? "+" : ""}
                  {formatMoneyMinor(monthChange)}
                </span>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/client/app/features/balance-history/balance-history-table.tsx
git commit -m "feat: add BalanceHistoryTable component"
```

---

## Task 10: `BalanceHistoryView` + app-shell integration

**Files:**
- Create: `src/client/app/views/balance-history-view.tsx`
- Modify: `src/client/app/app-shell.tsx`

- [ ] **Step 1: Create the view**

Create `src/client/app/views/balance-history-view.tsx`:

```typescript
import { useState } from "react";
import { currentMonthKey } from "@/lib/date";
import { MonthNavigator } from "@/client/app/features/shared/month-navigator";
import { useBalanceHistory } from "@/client/app/features/balance-history/use-balance-history";
import { BalanceHistoryTable } from "@/client/app/features/balance-history/balance-history-table";
import { BalanceUpdateFormDialog } from "@/client/app/features/balance-snapshots/balance-update-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

type BalanceHistoryViewProps = {
  workspaceId: string;
  onNavigate?: (section: string) => void;
};

export function BalanceHistoryView({
  workspaceId,
  onNavigate,
}: BalanceHistoryViewProps) {
  const [month, setMonth] = useState(currentMonthKey());
  const [editDate, setEditDate] = useState<string | null>(null);
  const [newDateOpen, setNewDateOpen] = useState(false);

  const query = useBalanceHistory(workspaceId, month);

  const handleEditRow = (date: string) => setEditDate(date);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Balance history</h1>
          <p className="text-sm text-muted-foreground">
            Month-by-month ledger of balance snapshots. Click a row to edit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthNavigator month={month} onChange={setMonth} />
          <Button size="sm" onClick={() => setNewDateOpen(true)}>
            <Plus className="size-4" />
            Update balances
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      ) : query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Could not load balance history</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {query.error instanceof Error
                ? query.error.message
                : "Unknown error"}
            </p>
          </CardContent>
        </Card>
      ) : query.data && query.data.rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No balance updates this month</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setNewDateOpen(true)}>
              <Plus className="size-4" />
              Update balances
            </Button>
          </CardContent>
        </Card>
      ) : query.data ? (
        <BalanceHistoryTable data={query.data} onEditRow={handleEditRow} />
      ) : null}

      {/* Edit-mode dialog (locked to a specific date) */}
      <BalanceUpdateFormDialog
        open={editDate !== null}
        onOpenChange={(open) => {
          if (!open) setEditDate(null);
        }}
        workspaceId={workspaceId}
        initialDate={editDate ?? undefined}
        onCreateAccount={() => onNavigate?.("accounts")}
      />

      {/* Create-new-date dialog (today by default) */}
      <BalanceUpdateFormDialog
        open={newDateOpen}
        onOpenChange={setNewDateOpen}
        workspaceId={workspaceId}
        onCreateAccount={() => onNavigate?.("accounts")}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire into app-shell**

Modify `src/client/app/app-shell.tsx`.

Add `"balance-history"` to the `Section` type union:

```typescript
type Section =
  | "dashboard"
  | "accounts"
  | "balance-history"
  | "transactions"
  | "recurring"
  | "budget";
```

Add the entry to the `sections` array (between accounts and transactions):

```typescript
const sections: { id: Section; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "accounts", label: "Accounts" },
  { id: "balance-history", label: "Balance history" },
  { id: "transactions", label: "Transactions" },
  { id: "recurring", label: "Recurring" },
  { id: "budget", label: "Budget" },
];
```

Add an entry to `navIcons` (pick an appropriate Lucide icon — `History` is the natural choice):

```typescript
import { History } from "lucide-react"; // add to existing lucide-react import

const navIcons = {
  dashboard: LayoutDashboard,
  accounts: Wallet,
  "balance-history": History,
  transactions: ArrowLeftRight,
  recurring: Repeat,
  budget: PiggyBank,
} as const;
```

Import the new view:

```typescript
import { BalanceHistoryView } from "@/client/app/views/balance-history-view";
```

Add the conditional render block in `<main>` (after the accounts block, before transactions):

```typescript
{activeSection === "balance-history" && (
  <BalanceHistoryView
    workspaceId={session.activeWorkspaceId}
    onNavigate={handleSectionChange}
  />
)}
```

- [ ] **Step 3: Typecheck**

Run: `bun run tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/app/views/balance-history-view.tsx src/client/app/app-shell.tsx
git commit -m "feat: add BalanceHistoryView and wire into app-shell"
```

---

## Task 11: End-to-end manual verification

This task has no commits — it's the quality gate before declaring done. If any step fails, fix the underlying code and re-run.

- [ ] **Step 1: Start dev server**

Run: `bun --hot ./src/index.ts` (or the repo's dev script).

- [ ] **Step 2: Navigate to the new tab**

- Log in.
- Click **Balance history** in the nav.
- Expected: the tab loads, month navigator shows the current month, and the table renders (or the empty state renders if the current month has no snapshots).

- [ ] **Step 3: Verify matrix contents**

- Check that the column order is `Date | {accounts, active-first then archived, each alphabetical} | Net worth`.
- Check that rows are sorted newest-first.
- Pick two adjacent rows and verify a delta chip by hand: it should equal `curr − prev` for that account, green if positive, red if negative.
- Check that the oldest in-month row's delta chips use the **baseline** (latest snapshot before month start) as the previous value.
- If an account was archived mid-month, verify its column is shown and dimmed with an "archived" badge.

- [ ] **Step 4: Verify edit flow**

- Click a row. Expected: the dialog opens with "Edit balances" title and a prefilled, disabled date field showing that row's date. Inputs show the current balances for that date.
- Change one input and click **Save Balances**. Expected: success toast; dialog closes; table refreshes; the affected cell updates and its delta chip recomputes.
- Also verify that the dashboard's **Update Balances** button still works as before (date field enabled, defaults to today).

- [ ] **Step 5: Verify month navigation**

- Click ◀ to go back a month. Expected: table reloads with previous month's data; ▶ becomes enabled.
- Click ▶ to return. Expected: back on current month; ▶ becomes disabled.

- [ ] **Step 6: Verify empty state**

- Navigate to a month with no snapshots (any month deep in the past before you started using the app). Expected: "No balance updates this month" card with an **Update balances** button.

- [ ] **Step 7: Verify error state**

- In dev tools, throttle the network or kill the server. Expected: "Could not load balance history" card appears with an error message.

- [ ] **Step 8: Verify that the dashboard balance chart is also updated**

- After editing a balance from the history view, switch to the dashboard tab. Expected: the balance chart and current account balances reflect the edit (because `use-balance-mutations.ts` invalidates both `balance-history` and `dashboard` keys).

- [ ] **Step 9: Final typecheck sweep**

Run: `bun run tsc --noEmit`

Expected: zero errors.

- [ ] **Step 10: Final test sweep**

Run: `bun test`

Expected: all existing tests still pass, plus the new tests from Tasks 2 and 4.

- [ ] **Step 11: Declare done**

If all above passes, the feature is complete. Do not create a summary commit — the individual task commits already tell the story.
