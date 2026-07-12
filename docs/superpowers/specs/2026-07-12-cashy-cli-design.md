# Cashy CLI — Design

**Date:** 2026-07-12
**Status:** Approved

## Purpose

A thin terminal client (`cashy`) over the existing `/api/*` HTTP API. No DB access, no business logic — every write goes through the API and its existing validation. Runs from this repo only (no npm publishing, no global install).

Scope:

1. **Auth** — token-based login via a browser token-generation page that auto-delivers the token to a loopback server run by the CLI.
2. **Balance updates** — set current balances for one or more accounts, and bulk import from CSV/JSON (columns = accounts, rows = dates).
3. **Status** — display dashboard stats: current overall balance, monthly spending, everyday spending, tracked income/expenses, budget left.

Nothing else. No CRUD for accounts/transactions/budgets, no MCP, no declarative apply.

## Command surface

```
bun run cashy auth login [--no-open] [--manual]
bun run cashy auth whoami
bun run cashy auth logout

bun run cashy balance set <Account>=<amount> [...] [--date YYYY-MM-DD]
bun run cashy import <file.csv|file.json>
bun run cashy status [--month YYYY-MM]

Global flags: --api-url <url>, --token <token>, --json
```

- Implemented with **commander** (the one new dependency) in `src/cli/`, entry `src/cli/index.ts`, run via a `"cashy": "bun src/cli/index.ts"` package.json script. Bun runs the TS directly; no build step.
- **Config resolution** (first wins): `--api-url`/`--token` flags → `CASHY_API_URL`/`CASHY_TOKEN` env → `~/.config/cashy/config.json` (written mode 0600 by `auth login`).
- **Accounts** are referenced by name (case-insensitive) or id, resolved via `GET /api/accounts`.
- **Amounts** are major units with ≤ 2 decimal places (`1234.56`); the CLI converts to integer minor units (×100). Credit-card sign conventions are whatever the API stores — the CLI passes values through as `amountMinorRaw`.
- **Exit codes:** `0` success, `1` network/unexpected, `2` validation, `3` unauthorized/forbidden, `4` not found.
- `--json` prints the raw API response for piping.

## Auth

### Server-side changes (the only app changes)

1. **better-auth `apiKey` plugin** in `src/auth/auth.ts`, with sessions-from-API-keys enabled so a valid `x-api-key` header is treated as a session. The existing `sessionMiddleware` then authenticates CLI requests unchanged. The plugin's `apikey` table is added to the drizzle auth schema (`src/db/schema/auth.ts`) and pushed with `db:push`. The existing workspace middleware's first-workspace fallback covers the missing workspace cookie (its `setCookie` on API responses is harmless to the CLI).
2. **Token page** at `/cli/auth?port=<n>` — a new small HTML entry (like `login.html`) served session-protected the same way `/` is (unauthenticated → redirect to `/login` and back). The page shows what is being authorized and an **Authorize** button. On click it:
   - creates an API key via the better-auth client (name `cli-<hostname>-<YYYY-MM-DD>`; hostname passed as a `name` query param),
   - `POST`s the raw key to `http://127.0.0.1:<port>/` via fetch,
   - on success shows "Logged in — you can close this tab";
   - if the loopback POST fails (headless/SSH), it displays the key once with copy instructions for `cashy auth login --manual`.

### CLI login flow

`cashy auth login`:

1. Starts a temporary `Bun.serve` on `127.0.0.1` with a random port.
2. Opens the browser at `{apiUrl}/cli/auth?port=<port>&name=<hostname>` (`--no-open` prints the URL instead).
3. Receives the token via the loopback POST, verifies it with `GET /api/session` sending `x-api-key`, writes `~/.config/cashy/config.json` (0600), shuts the server down.

`--manual` skips the server and prompts for API URL + token (verified the same way). `auth whoami` calls `GET /api/session` and prints user + workspace. `auth logout` deletes the stored token from config (server-side key revocation is out of scope; keys are managed via the app/better-auth if needed).

All CLI requests send the token as `x-api-key`.

## Balance updates

### `cashy balance set`

`cashy balance set Checking=1234.56 "Air Bank"=42 --date 2026-07-10`

1. `GET /api/accounts`; resolve each `<Account>` by id or case-insensitive name. Unknown account → exit 2 listing valid names. Duplicate account in args → exit 2.
2. One `POST /api/balance-snapshots/bulk` with `effectiveDate` (default: today) and all resolved `{financialAccountId, amountMinorRaw}` snapshots.
3. Print one line per account with the written amount. No confirmation prompt — snapshots are upserts and safe to correct by re-running.

