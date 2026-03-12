# Money TS Architecture Implementation Plan

This plan breaks architecture work into AI-sized implementation projects that can each be completed in one focused run.

Source inputs:
- `PRD.md` (product rules and MVP scope)
- `tech.md` (locked technical decisions)

Architecture-first scope:
- Build core platform only (DB, auth, server shell, app shell, API contract scaffolding, ops baseline).
- Do **not** implement business features yet (dashboard metrics logic, accounts CRUD behavior, balance flow behavior, transactions behavior).

## Global constraints every project must follow

- Runtime/package manager: Bun only.
- One process serves HTML + API on same origin.
- API framework: Hono with typed RPC (`AppType` + `hc<AppType>()`).
- Auth: Better Auth + Google OAuth only, with hard deny for unauthorized users.
- DB: PostgreSQL 18; schema source-of-truth in Drizzle schema files; `drizzle-kit push` workflow.
- Runtime DB access for app modules: Bun SQL (not Drizzle query builder).
- Frontend: React client-side, no React Router, two HTML entrypoints (`/login` and `/`).
- Workspace-scoped multi-tenant model from day one.
- Money stored as minor units (`bigint` in DB).
- Architecture code must keep feature areas as placeholders where functionality is deferred.

## Execution order and dependency map

| ID | Project | Depends on | Parallelizable |
| --- | --- | --- | --- |
| A1 | Foundation and Repo Restructure | none | no |
| A2 | Environment + Logging + Shared Utilities | A1 | yes (with A3) |
| A3 | Database Foundation (Drizzle + Postgres + Schema) | A1 | yes (with A2) |
| A4 | Auth and Access Control Core | A2, A3 | no |
| A5 | Server Shell + API Core + Middleware | A2, A3, A4 | no |
| A6 | Frontend App Shell + Login App | A2, A4, A5 | no |
| A7 | Ops Baseline + Deployment Artifacts | A3, A5 | yes (with A6) |

---

## A1. Foundation and Repo Restructure

Goal:
- Convert boilerplate into the target architecture skeleton so later projects plug into stable paths.

Deliverables:
- Add/update dependency sets from `tech.md` (`better-auth`, `drizzle-orm`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `recharts`, `drizzle-kit`, optionally `@hono/zod-validator`).
- Create base directory structure:
  - `src/client/app`, `src/client/app/views`, `src/client/app/features`
  - `src/client/login`, `src/client/styles`
  - `src/api`, `src/api/middleware`, `src/api/routes`
  - `src/auth`
  - `src/db`, `src/db/schema`, `src/db/modules`
  - `src/schemas`
  - `src/lib`
  - `ops/k8s`
- Keep `src/index.ts` as Bun entrypoint placeholder (full behavior in A5).
- Ensure two HTML entrypoints exist: `src/index.html`, `src/login.html`.
- Verify `build.ts` correctly discovers and bundles both HTML entrypoints (it already scans `src/**/*.html`).

Implementation notes:
- Remove/retire old starter-only files (`src/App.tsx`, `src/frontend.tsx`, `src/APITester.tsx`) once new entrypoints compile.
- Preserve existing Tailwind/shadcn setup (`src/components/ui/*`, `src/styles/globals.css`, `src/lib/utils.ts`).
- Move `src/index.css` into `src/client/styles/` if it only contains frontend styles.

Success criteria:
- `bun install` succeeds.
- `bun run build` succeeds with both HTML entrypoints bundled.
- `bun dev` starts with no import/path errors from the new folder layout.

Out of scope:
- Any business route implementation.
- Any feature-specific UI.

---

## A2. Environment, Logging, and Shared Utility Baseline

Goal:
- Standardize configuration loading, structured logs, and shared parsing helpers before auth/API work.

