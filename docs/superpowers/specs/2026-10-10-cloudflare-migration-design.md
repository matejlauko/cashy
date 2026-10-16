# Cashy on Cloudflare (Workers + D1) — Migration Design

**Date:** 2026-10-10
**Status:** Implemented on branch `cloudflare-migration` and verified locally (2026-10-10). Not yet deployed. Runbook: [`docs/cloudflare-deploy.md`](../../cloudflare-deploy.md)

## Purpose

Move Cashy off the self-hosted k3s + PostgreSQL stack onto Cloudflare: one Worker that serves the frontend and the API, with D1 as the database, on the Workers Free plan. The app keeps its URL (`cashy.lauko.io`), its data, its API surface, its login flow and its CLI.

Decisions already made (confirmed with the owner on 2026-10-10):

| Topic | Decision |
| --- | --- |
| Hosting shape | **One Worker with static assets** (not Pages + a separate API Worker) |
| Database | **D1** (SQLite), replacing PostgreSQL |
| Auth | **Keep Better Auth** (Google OAuth + api-key plugin), switch its adapter to SQLite |
| Frontend tooling | **Vite + `@cloudflare/vite-plugin`**, replacing `Bun.serve` HTML imports and `build.ts` |
| Domain | **Keep `cashy.lauko.io`** as a Worker custom domain (`lauko.io` is already on Cloudflare DNS) |
| Plan | **Workers Free**, with one measured risk and a paid fallback (see [R1](#r1-cpu-time-on-the-free-plan)) |
| Backups | **Manual export script**, same habit as today, plus D1 Time Travel (7 days) |

### Why one Worker rather than Pages

Workers with static assets is where Cloudflare puts new work; Pages lacks things this setup uses (the Cloudflare Vite plugin, Workers Logs). Serving the pages and `/api/*` from the same Worker keeps everything same-origin, so cookies, the Hono RPC client and Better Auth need no CORS configuration. Static asset requests are free and do not invoke the Worker.

## Implementation notes (2026-10-10)

Phases 1–4 of the [rollout](#rollout) are done. Phases 5–7 need a Cloudflare login and are described step by step in the runbook.

**Where the implementation differs from the design below**

- **No `secrets.required` in `wrangler.jsonc`.** With it declared, the build copies only the listed secrets into the preview config, so `vite preview` ran with the production `APP_URL`. Secrets are uploaded with `wrangler deploy --secrets-file` on the first deploy instead.
- **Config errors are not thrown at module scope.** Cloudflare runs the module scope once to validate an upload, and it is not documented whether vars and secrets are visible there; an exception would make the Worker undeployable. `src/env.ts` exports `envError`, and the fetch handler answers every request with 500 while it is set. Verified by booting the production bundle with no vars at all.
- **The logger writes one JSON line per entry** through `console.log` / `console.warn` / `console.error`, as before, not the object.
- **Observability** has logs and traces enabled; `compatibility_date` is 2026-10-10.
- **`bun run db:restore:local`** accepts both D1 backups and old PostgreSQL dumps (it converts the latter).
- **Dependencies:** Better Auth stays on 1.6 (1.6.33); hono 4.13, drizzle-orm 0.45.4, drizzle-kit 0.31.11, tailwindcss 4.3.3 and zod 4.6 (4.5+ is recommended on Workers for memory use).
- **Two client helpers** (`parseApiError`, `getErrorMessage`) take a structural response type. With one `tsconfig`, the global `Response` type merges the DOM and Workers definitions, and the Hono RPC response no longer matches it.

**What the local verification showed**

- **Read parity:** `scripts/parity-check.ts` against the old stack (same dump loaded into PostgreSQL 18 and into D1): 69 requests over 16 months, no differences. The check does catch a one-row change (verified by altering one snapshot).
- **Write parity:** a 59-step scenario (accounts, bulk snapshots, transactions, recurring items, budget items, archiving, error cases) run against both stacks. 55 steps identical. In the other 4 the old stack is wrong and the new one is right:
  - a duplicate account name on create or rename returned 500 on the old stack (its unique-violation check never matched Bun’s `PostgresError`); it now returns 409 `ACCOUNT_NAME_TAKEN`;
  - a `PATCH` of a transaction without `transactionDate` returned 500 on the old stack (it wrote a stringified `Date` back); it now succeeds.
- **Unchanged quirk:** an invalid `x-api-key` yields 500 on both stacks, not 401, because the error thrown by `auth.api.getSession` is not mapped. Left as is.
- **Auth:** cookie sessions, sign-out, API-key sessions and the Google sign-in start work on D1. The Google callback itself still needs a real sign-in (Phase 3 exit, first check after cutover).
- **UI:** the production build was driven in a headless browser: login page, signed-in dashboard, every section and the CLI authorize page render with no console or network errors.
- **Backups:** `db:backup` and `db:restore:local` round-trip the full data set, including the hand-written index and the migration history.

## What stays the same

- Every `/api/*` path, request body and response body, with one exception: timestamp fields (see [API differences](#api-differences)).
- All React client code under `src/client/` and `src/components/` (verified: it builds under Vite unchanged).
- The CLI (`src/cli/`), still run with Bun, still talking to the HTTP API with `x-api-key`.
- The Google OAuth client and its redirect URIs (same origin in production and in local dev).
- Existing browser sessions and the existing CLI API key (rows are migrated; the signing secret is reused).
- Table and column names. Only column types change.

## What was verified before writing this

A throwaway spike (outside the repo, nothing in the project was changed) ran the risky parts against a local D1 in the real Workers runtime (`workerd`).

| Verified | Result |
| --- | --- |
| Better Auth 1.6.23 + `drizzleAdapter(provider: "sqlite")` + api-key plugin on D1, with `auth` built at module scope from `import { env } from "cloudflare:workers"` | Works: API key created, `x-api-key` resolves to a session, Google sign-in start returns the right redirect URL. Also works on 1.7.7. |
| The Better Auth drizzle adapter needs no transactions on SQLite | Confirmed by reading the adapter: `transaction` defaults to `false`; the only direct `db.transaction` calls are MySQL-only. |
| Full schema translated to `drizzle-orm/sqlite-core`, generated with drizzle-kit, applied with `wrangler d1 migrations apply` | Works, after one workaround (next row). |
| drizzle-kit and multi-argument index expressions | **Bug**, reproduced on 0.31.9 and 0.31.11: `substr(transaction_date, 1, 7)` in an index is emitted as broken SQL. Workaround verified: keep that one index in a hand-written custom migration. |
| Composite foreign keys (workspace isolation), `CHECK` constraints, partial and expression unique indexes | All enforced by D1. |
| `db.batch()` atomicity | A failing statement rolls back the earlier ones. |
| SQLite forms of the Postgres-only queries: window functions, recursive CTE date series, correlated "latest snapshot" lookups, `NULLS FIRST`, `RETURNING`, `INSERT … SELECT`, `json_each` multi-row insert | All run on D1. The correlated lookup uses `balance_snapshot_account_date_idx`. |
| D1 error text for a unique violation | `D1_ERROR: UNIQUE constraint failed: index '<index name>': SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)` |
| Vite 8 + Cloudflare plugin with the real frontend | Builds; dev server serves `/`, `/login` and `/cli/auth?…`, and `/api/*` reaches the Worker with local D1. |
| `wrangler deploy --dry-run` on the build output | 1.8 MiB upload (391 KiB gzip), far below the Worker size limit. |
| Backup and restore with `wrangler d1 export` | A single-file export does **not** restore into an empty database. Separate schema and data exports do (see [Backups](#backups-and-restore)). |
| CPU cost of Better Auth | Estimated under Node, not measured on Cloudflare (see [R1](#r1-cpu-time-on-the-free-plan)). |

Not verifiable without a Cloudflare deployment: free-plan CPU enforcement, the Google OAuth callback on Workers, attaching the custom domain, the remote data import, and zone security settings in front of the CLI. Each has a gate in the [rollout](#rollout).

## Free plan fit

| Resource | Free limit | Cashy |
| --- | --- | --- |
| Worker requests | 100,000 / day (account-wide) | Tens to hundreds on a day of use; a CLI import is one request per date |
| CPU per request | 10 ms, with tolerance for infrequent overruns | Warm ≈ 3–5 ms; first request after a cold start ≈ 15–30 ms (estimate) → [R1](#r1-cpu-time-on-the-free-plan) |
| Worker startup | 1 s | ≈ 0.2 s (estimate; `wrangler deploy` reports the real figure) |
| Worker size | 64 MiB uncompressed | ≈ 1.8 MiB |
| Static asset requests | Free, unlimited | 3 HTML files + hashed JS/CSS |
| D1 queries per invocation | 50 | ≤ ~12 by design (auth 2–4, workspace 1–2, route ≤ 6) |
| D1 rows read | 5,000,000 / day | ≈ 1,000 per dashboard load |
| D1 rows written | 100,000 / day | A handful per action; the one-time import is ≈ 5,000 |
| D1 size | 500 MB per database | < 1 MB (914 rows today) |
| D1 Time Travel | 7 days | Used as the short-term undo |
| Workers Logs | 200,000 events / day, 3-day retention | Replaces `kubectl logs` |
| Custom domain + certificate | Included | `cashy.lauko.io` |

When a daily limit is hit, D1 queries or Worker requests fail until 00:00 UTC. At this usage that only happens through abuse; see [R6](#r6-public-endpoint-on-daily-quotas).

## Target architecture

```
Browser / CLI
    │  https://cashy.lauko.io
    ▼
Cloudflare edge ── static asset match? ──► dist/client (index.html, login.html, cli/auth.html, /assets/*)
    │ no match, or path is /api/*
    ▼
Worker "cashy"  (src/worker.ts → Hono app)
    ├─ /api/auth/*      Better Auth  ─┐
    ├─ /api/*           routes        ├─► D1 "cashy" (binding DB)
    └─ /healthz /readyz              ─┘
```

### Repository layout after the migration

```
index.html                  moved from src/index.html
login.html                  moved from src/login.html
cli/auth.html               moved from src/cli-auth.html (gives the /cli/auth route)
vite.config.ts              new
wrangler.jsonc              new
worker-configuration.d.ts   generated by `wrangler types`, gitignored
migrations/                 new: D1 migrations (drizzle-kit output), committed
src/worker.ts               new: Worker entry (replaces src/index.ts)
src/api/**                  Hono app, small edits
src/auth/**                 Better Auth config, small edits
src/db/client.ts            rewritten: `sql` tagged template + `batch` over D1
src/db/drizzle.ts           rewritten: drizzle(env.DB), used only by Better Auth
src/db/schema/*.ts          rewritten for sqlite-core
src/db/modules/*.ts         SQL dialect rewrite
src/env.ts, src/logger.ts   rewritten for the Workers runtime
src/client/**, src/components/**, src/lib/**, src/schemas/**, src/cli/**   unchanged
scripts/pg-dump-to-d1.ts    new, one-off: converts a pg_dump to a D1 import file
scripts/parity-check.ts     new, one-off: diffs old and new API responses
scripts/backup-db.ts        rewritten: wrangler d1 export
```

### `wrangler.jsonc`

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "cashy",
  "main": "src/worker.ts",
  "compatibility_date": "2026-10-10",
  "compatibility_flags": ["nodejs_compat"], // Better Auth needs AsyncLocalStorage
  "workers_dev": true, // staging only; set to false at cutover
  "preview_urls": false,
  // Added at cutover:
  // "routes": [{ "pattern": "cashy.lauko.io", "custom_domain": true }],
  "assets": { "run_worker_first": ["/api/*"] },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "cashy",
      "database_id": "<from `wrangler d1 create`>",
      "migrations_dir": "migrations"
    }
  ],
  "vars": { "APP_URL": "https://cashy.lauko.io", "LOG_LEVEL": "info" },
  "observability": {
    "enabled": true,
    "logs": { "enabled": true, "head_sampling_rate": 1 },
    "traces": { "enabled": true, "head_sampling_rate": 1 }
  }
}
```

Notes:

- `assets.directory` is not set by hand; the Vite plugin fills it in for the build output.
- `not_found_handling` stays at its default. The three pages are separate HTML documents with no client-side router, so an unknown path should reach the Worker and get the existing JSON 404, as it does today.
- Default `html_handling` serves `/login` from `login.html` and `/cli/auth` from `cli/auth.html`, and redirects `/login.html` to `/login`.
- The three secrets are not declared in the config (see the implementation notes).
- The local dev database is keyed by `database_id`, so it starts empty when the real id replaces the placeholder.

### `vite.config.ts`

```ts
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: { alias: { "@": resolve(root, "src") } },
  server: { port: 3000, strictPort: true }, // matches APP_URL and the Google redirect URI
  preview: { port: 3000, strictPort: true },
  environments: {
    // HTML entry points belong to the browser build only. A top-level
    // build.rollupOptions.input is also applied to the Worker build and fails it.
    client: {
      build: {
        rollupOptions: {
          input: {
            index: resolve(root, "index.html"),
            login: resolve(root, "login.html"),
            cliAuth: resolve(root, "cli/auth.html"),
          },
        },
      },
    },
  },
});
```

Build output: `dist/client/` (static assets) and `dist/cashy/` (Worker bundle plus a generated `wrangler.json`). After a build, `.wrangler/deploy/config.json` points `wrangler deploy` at that generated config, so deploys go through `bun run deploy`, which rebuilds first. `wrangler d1 …` commands keep reading `wrangler.jsonc`.

### `src/worker.ts`

Mirrors today's `src/index.ts`: health routes first, everything else to Hono.

```ts
import { honoApp } from "@/api/app";
import { sql } from "@/db/client";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/healthz") return new Response("OK");
    if (pathname === "/readyz") {
      try {
        await sql`SELECT 1`;
        return new Response("OK");
      } catch {
        return new Response("Service Unavailable", { status: 503 });
      }
    }
    return honoApp.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
```

## Rewrite inventory

### Delete

| File | Reason |
| --- | --- |
| `src/index.ts` | `Bun.serve` entry; replaced by `src/worker.ts` and Vite |
| `build.ts`, `bunfig.toml`, `bun-env.d.ts` | Bun bundler and its Tailwind plugin wiring |
| `drizzle/` (untracked) | Generated Postgres migrations, never applied by this project |
| `Dockerfile`, `.dockerignore`, `compose.yaml`, `ops/k8s/`, `scripts/k3s-*.sh`, `scripts/local-connect-db.sh` | Old stack. Removed in the last phase, after the soak period |
| `.env.example` | Replaced by `.dev.vars.example` |

### Rewrite

| File | Change |
| --- | --- |
| `src/db/schema/auth.ts`, `src/db/schema/app.ts` | `pg-core` → `sqlite-core` (see [Schema](#database-schema)) |
| `src/db/client.ts` | `Bun.SQL` → D1 helper (see [Query layer](#query-layer)) |
| `src/db/drizzle.ts` | `drizzle-orm/bun-sql` → `drizzle-orm/d1` |
| `src/db/modules/*.ts` | SQL dialect, transactions, row mapping (see [Query translation](#query-translation)) |
| `src/env.ts` | Read from `cloudflare:workers`; drop `PORT`, `DATABASE_URL`, `NODE_ENV`; record validation errors instead of `process.exit` |
| `src/logger.ts` | `process.stdout.write` → `console.log` / `console.warn` / `console.error` |
| `drizzle.config.ts` | `dialect: "sqlite"`, `out: "./migrations"` |
| `scripts/backup-db.ts`, `scripts/restore-data.ts` | D1 export and restore |
| `scripts/bootstrap-user-workspace.sql` | SQLite dialect (drop `BEGIN`/`COMMIT` and `now()`; timestamps default) |
| `README.md`, `CLAUDE.md`, `AGENTS.md` | New dev, deploy and backup instructions. The two agent files currently say "don't use Vite", "use `Bun.serve`" and "use `Bun.sql`", which become wrong |

### Edit

| File | Change |
| --- | --- |
| `src/auth/auth.ts` | `provider: "sqlite"`, explicit cookie/rate-limit/telemetry settings, startup warm-up (see [Auth](#auth)) |
| `src/auth/access-control.ts` | `now()` → bound `Date.now()` |
| `src/api/middleware/workspace.ts`, `src/api/routes/workspaces.ts` | Cookie `secure` flag from `APP_URL` scheme instead of `NODE_ENV` |
| `src/api/routes/*.ts` | No logic change. They keep calling the DB modules |
| `index.html`, `login.html`, `cli/auth.html` | Moved; `<script src>` becomes an absolute `/src/client/…` path |
| `package.json` | Scripts and dependencies (see [Tooling](#tooling-and-local-development)) |
| `.gitignore` | Add `.wrangler/`, `.dev.vars*` (keep the example), `worker-configuration.d.ts` |

### Unchanged

`src/client/**`, `src/components/**`, `src/lib/**`, `src/schemas/**`, `src/styles/globals.css`, `src/cli/**`, `components.json`, all existing tests.

## Database schema

### Type mapping

| PostgreSQL | D1 (drizzle `sqlite-core`) | Notes |
| --- | --- | --- |
| `text` | `text` | |
| `boolean` | `integer({ mode: "boolean" })` | Raw SQL sees `0` / `1` |
| `timestamp with time zone` | `integer({ mode: "timestamp_ms" })` | Epoch milliseconds, UTC. What Better Auth's SQLite schema expects, used for app tables too so there is one rule |
| `date` | `text`, `'YYYY-MM-DD'` | Plus a `CHECK … GLOB` on the shape. String comparison orders correctly |
| `bigint` | `integer({ mode: "number" })` | D1 returns JS numbers; exact up to 2^53 − 1. The zod schemas already reject anything larger |
| `integer` | `integer` | |
| `pgEnum` | `text({ enum })` + `CHECK (… IN (…))` | |
| `DEFAULT now()` | `DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))` | Verified on D1 |

One rule to remember when writing SQL: **instants are integer milliseconds, calendar dates are ISO text.**

### Constraints and indexes

Everything carries over by name, with these adjustments:

| Object | Postgres | D1 |
| --- | --- | --- |
| `financial_transaction_recurring_month_unique` | `date_trunc('month', transaction_date::timestamp)` | `substr(transaction_date, 1, 7)`, partial on `deleted_at IS NULL`. **Defined in a hand-written custom migration**, not in the drizzle schema, because of the drizzle-kit bug |
| `financial_account_workspace_name_unique` | `(workspace_id, lower(name))` | Same expression. SQLite's `lower()` folds ASCII only (see [D2](#behaviour-differences-to-accept)) |
| `user_email_ci_unique` | `lower(email)` | Same |
| Composite FKs `(financial_account_id, workspace_id)` → `financial_account (id, workspace_id)` | Unique constraint on `(workspace_id, id)` | Same; SQLite accepts the parent unique index in either column order (verified) |
| `financial_transaction_recurring_workspace_fk` | `ON DELETE SET NULL` | `NO ACTION`. `SET NULL` on this composite key would null `workspace_id`, which is `NOT NULL`, so it could never succeed. Recurring items are only ever archived |
| Enum columns, date columns | Type-enforced | `CHECK` constraints |

The custom migration:

```sql
CREATE UNIQUE INDEX `financial_transaction_recurring_month_unique`
  ON `financial_transaction` (`workspace_id`, `recurring_transaction_id`, substr(`transaction_date`, 1, 7))
  WHERE `deleted_at` IS NULL;
```

### Migration workflow

`drizzle-kit push` goes away. Schema changes become: edit the schema → `drizzle-kit generate` → **read the generated SQL** → `wrangler d1 migrations apply cashy --local` → deploy (which applies to remote). Hand-written SQL goes through `drizzle-kit generate --custom --name=<name>`. Wrangler tracks applied files in the `d1_migrations` table and ignores drizzle's `meta/` folder.

The database is created once with:

```sh
wrangler d1 create cashy --jurisdiction=eu
```

`--jurisdiction=eu` keeps the data inside the EU and cannot be changed afterwards. This is a default chosen here; see [Open points](#open-points).

### Behaviour differences to accept

- **D1. No interactive transactions.** D1 has `batch()` (atomic, all statements known up front) but no `BEGIN … COMMIT` across round trips. Each of the four `sql.begin` blocks is restructured; see below.
- **D2. Case-insensitive account names are ASCII-only.** `Česká` and `česká` count as different names on D1 (verified), where Postgres treated them as equal. Existing data cannot violate the new index. If exact parity matters, add an app-maintained `name_key` column later; not planned.
- **D3. Text ordering is byte order.** `ORDER BY name` in SQLite compares UTF-8 bytes. Production Postgres runs on Alpine (musl), which also collates byte-wise, so no change is expected; the parity check confirms it.
- **D4. Timestamps lose microseconds.** They become milliseconds. Only relevant where `created_at` breaks ties between snapshots; the converter checks for collisions.

## Query layer

Keep raw SQL. The modules are already written as tagged templates, the queries rely on window functions and correlated subqueries that an ORM query builder handles poorly, and a thin helper keeps the diff to dialect changes. Drizzle stays for schema definitions, migration generation and the Better Auth adapter.

### `src/db/client.ts`

```ts
import { env } from "cloudflare:workers";

type Row = Record<string, unknown>;

export class Query<T = Row> implements PromiseLike<T[]> {
  constructor(
    readonly text: string,
    readonly values: unknown[],
  ) {}

  statement(): D1PreparedStatement {
    return env.DB.prepare(this.text).bind(...this.values);
  }

  async all(): Promise<T[]> {
    return (await this.statement().all<T>()).results;
  }

  /** For writes where only the affected-row count matters. */
  async run(): Promise<{ changes: number }> {
    return { changes: (await this.statement().run()).meta.changes };
  }

  then<A = T[], B = never>(
    ok?: ((rows: T[]) => A | PromiseLike<A>) | null,
    fail?: ((err: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.all().then(ok, fail);
  }
}

export function sql<T = Row>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Query<T> {
  return new Query<T>(strings.join("?"), values);
}

/** Runs the queries in one atomic D1 batch. */
export function batch(queries: Query[]): Promise<D1Result[]> {
  return env.DB.batch(queries.map((q) => q.statement()));
}

export function isUniqueViolation(err: unknown, indexName: string): boolean {
  return (
    err instanceof Error &&
    err.message.includes("UNIQUE constraint failed") &&
    err.message.includes(indexName)
  );
}
```

Awaiting a `sql` template still yields an array of row objects, so `rows.length`, `rows[0]` and `rows.map(…)` in the modules keep working.

Rules that differ from `Bun.SQL`:

- **`undefined` cannot be bound** (`D1_TYPE_ERROR`). Pass `null`. The modules already normalise optional fields with `?? null` / `|| null`; check each call site.
- **`Date` objects cannot be bound.** Bind `Date.now()` or a date string.
- **At most 100 bound parameters per statement.**
- **Booleans come back as `0` / `1`.**
- **Integers come back as `number`,** never `bigint`. `bigintToSafeNumber` becomes a plain safe-integer assertion, and comparisons like `rawBalance !== 0n` become `!== 0`.

### Transactions

| Function | Today | On D1 |
| --- | --- | --- |
| `accounts.create` | `begin`: insert account, insert opening snapshot | `batch([insertAccount, insertSnapshot])`. Name clash detected with `isUniqueViolation(err, "financial_account_workspace_name_unique")` |
| `transactions.create` | `begin`: check the account is active, insert | One `INSERT … SELECT … FROM financial_account WHERE id = ? AND workspace_id = ? AND archived_at IS NULL`; `changes === 0` → `ACCOUNT_NOT_FOUND` |
| `transactions.createFromRecurring` | `begin`: read recurring item, duplicate check, account check, insert | The reads run in sequence, then the same conditional `INSERT … SELECT`. The partial unique index remains the race guard: a violation maps to `ALREADY_ADDED` |
| `balanceSnapshots.bulkCreate` | `begin`: read active accounts, compare sets, insert N rows | Read active ids, compare in JS as today, then **one** multi-row insert through `json_each` (below). The window between check and insert is accepted for a single-household app; the composite FK still blocks cross-workspace rows |

Multi-row insert in a single statement, independent of the number of accounts (keeps the request far from the 50-query cap and the 100-parameter cap):

```sql
INSERT INTO balance_snapshot (
  id, workspace_id, financial_account_id, effective_date, amount_minor_raw,
  created_by_user_id, updated_by_user_id
)
SELECT json_extract(j.value, '$.id'), ?, json_extract(j.value, '$.financialAccountId'),
       ?, json_extract(j.value, '$.amountMinorRaw'), ?, ?
FROM json_each(?) AS j
```

The last parameter is `JSON.stringify(snapshots.map((s) => ({ id: crypto.randomUUID(), ...s })))`.

### Query translation

Three reusable patterns cover almost everything.

**P1. Latest snapshot for one account** (replaces `LEFT JOIN LATERAL (… LIMIT 1) ON true` when one column is needed). Uses the index, about one row read per account:

```sql
COALESCE((
  SELECT bs.amount_minor_raw
  FROM balance_snapshot bs
  WHERE bs.financial_account_id = fa.id
    AND bs.workspace_id = fa.workspace_id
    AND bs.effective_date <= ?            -- only in the "as of" variants
  ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
  LIMIT 1
), 0) * CASE WHEN fa.type = 'credit_card' THEN -1 ELSE 1 END AS current_balance
```

**P2. Latest row per group** (replaces `SELECT DISTINCT ON (…)`, and `LATERAL` when several columns are needed):

```sql
SELECT … FROM (
  SELECT bs.*, ROW_NUMBER() OVER (
    PARTITION BY bs.financial_account_id        -- add bs.effective_date for the month matrix
    ORDER BY bs.effective_date DESC, bs.created_at DESC, bs.id DESC
  ) AS rn
  FROM balance_snapshot bs
  WHERE bs.workspace_id = ? AND …
) WHERE rn = 1
```

**P3. Date series** (replaces `generate_series`):

```sql
WITH RECURSIVE date_series(chart_date) AS (
  SELECT ? WHERE ? <= ?                          -- monthStart, monthStart, asOfDate
  UNION ALL
  SELECT date(chart_date, '+1 day') FROM date_series WHERE chart_date < ?   -- asOfDate
)
```

Per module:

| Module / function | Postgres-only construct | D1 form |
| --- | --- | --- |
| `accounts`: `listActive`, `listActiveAsOf`, `listArchived`, `getById` | `LEFT JOIN LATERAL` | P1 |
| `accounts.update`, `accounts.archive` | `now()` | Bound `Date.now()`; `RETURNING` unchanged |
| `balanceSnapshots.getPrefillByDate` | `DISTINCT ON` subquery | P1 |
| `balanceSnapshots.getMonthMatrix` | `DISTINCT ON (account, date)`, `DISTINCT ON (account)`, `::text` | P2 twice; drop the cast; `NULLS FIRST` works as is |
| `dashboard.getDashboardSummary` | Two `LATERAL` joins | `latest_balances` needs amount and date → P2; `opening_balances` → P1. The other CTEs and the final select are portable |
| `dashboard.getBalanceChartData` | `generate_series`, `LATERAL`, `::date`, `'1 day'::interval` | P3 + P1 (correlated on `ds.chart_date`); verified |
| `recurringTransactions.listActive`, `getById` | `EXISTS (…) AS added_this_month` returns boolean | Returns `0` / `1`: map with `=== 1` |
| `transactions.*`, `budgetItems.*`, `recurringTransactions.*` writes | `now()` | Bound `Date.now()` |
| `transactions.createFromRecurring` | Error code `23505` + constraint name | `isUniqueViolation(err, "financial_transaction_recurring_month_unique")` |
| `accounts.isUniqueNameViolation` | Error code `23505` + constraint name | `isUniqueViolation(err, "financial_account_workspace_name_unique")` |
| `access-control.ts`, `auth.ts` hook, `workspace.ts`, `session.ts`, `workspaces.ts` | `now()` in two updates | Bound `Date.now()`. Everything else is portable, including `"user"` quoting and `ORDER BY (id = ?) DESC` |

Row mappers: `String(r.created_at)` becomes `new Date(r.created_at as number).toISOString()`; the `instanceof Date` branches for date columns go away because dates are always strings.

### API differences

`createdAt`, `updatedAt` and `archivedAt` become ISO 8601 strings everywhere. Today most of them are JavaScript `Date#toString()` output (`"Sat Oct 10 2026 22:05:11 GMT+0200 …"`), which nothing parses: the client only tests `archivedAt` for truthiness and the CLI ignores these fields. No client change is needed.

## Auth

`src/auth/auth.ts` keeps its shape. Changes:

```ts
import { env } from "@/env"; // validated values from cloudflare:workers

const isHttps = env.APP_URL.startsWith("https://");

export const auth = betterAuth({
  baseURL: env.APP_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(drizzleDb, {
    provider: "sqlite", // was "pg"
    schema: { /* same model → table mapping as today */ },
  }),
  advanced: {
    useSecureCookies: isHttps,
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
  },
  rateLimit: { enabled: false },
  telemetry: { enabled: false },
  // socialProviders, session, plugins, user, hooks: unchanged
});

// Startup warm-up. The first use of auth.api builds every endpoint (≈ 60 ms of
// CPU in the estimate); doing it here spends the 1 s startup budget instead of
// the first request's 10 ms.
await auth.$context;
await auth.api.getSession({ headers: new Headers() });
```

Why each explicit setting:

- **`useSecureCookies`.** Better Auth already derives this from an `https` base URL, so the production cookie stays `__Secure-better-auth.session_token`. That name, the unchanged `BETTER_AUTH_SECRET` and the migrated `session` rows are what keep current logins valid. Stating it removes any dependence on `NODE_ENV`, which is not reliably set on Workers.
- **`rateLimit: { enabled: false }`.** The built-in limiter keeps counters in isolate memory, which on Workers is short-lived and per-location, so it protects nothing. Sign-up is disabled and API keys are long random strings. Edge protection is covered under [R6](#r6-public-endpoint-on-daily-quotas).
- **`ipAddressHeaders`.** Session rows record the real client IP instead of nothing.
- **Warm-up.** These two calls are verified to run at module scope in `workerd`, in dev and in the production build. Calling `auth.handler(...)` there is **not** allowed (it fails with "Disallowed operation called within global scope"), so the warm-up uses only the two calls shown.

API keys are stored as unsalted SHA-256, base64url, so migrated `apikey` rows keep working and do not depend on the secret.

Stay on Better Auth 1.6.x for the migration; upgrade to 1.7 separately.

## Tooling and local development

### Dependencies

| Add (dev) | Remove |
| --- | --- |
| `vite` 8, `@vitejs/plugin-react`, `@tailwindcss/vite`, `@cloudflare/vite-plugin`, `wrangler` 4 | `bun-plugin-tailwind`; `postgres` (after cutover) |

Set `tailwindcss` to the same version as `@tailwindcss/vite`. Verified working set: vite 8.3.4, `@vitejs/plugin-react` 6.1.2, `@tailwindcss/vite` 4.3.3, `@cloudflare/vite-plugin` 1.63.1, wrangler 4.149.0.

Node (20.19+ or 22.12+) becomes a dev prerequisite, because Vite and the Workers tooling run on it. Bun remains the package manager, test runner, script runner and CLI runtime.

### Scripts

```jsonc
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite build && vite preview",
  "deploy": "vite build && wrangler d1 migrations apply cashy --remote && wrangler deploy",
  "typecheck": "wrangler types && tsc --noEmit",
  "test": "bun test",
  "cashy": "bun src/cli/index.ts",
  "db:generate": "drizzle-kit generate",
  "db:migrate:local": "wrangler d1 migrations apply cashy --local",
  "db:backup": "bun scripts/backup-db.ts",
  "db:restore:local": "bun scripts/restore-data.ts",
  "postinstall": "wrangler types"
}
```

### Local development

- `bun dev` starts one process on `http://localhost:3000`: Vite serves the pages with HMR, and `/api/*` runs in `workerd` against a local D1 stored in `.wrangler/state/` (the same files `wrangler d1 … --local` uses).
- Local secrets live in `.dev.vars` (gitignored): `APP_URL=http://localhost:3000`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `LOG_LEVEL=debug`. This is today's `.env` minus `PORT` and `DATABASE_URL`. A committed `.dev.vars.example` replaces `.env.example`.
- First run: `bun install && bun run db:migrate:local`, then either `bun run db:restore:local` to load a production backup or the bootstrap SQL for an empty database.
- Docker and Postgres are no longer needed.

### TypeScript

Keep the single `tsconfig.json`. `wrangler types` generates `worker-configuration.d.ts` with the `Env` interface and the runtime types, which the config picks up automatically. A new `src/vite-env.d.ts` with `/// <reference types="vite/client" />` types `import.meta.hot`. In the spike this combination showed no global-type conflicts with `@types/bun` and the DOM lib. If conflicts appear on the real code, split into `tsconfig.app.json` and `tsconfig.worker.json`.

### Environment and logging

`src/env.ts` validates `APP_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `LOG_LEVEL` (default `info`) from `cloudflare:workers`. A failure is recorded in `envError`, not thrown, and the fetch handler refuses every request while it is set (see the implementation notes for why).

`src/logger.ts` keeps its API, level filter and one-JSON-line-per-entry format, written through `console.log` / `console.warn` / `console.error` so Workers Logs records the severity. Each invocation also gets an automatic log line with status and CPU time.

## Data migration

### Converter: `scripts/pg-dump-to-d1.ts`

Input is `data.sql` from an existing backup directory (the `pg_dump --data-only` COPY format that `scripts/backup-db.ts` and `scripts/k3s-backup-db.sh` already produce). Output is a SQL file for `wrangler d1 execute --file`. Working from the dump file means the converter can be developed and tested offline against `backups/2026-10-10_22-05-11/`, and the cutover uses the same archived artefact.

Behaviour:

- Parses COPY blocks: tab-separated fields, `\N` for null, backslash escapes (`\t`, `\n`, `\r`, `\\`).
- Uses an explicit per-table column list with a converter per column. An unknown table or column is a hard error, so schema drift cannot be dropped silently.
- Conversions: `timestamptz` text → epoch milliseconds (floor), `t` / `f` → `1` / `0`, integers checked with `Number.isSafeInteger`, dates and text as is, SQL string quoting.
- Emits `PRAGMA defer_foreign_keys = true;` first, then one `INSERT` per row, with tables in dependency order: `user`, `workspace`, `workspace_membership`, `financial_account`, `recurring_transaction`, `balance_snapshot`, `financial_transaction`, `budget_item`, `user_account`, `session`, `apikey`. No `BEGIN` / `COMMIT` (D1 rejects them).
- Skips `verification` (short-lived OAuth state; empty in the latest backup).
- Prints row counts per table and fails if two snapshots of the same account and date share a millisecond after truncation (D4).

Expected volume from the 2026-10-10 backup: 914 rows (738 snapshots, 129 transactions, 15 recurring, 8 accounts, 4 budget items, 12 sessions, 2 users, 2 provider accounts, 2 memberships, 1 workspace, 1 API key).

A companion `scripts/d1-wipe.sql` deletes all rows in reverse dependency order, for re-running the import.

### Parity check: `scripts/parity-check.ts`

The acceptance test for the SQL rewrite. Given two base URLs and an API key, it fetches from both and deep-compares:

- `/api/session`, `/api/accounts`, `/api/budget-items`, `/api/recurring-transactions`
- for every month from the earliest snapshot to the current one: `/api/dashboard?month=`, `/api/balance-history?month=`, `/api/transactions?month=`, and `/api/balance-snapshots/prefill?date=<last day>`

Arrays are compared in order (which also checks D3). `createdAt` / `updatedAt` are ignored and `archivedAt` is compared as an instant. Any other difference fails the run.

## Rollout

Work happens on a branch. `main` stays deployable to k3s until cutover.

### Phase 1 — Tooling

Add Vite, the Cloudflare plugin and `wrangler.jsonc`; move the HTML files; add a Worker entry that only answers `/healthz`.

*Exit:* `bun dev` shows the login page at `http://localhost:3000/login` with HMR; `bun run build` produces `dist/client` and `dist/cashy`; `bun test` passes.

### Phase 2 — Schema and data

SQLite schema, generated migrations plus the custom index migration, the converter, local D1 loaded from the latest backup.

*Exit:* migrations apply cleanly to an empty local D1; the converter output imports without errors; per-table counts match the dump; `PRAGMA foreign_key_check` returns nothing.

### Phase 3 — Port the server

D1 helper, DB modules, middleware, routes, auth, env, logger.

*Exit:* the app works end to end locally, including a real Google sign-in (the path the spike could not exercise), the CLI against `http://localhost:3000`, and `bun run typecheck`.

### Phase 4 — Local parity

Run the old stack locally (a `main` worktree, Postgres from `compose.yaml`, schema pushed, the same `data.sql` restored) next to the new one, and run the parity check with an API key valid in both databases. The real CLI token qualifies, because both are loaded from the same dump; without it, insert a throwaway `apikey` row into both, whose `key` column is the unpadded base64url SHA-256 of the chosen token.

*Exit:* zero differences across all months.

### Phase 5 — Staging on Cloudflare

1. `wrangler login`; `wrangler d1 create cashy --jurisdiction=eu`; put the id in `wrangler.jsonc`.
2. `bun run deploy -- --secrets-file <file>` with `workers_dev: true` and no custom domain, uploading the three secrets with the first version. **`BETTER_AUTH_SECRET` must be the production value**, or existing sessions stop working.
3. Note `startup_time_ms` in the deploy output.
4. Take a fresh production dump, convert, `wrangler d1 execute cashy --remote --file=…`, verify counts.
5. Run the parity check: `https://cashy.lauko.io` (old) against the `workers.dev` URL (new) with the real CLI token.
6. **CPU gate** ([R1](#r1-cpu-time-on-the-free-plan)): force cold starts by redeploying a few times; after each, call `/api/session` and `/api/dashboard` with the CLI token. Watch `wrangler tail` and the Worker's metrics for `exceededCpu` outcomes or error 1102.
7. Restore drill: `bun run db:backup`, then restore the two files into a scratch D1 database and compare counts.

Browser login is not tested here, because Google only redirects to the registered origin. It is the first check after cutover.

*Exit:* parity clean, no CPU-limit errors (or a decision taken under R1), restore drill passed.

### Phase 6 — Cutover

About fifteen minutes; do not use the app during it.

1. Final dump on the VPS (`scripts/k3s-backup-db.sh`), copy it locally.
2. Stop writes to the old database: `kubectl -n cashy scale deployment/cashy-app --replicas=0`. Postgres keeps running for rollback.
3. `wrangler d1 execute cashy --remote --file=scripts/d1-wipe.sql`, then import the converted final dump; verify counts.
4. In `wrangler.jsonc`: add the `routes` entry with `custom_domain: true` and set `workers_dev: false`.
5. Delete the existing `cashy` A record in the `lauko.io` zone (it conflicts with the custom domain), then `bun run deploy`. The certificate is issued automatically, usually within a minute or two.
6. Check that "Always Use HTTPS" is on for the zone (Traefik did the redirect until now).
7. Smoke test:
   - open `https://cashy.lauko.io` in a browser that was signed in before: the dashboard should load without a login prompt;
   - sign out and sign in with Google;
   - add and delete a test transaction; submit a balance update;
   - from the CLI: `cashy auth whoami`, `cashy status`. A 403 here points at [R5](#r5-zone-security-in-front-of-the-cli);
   - `/healthz` and `/readyz` return 200.

**Rollback** (any time before Phase 7): remove the custom domain (delete the `routes` entry and deploy, or remove it in the dashboard), recreate the A record `cashy → 91.99.158.62` (DNS only), scale the old deployment back to 1. Anything written to D1 after cutover has to be re-entered by hand, so decide quickly.

### Phase 7 — Cleanup

After about two weeks without problems: archive the final Postgres dump somewhere off the VPS, delete the `cashy` namespace on k3s, and remove the old-stack files listed under [Delete](#delete), the `postgres` dev dependency, and the two one-off scripts if no longer wanted.

## Backups and restore

`bun run db:backup` writes two files into `backups/<timestamp>/`, the same layout as today:

```sh
wrangler d1 export cashy --remote --no-data   --output=backups/<ts>/schema.sql
wrangler d1 export cashy --remote --no-schema --output=backups/<ts>/data.sql
```

Two files are required, not a preference. A combined export writes each table's rows right after its `CREATE TABLE`, in table-creation order, so `balance_snapshot` rows are inserted before `financial_account` exists and the restore fails with `no such table` (verified). With separate files the schema exists first and the data file's leading `PRAGMA defer_foreign_keys=TRUE` covers row order.

Restore into an empty database:

```sh
wrangler d1 execute <db> --remote --file=backups/<ts>/schema.sql
wrangler d1 execute <db> --remote --file=backups/<ts>/data.sql
```

Do **not** run `migrations apply` before restoring: the data file carries the `d1_migrations` rows and would collide (verified). After a restore, `wrangler d1 migrations list` reports nothing pending.

`db:restore:local` does the same against `--local` after clearing `.wrangler/state/v3/d1`; it replaces today's `scripts/restore-data.ts` as the way to get production data into dev.

For "undo the last hour", use Time Travel instead: `wrangler d1 time-travel restore cashy --timestamp=<RFC 3339>`. It restores in place, is always on, and reaches back 7 days on the free plan.

An export blocks the database while it runs; at this size that is well under a second. `backups/` is gitignored, so copy dumps off the machine as today.

## Risks

### R1. CPU time on the free plan

The free plan allows 10 ms of CPU per request, and Cloudflare documents tolerance for a Worker that "infrequently runs over". Better Auth is heavy for that budget. Estimate from running the bundled server code under Node on the dev machine (same JavaScript engine family, **not** a Cloudflare measurement):

| Step | Main-thread time |
| --- | --- |
| Module load | ≈ 120 ms (startup budget) |
| `betterAuth()` construction | ≈ 12–20 ms (startup budget) |
| First use of `auth.api` (builds all endpoints) | ≈ 60 ms (moved to startup by the warm-up) |
| First real session check after warm-up | ≈ 12–22 ms |
| Warm session check, cookie | ≈ 1.5 ms |
| Warm session check, API key (4 queries) | ≈ 4 ms |

So warm requests fit, and the first request or two of each visit probably exceed 10 ms. Because the app is used a few times a month, nearly every visit starts cold. Whether Cloudflare's tolerance covers that pattern is the one thing this plan cannot determine in advance.

Handling:

1. The startup warm-up is part of the baseline design.
2. Phase 5 step 6 measures it for real.
3. If cold requests are killed: try `import { betterAuth } from "better-auth/minimal"` (drops the unused Kysely code; untested here), then re-measure.
4. If that is not enough: **Workers Paid, $5/month**, which raises the limit to 30 s and ends the question. Replacing Better Auth with a small custom auth module is the free alternative; it is a separate project, not part of this one.

Impact if it does bite before a decision: an occasional failed first request, which the client retries once for most queries (`retry: 1`); the session bootstrap query has `retry: false` and would show the "App bootstrap failed / Retry" screen.

### R2. SQL translation mistakes

Six modules of financial queries are rewritten by hand. Mitigation: the parity check over every month of real data, locally (Phase 4) and against production (Phase 5).

### R3. drizzle-kit output

One confirmed bug (multi-argument index expressions). Mitigation: that index is hand-written, and generated SQL is always read before it is applied.

### R4. Google OAuth callback on Workers

Not exercised in the spike (needs a real Google round trip). The code path is database calls plus one outbound `fetch`, and the adapter uses no transactions. Mitigation: tested locally in Phase 3 and first thing after cutover, with rollback available.

### R5. Zone security in front of the CLI

`cashy.lauko.io` is DNS-only today. As a Worker custom domain it sits behind the zone's security settings, and Bot Fight Mode can challenge non-browser clients such as the CLI. Mitigation: CLI check in the cutover smoke test; if challenged, turn Bot Fight Mode off for the zone.

### R6. Public endpoint on daily quotas

Anyone can send requests to `/api/*`; unauthenticated ones cost a Worker invocation and no D1 query. Exhausting 100,000 requests in a day would take the app down until midnight UTC. Optional hardening: one WAF rate-limiting rule on `/api/*` (the free plan includes one). Note the request and D1 quotas are shared with any other Workers in the same account.

### R7. Custom domain attach

The docs only state that an existing CNAME blocks a custom domain; behaviour with an A record was not tested. Mitigation: the cutover deletes the A record first, and the rollback recreates it.

## Open points

Defaults chosen in this document that the owner may want to overrule:

1. **EU jurisdiction for D1** (`--jurisdiction=eu`). Cannot be changed after creation, though recreating a database this small is a ten-minute job.
2. **ASCII-only case-insensitive account names** (D2), accepted rather than adding a `name_key` column.
3. **Better Auth rate limiting off**, with the WAF rule left optional (R6).
4. **Better Auth stays on 1.6.x** during the migration.
5. **Two-week soak** before deleting the old stack.

Assumption to confirm: `lauko.io` is in the same Cloudflare account the Worker will be deployed to. (The `cf` CLI on the dev machine is not logged in, so this was not checked.)

## Alternatives considered

- **Pages + Functions.** Fewer features than Workers and not where Cloudflare is investing; no benefit here.
- **Keep the Bun bundler** and proxy `/api` to `wrangler dev`. Keeps the frontend toolchain but needs two dev processes and a proxy script, and dev routing would differ from production. Rejected in favour of Vite by the owner.
- **Rewrite queries in the Drizzle query builder.** A larger rewrite for queries that are mostly window functions and correlated subqueries; raw SQL through a 40-line helper is a smaller and more reviewable change.
- **Better Auth's native D1 support** (pass the binding directly, available since 1.5). Would need every snake_case column mapped by hand, where the drizzle adapter already has the mapping in the schema.
- **Custom auth or Cloudflare Access.** Either would fit the free CPU budget easily, at the cost of rewriting the login pages and the CLI login flow. Kept as the fallback behind R1.

## References

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- D1 limits and pricing: https://developers.cloudflare.com/d1/platform/limits/ · https://developers.cloudflare.com/d1/platform/pricing/
- D1 Worker API (batch, return object, type conversion): https://developers.cloudflare.com/d1/worker-api/
- D1 foreign keys, import/export, Time Travel, data location: https://developers.cloudflare.com/d1/sql-api/foreign-keys/ · https://developers.cloudflare.com/d1/best-practices/import-export-data/ · https://developers.cloudflare.com/d1/reference/time-travel/ · https://developers.cloudflare.com/d1/configuration/data-location/
- Static assets routing and billing: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare Vite plugin: https://developers.cloudflare.com/workers/vite-plugin/
- Custom domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Bindings via `cloudflare:workers`: https://developers.cloudflare.com/workers/runtime-apis/bindings/
- Better Auth on Hono / Workers, Drizzle adapter, options: https://better-auth.com/docs/integrations/hono · https://better-auth.com/docs/adapters/drizzle · https://better-auth.com/docs/reference/options