### `cashy import <file>`

Format detected by extension.

**CSV** — first column header must be `date`; remaining column headers are account names or ids; each row is one date; empty cells are skipped (no snapshot written):

```csv
date,Checking,Savings,Credit Card
2026-07-01,1234.56,9000,
2026-07-08,1100.20,9050,-250.00
```

**JSON** — the same matrix keyed by date:

```json
{
  "2026-07-01": { "Checking": 1234.56, "Savings": 9000 },
  "2026-07-08": { "Checking": 1100.20, "Credit Card": -250 }
}
```

Behavior:

- **Validate everything, then write.** All account columns/keys must resolve, all dates must be valid `YYYY-MM-DD` and not in the future, all amounts numeric with ≤ 2 decimals, no duplicate dates and no duplicate account columns/keys. Any failure → exit 2 listing *every* issue; nothing is written.
- Writes are one `POST /api/balance-snapshots/bulk` per date, **oldest date first** (the CLI groups rows client-side; the API is unchanged). Rows whose cells are all empty are skipped entirely.
- **Not atomic across dates:** on a failed request the CLI stops and reports which dates were applied and which were not. Re-running the same file is safe (the endpoint upserts per account+date).
- CSV parsing is a minimal hand-rolled parser supporting quoted fields containing commas; no csv dependency.

## Status

`cashy status [--month YYYY-MM]` — one `GET /api/dashboard[?month=…]`. Derived values copy the dashboard UI (`metric-cards.tsx`):

- `availableToSpend = recurringIncomeTotal − recurringExpenseTotal − budgetItemsTotal`
- `budgetLeft = availableToSpend − monthlySpendingExcludingTracked`

Output:

```
Cashy — July 2026 (as of 2026-07-12, last snapshot 2026-07-10)

Current balance        123 456.78
Monthly spending         8 210.00
Everyday spending        5 110.00     (excluding tracked)
Tracked income          65 000.00
Tracked expenses        12 300.00
Budget left              2 890.00     (of 8 000.00 available)
```

Amounts are formatted from minor units. Negative budget-left is flagged. `--json` dumps the raw API response.

## Errors

- The API's error envelope `{ error: { code, message, details? } }` maps to a stderr message and the exit codes above; validation `details` (Zod issues) are printed readably.
- 401 responses add the hint: `run: bun run cashy auth login`.
- Network failures (server not running, bad URL) → exit 1 with the underlying error.

## Module layout

```
src/cli/
  index.ts        # commander program, global flags, dispatch
  config.ts       # flag/env/file resolution, config read/write (0600)
  client.ts       # fetch wrapper: base URL, x-api-key header, error envelope → typed errors
  commands/
    auth.ts       # login (loopback server), whoami, logout
    balance.ts    # balance set
    import.ts     # file parsing, validation, per-date bulk calls
    status.ts     # dashboard fetch + formatting
  lib/
    amounts.ts    # major-unit string → minor units, formatting
    csv.ts        # minimal CSV parser
    accounts.ts   # name/id resolution against GET /api/accounts
src/client/cli-auth/  # token page HTML entry + script
```

Pure logic (amounts, csv, matrix parsing/grouping, account resolution) is kept dependency-free and separate from I/O so it is unit-testable without a server.

## Testing

`bun test` unit tests for:

- amount parsing/conversion (valid, >2 decimals, negatives, non-numeric),
- CSV parser (quoted fields, empty cells, malformed rows),
- import matrix validation (unknown accounts, future/invalid dates, duplicates, all-empty rows) and grouping/date-ordering,
- account name/id resolution (case-insensitivity, ambiguity between an id and a name).

The API endpoints themselves are already covered by existing app tests; the token page and login loopback flow are verified manually.

## Decisions log

| Decision | Choice | Why |
|---|---|---|
| Token mechanism | better-auth apiKey plugin | Hashed, revocable keys; `x-api-key` acts as a session so existing middleware is unchanged — near-zero custom auth code |
| Multi-date import | CLI loops per date over existing `/bulk` | Keeps the CLI a pure thin wrapper; upsert semantics make re-runs safe |
| Workspace | First-workspace fallback only | Existing middleware behavior; `--workspace` can be added later via a header if ever needed |
| Mutation UX | Just apply, no confirm prompt | Snapshots are low-risk upserts, correctable by re-running |
| Amount format | Major units, ≤ 2 decimals | Human-friendly for typing and CSV authoring |
| Empty import cells | Skipped | Sparse imports — fill in only what you know |
| Packaging | `src/cli/` + commander | Single-package repo; commander gives help/subcommands cheaply |
