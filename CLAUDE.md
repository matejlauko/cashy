Cashy is a React frontend and a Hono API served by one Cloudflare Worker, with D1 (SQLite) as the database. How it is deployed and operated: `docs/cloudflare-deploy.md`. Why it is built this way: `docs/superpowers/specs/2026-10-10-cloudflare-migration-design.md`.

## Tooling

- Bun is the package manager, script runner and test runner, and the runtime for `src/cli/` and `scripts/`. Use `bun install`, `bun run <script>`, `bun test`, `bunx <package>`.
- Vite with `@cloudflare/vite-plugin` builds the frontend and runs the Worker locally. `bun dev` serves everything on http://localhost:3000; `bun run preview` serves the production build.
- Wrangler (`bunx wrangler …`) manages the Worker and the D1 database. Config is `wrangler.jsonc`; rerun `bun run typecheck` after changing it.
- Before finishing a change: `bun run typecheck` and `bun test`.

## Server code (`src/worker.ts`, `src/api/`, `src/auth/`, `src/db/`, `src/env.ts`, `src/logger.ts`)

This code runs in the Workers runtime, not in Bun or Node.

- No `Bun.*` APIs, no filesystem, no `process.env`. Bindings come from `import { env } from "cloudflare:workers"`; validated config from `@/env`.
- Module scope runs once per isolate and once when Cloudflare validates an upload. It must not throw and must not do I/O (no queries, no `fetch`, no timers, no random values).
- Do not keep request state in module-level variables.
- Log through `@/logger` (one JSON line per entry).

## Database (D1)

- Queries are raw SQL through the `sql` tagged template in `src/db/client.ts`. Awaiting it returns the rows.
- D1 has no interactive transactions. For atomic multi-statement writes use `batch([...])`; for check-then-write use a single conditional statement (`INSERT … SELECT … WHERE`) and inspect `.run()`'s `changes`.
- Bind only numbers, strings, booleans and `null`. `undefined` and `Date` are rejected.
- Instants are integer epoch milliseconds (`Date.now()`); calendar dates are `'YYYY-MM-DD'` text. Booleans come back as `0`/`1`, integers as `number`.
- It is SQLite: no `LATERAL`, `DISTINCT ON`, `generate_series`, `::` casts or `now()`. See the existing modules for the equivalents (correlated subqueries, `ROW_NUMBER()`, recursive CTEs).
- Unique violations are detected with `isUniqueViolation(err, "<index name>")`.
- Schema: `src/db/schema/*.ts` (drizzle `sqlite-core`). To change it: edit, `bun run db:generate`, read the generated SQL, `bun run db:migrate:local`. Index expressions with more than one argument must be hand-written in a custom migration (`bunx drizzle-kit generate --custom --name=<name>`), because drizzle-kit emits broken SQL for them.
- Drizzle's query builder is used only by Better Auth.

## Frontend (`src/client/`, `src/components/`)

- React 19, TanStack Query, Tailwind v4, shadcn components. The API client is Hono RPC (`src/client/rpc.ts`), typed from the server routes.
- Three separate pages, each with its own HTML entry at the repo root: `index.html`, `login.html`, `cli/auth.html` (served at `/cli/auth`). There is no client-side router.

## Testing

Use `bun test`. Tests sit next to the code as `*.test.ts`.

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

Server modules import `cloudflare:workers`, which only exists in the Workers runtime. A test that loads one must mock it first (`mock.module("cloudflare:workers", …)`, see `src/env.test.ts`).