Deliverables:
- `src/env.ts`:
  - Central env parser/validator (Zod).
  - Required vars: `PORT`, `APP_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `LOG_LEVEL`.
- `src/logger.ts`:
  - JSON logger wrapper with required fields (`level`, `message`, `requestId`, `route`, `method`, `status`, optional `userId`, `workspaceId`).
- `src/lib/money.ts`:
  - Parse decimal text to minor units.
  - Format minor units to localized CZK.
  - Safe integer boundary checks for JSON serialization.
- `src/lib/date.ts`:
  - Date string guard (`YYYY-MM-DD`) and helpers used by API/domain modules.
- `.env.example` matching required variables.

Implementation notes:
- Env validation must fail fast at startup with actionable errors.
- No application timezone conversion logic beyond agreed date-string policy.

Success criteria:
- App exits on missing/invalid required env.
- Startup logs are JSON and include consistent metadata keys.
- Money/date helper functions are importable and typed for later modules.

Out of scope:
- Any DB or auth integration logic.

---

## A3. Database Foundation (Postgres + Drizzle Schema + DB Clients)

Goal:
- Establish production-shaped database structure and runtime clients.

Deliverables:
- `compose.yaml` with PostgreSQL 18 local service, persistent volume, healthcheck.
- `drizzle.config.ts` configured for schema files and `DATABASE_URL`.
- `src/db/client.ts`:
  - Bun SQL client with `bigint: true`.
  - Export transaction-capable runtime SQL client.
- `src/db/drizzle.ts`:
  - Drizzle connection using Bun SQL client for Better Auth adapter compatibility.
- `src/db/schema/auth.ts`:
  - Better Auth canonical tables: `user`, `session`, `user_account`, `verification`.
  - `google_sub` field on `user` (nullable unique).
- `src/db/schema/app.ts`:
  - `workspace`, `workspace_membership`, `financial_account`, `balance_snapshot`, `financial_transaction`.
  - Audit columns and soft-delete/archive columns per plan.
  - Required constraints and indexes from `tech.md`.
- Bootstrap SQL template (`scripts/bootstrap-user-workspace.sql`) for manual pre-create contract matching tech.md §7. Required for testing auth in A4.

Implementation notes:
- Keep table/column naming in snake_case.
- Money fields use `bigint`.
- Business dates use `date`; audit fields use `timestamptz`.

Success criteria:
- `docker compose up -d` starts healthy Postgres.
- `bunx drizzle-kit push` applies schema successfully.
- Schema inspection confirms required tables/indexes/constraints exist.
- Bun SQL client can execute `select 1`.

Out of scope:
- Query modules for dashboard/accounts/transactions behavior.

---

## A4. Auth and Access-Control Core

Goal:
- Implement secure Google-only sign-in with hard pre-session deny based on pre-created user + membership.

Deliverables:
- `src/auth/auth.ts`:
  - Better Auth setup with Google provider and Drizzle adapter (`pg` provider).
  - Session config (45-day max age, update age 1 day).
  - Hook/callback implementation for hard deny flow.
- `src/auth/access-control.ts`:
  - Lookup logic:
    1. match by `google_sub`
    2. fallback to lowercase email when `google_sub` is null
    3. require at least one non-deleted `workspace_membership`
  - Update `google_sub` on first successful match.
  - Refresh `user.email`, `user.name`, `user.image` from provider profile.
- `src/client/auth-client.ts`: Better Auth client wiring (shared by login and app).
- Minimal login UI for testing auth end-to-end:
  - `src/client/login/login.tsx` + `src/client/login/login-app.tsx` with Google sign-in button and access denied state.
  - This is a functional-test-grade UI; A6 finalizes styling and error states.

Implementation notes:
- Unauthorized users must be redirected to `/login?error=access_denied`.
- Do not create usable app session for unauthorized users.
- Use the bootstrap SQL from A3 to pre-create a test user + workspace before testing.

Success criteria:
- Authorized pre-created user with workspace membership can authenticate.
- Unauthorized Google account is denied before app access.
- First successful login persists `google_sub` when initially null.
- Existing authorized user can log out current session.

Out of scope:
- Workspace switching UI.
- Invite/signup/admin interfaces.

---

## A5. Server Shell, API Core, and Middleware Stack

Goal:
- Deliver production-ready request routing skeleton: Bun outer server + Hono API + middleware/context.

Deliverables:
- `src/index.ts`:
  - `Bun.serve()` with explicit `routes` for `/login`, `/`, `/healthz`, `/readyz`.
  - Auth-based redirects (using `auth.api.getSession({ headers })` directly, not Hono middleware):
    - `/login` redirects to `/` when session exists.
    - `/` redirects to `/login` when no session.
  - `fetch` fallback delegates all unmatched requests (including `/api/*`) to `honoApp.fetch`.
  - In production, serve built assets from `dist/`; in development, Bun handles HMR automatically.
- `src/api/app.ts`:
  - Compose Hono app using chained `.route()` calls so `AppType` captures full endpoint types for RPC inference.
  - Mount Better Auth routes at `/api/auth/*`.
  - Export `AppType = typeof app`.
- `src/api/context.ts`:
  - Request context object with request id, user/session data, active workspace.
- Middleware in `src/api/middleware/*`:
  - request id
  - request logging
  - secure headers
  - session resolution
  - active workspace resolution (membership validated)
  - centralized error serialization (uses `{ error: { code: string; message: string } }` shape)
- Core routes (minimal architecture scope):
  - `src/api/routes/session.ts` (bootstrap user/workspaces/active workspace info)
  - `src/api/routes/workspaces.ts` (set active workspace cookie endpoint)

Implementation notes:
- Workspace cookie name: `active_workspace`, `httpOnly`, `sameSite=lax`, secure in prod, long expiry.
- `/readyz` performs DB readiness check (`select 1`).
- CSRF protection: mutation endpoints accept only `application/json` bodies. Combined with `SameSite=Lax` cookies and same-origin, this is sufficient for V1.
- No CORS config needed (same-origin).

Success criteria:
- `GET /healthz` returns 200 when process alive.
- `GET /readyz` returns 200 with working DB; fails when DB unavailable.
- Unauthenticated `GET /` redirects to `/login`.
- Authenticated `GET /login` redirects to `/`.
- `/api/session` returns typed bootstrap payload for authenticated user.

Out of scope:
- Domain feature endpoints beyond stubs.

---

## A6. Frontend Architecture Shell (Login + Authenticated App)

Goal:
- Provide a stable client shell that feature projects can plug into without reworking auth/bootstrap foundations.

Deliverables:
- Finalize login page (introduced in A4):
  - Polish `src/client/login/login.tsx` styling, loading state during redirect, and error display.
- App entrypoint and shell:
  - `src/client/app/app.tsx`
  - `src/client/app/app-shell.tsx`
- Section placeholder views as minimal containers:
  - `src/client/app/views/dashboard-view.tsx`
  - `src/client/app/views/accounts-view.tsx`
  - `src/client/app/views/transactions-view.tsx`
- Shared client infra:
  - `src/client/query-client.ts`
  - `src/client/rpc.ts` using `hc<AppType>()`
- Integrate TanStack Query providers and bootstrap query consumption.
- Minimal authenticated shell behaviors:
  - Show signed-in user identity
  - Show active workspace name/id
  - Simple in-memory section switching (no URL routing)
  - Logout action

Implementation notes:
- Keep state plan intentionally simple: server state via TanStack Query, local UI state for current section/modal toggles only.
- Build empty/loading/error shell states for missing session/workspace bootstrap.

Success criteria:
- `/login` renders and can trigger Google auth flow.
- `/` renders authenticated shell after successful session bootstrap.
- Shell can switch between placeholder sections without route library.
- Logout returns user to unauthenticated state.

Out of scope:
- Real dashboard/accounts/transactions feature UI.

---

## A7. Ops Baseline and Deployment Artifacts

Goal:
- Ensure architecture can run locally and has a clear deployment path to k3s before feature development starts.

Deliverables:
- `Dockerfile` using `oven/bun` runtime strategy from `tech.md`.
- Kubernetes manifests in `ops/k8s/`:
  - `namespace.yaml`
  - `postgres-statefulset.yaml`
  - `postgres-service.yaml`
  - `app-deployment.yaml`
  - `app-service.yaml`
  - `ingress.yaml`
- Runbook additions in `README.md` (or `docs/ops.md`):
  - local startup (`docker compose up -d`, `bunx drizzle-kit push`, `bun dev`)
  - production rollout order (secrets -> schema push -> app rollout -> readiness -> smoke)
- Manual smoke checklist document aligned to architecture-only milestone.

Implementation notes:
- Keep probes aligned with `/healthz` and `/readyz`.
- Keep env/secret names consistent with `src/env.ts`.

Success criteria:
- `bun run build` succeeds in container context.
- Containerized app starts with env + reachable DB.
- Health and readiness endpoints pass in local-like deployment.
- Smoke checklist can be executed end-to-end without feature routes.

Out of scope:
- CI/CD pipelines.
- backups, staging, automated migration jobs.

---

## Architecture phase exit criteria (all projects complete)

Architecture is ready for feature development when all of the following are true:

1. The app has stable auth gating:
   - Unauthorized users cannot access `/`.
   - Authorized pre-created users can sign in and load app shell.
2. DB foundation is complete:
   - All required auth + app tables, constraints, and indexes exist.
   - Runtime Bun SQL + Drizzle adapter wiring is operational.
3. API foundation is complete:
   - Hono app, middleware stack, typed RPC client, and standardized errors are in place.
4. Frontend shell is complete:
   - Separate login/app entrypoints work.
   - Authenticated shell loads bootstrap context and supports logout.
5. Operations baseline is complete:
   - Local DB workflow and readiness checks work.
   - Container + k3s manifests exist and are runnable with documented env contract.

If any item above is missing, feature implementation should be blocked until fixed.

