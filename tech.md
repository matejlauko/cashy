# Money TS Tech Plan

## 1. Tech Summary

This implementation keeps the current Bun + React + Tailwind + shadcn/ui boilerplate as the base and adds the missing backend foundations for authentication and persistence.

Locked decisions:

- Runtime and package manager: Bun
- Server: one Bun process
- API: Hono with RPC typing
- Auth: Better Auth, Google OAuth only, no signup
- Database: PostgreSQL 18
- DB client: Bun SQL
- Schema management: Drizzle schema files + `drizzle-kit push`
- Frontend: client-side React only
- UI: shadcn/ui + Tailwind CSS
- Data fetching: TanStack Query
- Forms and validation: React Hook Form + Zod
- Routing: no React Router
- Deployment: manual Docker + k3s

Core implementation choices:

- Bun remains the outer HTTP server and serves the HTML entrypoints.
- Hono handles `/api/*`.
- Better Auth is mounted inside Hono at `/api/auth/*`.
- The repo moves to two frontend HTML entrypoints:
  - `/login` for unauthenticated sign-in
  - `/` for the authenticated app shell
- Drizzle is the schema source of truth only.
- Runtime queries are handwritten SQL via Bun SQL.
- Better Auth uses the Drizzle adapter backed by a Bun SQL Drizzle connection so auth tables remain canonical Better Auth tables while the rest of the app still uses Bun SQL directly.

## 2. Target Architecture

### Runtime topology

- One Bun process serves everything on one origin.
- No cross-origin frontend/API split.
- No SSR.
- No router-driven URL state.

### Request flow

1. Bun receives the request.
2. Bun serves `/login`, `/`, `/healthz`, and `/readyz` directly.
3. Bun forwards `/api/*` requests to the Hono app.
4. Hono mounts Better Auth at `/api/auth/*`.
5. Hono app routes use shared Zod schemas and return typed JSON for Hono RPC.
6. Frontend uses `hono/client` + TanStack Query for server state.

### HTML entrypoints

- `src/index.html`: authenticated application shell
- `src/login.html`: login page

This fits the current base well because the existing [build.ts](/Users/matej/dev/money-ts/build.ts) already scans all `.html` files under `src`, so adding a second HTML entrypoint does not require a different build strategy.

## 3. Planned Repository Shape

```text
src/
  index.ts
  index.html
  login.html

  client/
    app/
      app.tsx
      app-shell.tsx
      views/
        dashboard-view.tsx
        accounts-view.tsx
        transactions-view.tsx
      features/
        dashboard/
        accounts/
        balance-snapshots/
        transactions/
        workspaces/
    login/
      login.tsx
      login-app.tsx

    styles/
      globals.css

    auth-client.ts
    query-client.ts
    rpc.ts

  env.ts
  logger.ts

  auth/
    auth.ts
    access-control.ts

  db/
    client.ts
    drizzle.ts
    schema/
      auth.ts
      app.ts
    modules/
      dashboard.ts
      accounts.ts
      balance-snapshots.ts
      transactions.ts
      workspaces.ts
  api/
    app.ts
    context.ts
    middleware/
      request-id.ts
      session.ts
      workspace.ts
    routes/
      session.ts
      workspaces.ts
      dashboard.ts
      accounts.ts
      balance-snapshots.ts
      transactions.ts

  schemas/
    accounts.ts
    balance-snapshots.ts
    transactions.ts
    workspaces.ts
    dashboard.ts

  lib/
    money.ts
    date.ts

drizzle.config.ts
compose.yaml
Dockerfile
ops/
  k8s/
    namespace.yaml
    postgres-statefulset.yaml
    postgres-service.yaml
    app-deployment.yaml
    app-service.yaml
    ingress.yaml
```

Notes:

- `src/index.ts` stays the Bun entrypoint.
- `src/App.tsx` and `src/frontend.tsx` are replaced by the new `client/app` and `client/login` entrypoints.

## 4. Dependency Plan

### Runtime dependencies

- `better-auth`
- `drizzle-orm`
- `@tanstack/react-query`
- `react-hook-form`
- `@hookform/resolvers`
- `recharts`
- optionally `@hono/zod-validator` if route-level validator inference is cleaner than manual parsing

### Dev dependencies

- `drizzle-kit`

No test runner additions are planned because tests are explicitly out of scope for V1.

## 5. Environment Contract

### Required environment variables

| Variable | Example local value | Notes |
| --- | --- | --- |
| `PORT` | `3000` | Bun listen port |
| `APP_URL` | `http://localhost:3000` | Public app URL |
| `DATABASE_URL` | `postgres://app:pass@localhost:5432/app` | Shared by Bun SQL, Drizzle, and auth |
| `BETTER_AUTH_SECRET` | generated secret | Required by Better Auth |
| `GOOGLE_CLIENT_ID` | `...` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | `...` | Google OAuth |
| `LOG_LEVEL` | `debug` | Structured debug logging |

### Time and timezone policy

You explicitly do not want application-level timezone logic in V1. That still needs one fixed operational timezone to prevent hidden date bugs.

Implementation rule:

- Business dates are stored as `date`, without a timezone.
- Audit timestamps are stored as `timestamptz`.
- Monthly SQL calculations use the dates without a timezone.

## 6. Database Plan

### Migration strategy

The schema is code-first and Drizzle is the source of truth.

- Define schema in Drizzle TypeScript files.
- Apply changes everywhere with `drizzle-kit push`.
- Do not keep SQL migration files in the repo.
- Do not use Better Auth CLI as the migration authority after bootstrap.

Accepted tradeoff:

- This is intentionally a rapid-prototyping workflow.
- Schema rollback is manual.
- Production deploys must push schema before rolling the app.

This matches Drizzle's documented `push` workflow for teams that want TypeScript schema as source of truth and do not want to manage SQL migration files.

### Naming and type rules

- Use snake_case table and column names in Postgres.
- Keep Better Auth core table names as the default singular names to minimize adapter friction:
  - `user`
  - `session`
  - `user_account` - renamed from default `account`
  - `verification`
- App tables use unambiguous names:
  - `workspace`
  - `workspace_membership`
  - `financial_account`
  - `balance_snapshot`
  - `financial_transaction`
- App IDs use `text` values generated as UUID strings.
- Money columns use `bigint` in minor units.

### Money representation

- Store all money as minor units with halere precision.
- `123.45 CZK` is stored as `12345`.
- Credit card balances are stored as raw positive owed amounts in the DB.
- Sign is derived in SQL and in the client:
  - asset accounts: positive
  - credit cards: negative
- Transaction input remains positive; sign comes from `type`.

Implementation detail:

- Bun SQL is initialized with `bigint: true` so `bigint` columns come back as JS `bigint`.
- Repository functions normalize DB money values to safe JSON values before returning RPC responses.
- Server-side parsers and serializers reject values outside JS safe integer range.
- This keeps API payloads simple while retaining `bigint` safety in Postgres.

### Audit pattern

All app-managed tables include audit fields.

Mutable records:

- `created_at`
- `created_by_user_id`
- `updated_at`
- `updated_by_user_id`

Soft deletion / archive fields where relevant:

- `deleted_at`
- `deleted_by_user_id`
- `archived_at`
- `archived_by_user_id`

Append-only records like `balance_snapshot` still include `updated_at` and `updated_by_user_id`, but they should remain equal to insert-time values because snapshots are immutable after creation.

### Table plan

#### `user` (Better Auth canonical)

Use Better Auth canonical user schema and extend it with:

- `google_sub` nullable unique

Purpose:

- bootstrap allowlist matching before the provider account row exists
- follow the Google account even if the email changes later
- keep manual user management simple

Operational rules:

- emails are normalized to lowercase before storage
- `google_sub` is set on first successful login if missing
- `name` and `image` are updated from Google on each successful login

#### `session` (Better Auth canonical)

Keep Better Auth canonical schema.

Session policy:

- multiple concurrent sessions allowed
- current-session logout only
- long rolling lifetime

#### `user_account` (Better Auth canonical)

This is the Better Auth provider-account table, not a money account.

Use it for the linked Google identity record created after successful sign-in.

#### `verification` (Better Auth canonical)

Keep canonical schema even if most verification features are unused in V1.

#### `workspace`

Fields:

- `id`
- `name`
- audit columns

Notes:

- V1 does not include workspace CRUD in the product UI.
- The table exists because the product model is workspace-scoped from day one.

#### `workspace_membership`

Fields:

- `id`
- `workspace_id`
- `user_id`
- `deleted_at`
- `deleted_by_user_id`
- audit columns

Constraints:

- unique `(workspace_id, user_id)`

Notes:

- no roles in V1
- both household users are full editors
- manual management only, outside app scope

#### `financial_account`

Fields:

- `id`
- `workspace_id`
- `name`
- `institution_name` nullable
- `type` enum: `cash | checking | savings | credit_card`
- `archived_at` nullable
- `archived_by_user_id` nullable
- audit columns

Constraints:

- unique account name within workspace

Implementation note:

- enforce uniqueness on normalized name
- do not store current balance on this table

#### `balance_snapshot`

Fields:

- `id`
- `workspace_id`
- `financial_account_id`
- `effective_date` as `date`
- `amount_minor_raw`
- audit columns

Rules:

- append-only
- unlimited same-day snapshots allowed
- latest saved row by `created_at`, then `id`, wins for that account and date
- one insert per active account on every bulk save

#### `financial_transaction`

Fields:

- `id`
- `workspace_id`
- `financial_account_id`
- `name`
- `type` enum: `income | expense`
- `amount_minor`
- `transaction_date` as `date`
- `deleted_at`
- `deleted_by_user_id`
- audit columns

Rules:

- input amount always positive
- sign is derived from `type`
- archived accounts cannot receive new transactions

### Index plan

- `user(email)` unique after lowercase normalization
- `user(google_sub)` unique where not null
- `workspace_membership(workspace_id, user_id)` unique
- `financial_account(workspace_id, lower(name))` unique
- `balance_snapshot(financial_account_id, effective_date desc, created_at desc, id desc)`
- `balance_snapshot(workspace_id, effective_date desc)`
- `financial_transaction(workspace_id, transaction_date desc)` partial on `deleted_at is null`
- `financial_account(workspace_id)` partial on `archived_at is null`

## 7. Auth Design

### Better Auth setup

Use Better Auth with:

- Google provider only
- Hono integration
- Drizzle adapter with provider `pg`
- Drizzle connection initialized from Bun SQL via `drizzle-orm/bun-sql`
- session lifetime at 45 days
- session `updateAge` at 1 day
- no email/password
- no signup UI

Google provider config:

- `prompt: "select_account"` so the user explicitly picks the correct Google account
- redirect URI:
  - local: `http://localhost:3000/api/auth/callback/google`
  - prod: `https://<your-domain>/api/auth/callback/google`

### Hard deny before session creation

This is the most important auth customization.

Desired behavior:

- only pre-created users with pre-linked workspace membership may log in
- unauthorized Google accounts are denied before a usable session is created

Planned flow:

1. User clicks Google sign-in on `/login`.
2. Google returns profile data including email and subject (`sub`).
3. Better Auth before-hook checks for an existing allowed user:
   - first by `google_sub = provider_sub`
   - otherwise by `email = lower(provider_email)` and `google_sub is null`
4. The same lookup also requires at least one non-deleted `workspace_membership`.
5. If no record matches, reject the sign-in and redirect back to `/login?error=access_denied`.
6. If a record matches and `google_sub` is still null, persist the Google subject to the `user` row.
7. Update `user.email`, `user.name`, and `user.image` from the Google profile.
8. Allow Better Auth to create or update the provider `account` row and create the session row.

This satisfies all auth decisions:

- canonical Better Auth tables
- hard deny
- keyed by both email and Google subject
- email changes follow the Google account after first successful login

### Manual pre-create contract

Because there is no seed flow, invitation flow, or admin UI, the minimum manual authorization setup is:

1. insert a `user` row in the canonical Better Auth `user` table
2. insert one or more `workspace_membership` rows for that user
3. optionally prefill `google_sub` if you already know it

Required operational behavior:

- if `google_sub` is absent, first login matches by email and then stores it
- if `google_sub` is present, future login follows the Google account even if the email changes
- no `account` or `session` rows need to be pre-created manually

### Session behavior

- multiple concurrent sessions allowed
- logout revokes current session only
- no cookie-cache optimization in V1

Reasoning:

- dashboard and mutation routes already hit the DB
- avoiding cookie-cache makes revocation and debugging simpler
- current-session logout behavior stays predictable

### Cookies

#### Better Auth session cookie

- managed by Better Auth
- secure in production
- `SameSite=Lax`

#### App workspace cookie

Use a separate cookie:

- name: `active_workspace`
- `httpOnly: true`
- `sameSite: "lax"`
- `secure: true` in prod
- `path: "/"`
- long expiration, e.g. 365 days

Security rule:

- the cookie is only a hint
- every request validates that the selected workspace belongs to the current user

### Workspace selection flow

- if the user has one workspace, auto-select it and set/update the cookie
- if the cookie references an inaccessible workspace, ignore it and fall back safely
- multiple workspaces selection is out of scope for V1 ( = always select first available workspace)

## 8. Server and API Plan

### Bun server responsibilities

`src/index.ts` remains the Bun entrypoint and owns:

- `GET /`
- `GET /login`
- `GET /healthz`
- `GET /readyz`
- forwarding `/api/*` into Hono

### Route behavior

- `GET /login`
  - if no valid session: serve `login.html`
  - if valid session: redirect to `/`
- `GET /`
  - if no valid session: redirect to `/login`
  - if valid session: serve `index.html`
- `GET /healthz`
  - returns `200 OK` if process is alive
- `GET /readyz`
  - runs a lightweight DB check such as `select 1`

### Hono responsibilities

Hono handles JSON endpoints only.

Route groups:

- `/api/auth/*`
- `/api/session`
- `/api/workspaces`
- `/api/dashboard`
- `/api/accounts`
- `/api/balance-snapshots`
- `/api/transactions`

### Hono middleware stack

- request ID
- structured request logging
- secure headers
- session resolution
- active workspace resolution for workspace-scoped routes
- centralized error serialization

No CORS configuration is needed in V1 because the frontend and API are same-origin.

### Hono RPC typing

Export `AppType` from the Hono app and use `hc<AppType>()` in the client.

That gives:

- typed input payloads
- typed JSON response inference
- one shared contract between server and client

## 9. Query and Mutation Strategy

### General rule

- Drizzle defines schema and types
- Bun SQL executes all runtime queries
- no Drizzle query builder for app runtime data access
- no DB views in V1
- SQL does the heavy lifting for metrics

### Database clients

Create two DB handles from the same connection:

- `sql = new SQL(DATABASE_URL, { bigint: true })`
- `drizzleDb = drizzle({ client: sql })`

Use:

- `sql` for app queries and transactions
- `drizzleDb` only for Better Auth adapter wiring and schema-typed integration

Bun SQL fit for this project:

- built into Bun, so no separate Postgres runtime package is needed
- pooled by default
- tagged-template query API matches the raw-SQL plan well
- `sql.begin(...)` transactions map cleanly to the mutation design

### Shared parsing and validation

Shared Zod schemas live under `src/schemas/*`.

Shared helpers:

- `parseMoneyInput("123,45") -> 12345`
- `formatMoneyMinor(12345) -> "CZK 123.45"` via `Intl.NumberFormat`
- `assertDateString("YYYY-MM-DD")`

Server validates everything again even if the client already validated it.

### Query modules

#### Session/bootstrap

Provide one bootstrap endpoint returning:

- current user
- workspace list
- active workspace id

This powers the initial app shell without exposing Better Auth internals directly to every component.

#### Accounts list

Return active accounts by default with:

- metadata
- derived current signed balance

Optionally include archived accounts in a separate section later.

#### Balance update prefill

Input:

- `selectedDate`
- active workspace

Query:

- active accounts
- latest snapshot on or before selected date per account

Output:

- one row per active account with prefilled raw value

#### Transactions list

Return current-month non-deleted transactions only, reverse chronological.

#### Dashboard summary

Compute in SQL with CTEs:

- opening month balance
- current balance
- month income total
- month expense total
- monthly spending total
- monthly spending excluding transactions
- last snapshot date

Implementation rule:

- all signed-balance logic happens in SQL based on account type
- client only renders the already-computed numbers

#### Dashboard chart

Use `generate_series()` from month start through today and, for each day, select the latest snapshot on or before that day per account, then sum signed balances.

This gives:

- correct carry-forward behavior
- correct handling of backfilled days
- correct inclusion of later-archived accounts in historical month data

### Mutation modules

All writes use `sql.begin(...)` transactions.

#### Set active workspace

- validates membership
- sets `active_workspace` cookie

#### Create account

Single transaction:

1. insert `financial_account`
2. insert initial `balance_snapshot` with today's business date

Notes:

- initial balance is required
- current balance remains snapshot-derived only

#### Edit account

- updates metadata only
- never updates balance

#### Archive account

- checks latest effective balance is zero
- sets `archived_at` and `archived_by_user_id`

#### Bulk save balance snapshots

- fetch current active account ids
- require one submitted amount per active account
- insert one snapshot row per active account for the selected date
- no dedupe, no overwrite, no warning

#### Create/edit/delete transaction

- create and edit update audit fields
- delete sets `deleted_at` and `deleted_by_user_id`
- archived accounts are rejected for new or edited transaction assignment

## 10. Frontend Plan

### Overall structure

Use two independent React entrypoints:

- `client/login`
- `client/app`

This keeps auth boot simpler than a router-based SPA and matches your explicit requirement.

### Login page

Responsibilities:

- render one Google sign-in button
- show access denied errors
- show loading state during OAuth redirect

Auth action:

- `authClient.signIn.social({ provider: "google" })`

### Authenticated app shell

The app at `/` is still one client-side React app, but without URL routing.

Top-level local view state:

- `dashboard`
- `accounts`
- `transactions`

Persisted state:

- active workspace in cookie only

Not persisted:

- internal view/tab selection
- open modal state
- list scroll positions

This is acceptable because URL persistence is explicitly out of scope.

### Client state plan

Use TanStack Query for:

- session bootstrap
- dashboard summary
- dashboard chart
- account list
- balance update prefill
- transaction list

Use local component state only for:

- current app section
- modal/dialog open state
- optimistic form UX

### Form plan

Use React Hook Form + Zod for:

- create/edit account
- bulk balance update
- create/edit transaction

Money input behavior:

- input is text with `inputMode="decimal"`
- parser accepts `.` and `,`
- client stores raw string during editing
- submit transforms to minor units

### UI plan

Use shadcn/ui for:

- cards
- buttons
- inputs
- labels
- select
- dialogs / sheets
- alert dialogs for destructive confirmation
- tabs or segmented navigation

Use Recharts for the month balance chart, wrapped in the shadcn visual style.

Visual direction:

- keep the current neutral shadcn base
- calm, low-noise dashboard
- KPI cards first
- chart directly under KPIs
- account balances and recent transactions below

### Empty states

Build explicit empty states for:

- no accessible workspace
- no accounts
- no balance snapshots this month
- no transactions

Each state should explain the missing prerequisite and surface the next action.

## 11. Logging and Diagnostics

### Logging format

Use structured JSON logs via a small internal logger wrapper.

Log fields:

- `level`
- `message`
- `requestId`
- `route`
- `method`
- `status`
- `userId` when available
- `workspaceId` when available
- domain-specific metadata

### Events to log

- request start/end
- auth success
- auth deny
- logout
- workspace switch
- account create/edit/archive
- balance bulk save
- transaction create/edit/delete
- readiness failures

This satisfies the requirement for debug-level event logging without introducing a full logging stack.

## 12. Local Development Plan

### Postgres in Docker

Create `compose.yaml` with one service:

- image: `postgres:18`
- container name: `money-ts-postgres`
- port: `5432:5432`
- db: `app`
- user: `app`
- password: `pass`
- named volume for persistence
- healthcheck using `pg_isready`

### Local workflow

1. `docker compose up -d`
2. `bunx drizzle-kit push`
3. `bun dev`

### Local OAuth

Google OAuth redirect URI:

- `http://localhost:3000/api/auth/callback/google`

No seed scripts or admin UI are planned. You will continue managing user and workspace rows manually.

## 13. Production and k3s Plan

### Container strategy

Keep production simple and close to the current base:

- build a Bun-based image
- run the Bun server directly from source
- do not introduce a separate Node or nginx layer

Suggested `Dockerfile` shape:

1. base image: `oven/bun`
2. copy `package.json`, `bun.lock`, source files
3. `bun install --frozen-lockfile --production`
4. run `bun src/index.ts`

This preserves Bun HTML imports and avoids inventing a new runtime shape for V1.

### k3s resources

#### App

- `Deployment` with 1 replica initially
- `Service` as `ClusterIP`
- `Ingress` for public hostname
- env from Kubernetes `Secret`
- `readinessProbe`: `GET /readyz`
- `livenessProbe`: `GET /healthz`

#### Postgres

- `StatefulSet` with 1 replica
- persistent volume claim
- internal `Service`
- same major version as local: PostgreSQL 18

### Secret management

Local:

- `.env`

Production:

- Kubernetes `Secret`

Secret set includes at minimum:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APP_URL`

### Production schema push workflow

Because schema management is `drizzle-kit push` everywhere, the production rollout order must be explicit:

1. deploy or update secrets
2. run `bunx drizzle-kit push` against production DB from a one-off container or admin shell
3. roll the app deployment
4. verify `/readyz`
5. manually smoke test login and one write action

### Health endpoints

- `/healthz`: process health only
- `/readyz`: DB connectivity and basic app readiness

### Explicitly not planned

- staging environment
- automated backups
- automated migration jobs
- test automation

## 14. Manual Smoke Checklist

Because there is no test suite and no staging, this manual checklist is the release gate.

### Auth

- authorized Google account can sign in
- unauthorized Google account is denied and does not land in the app
- first login writes `google_sub`
- later login still works after Google email changes
- logout revokes only the current session

### Workspace

- one-workspace user is auto-entered
- multi-workspace user can switch workspace
- workspace cookie persists the last valid choice

### Money flows

- create account with initial balance
- bulk update balances for all active accounts
- backfill a prior date
- create, edit, and delete a transaction
- archive only works when effective balance is zero

### Dashboard

- KPI values match known sample data
- chart carries forward days with no snapshot
- archived accounts still affect historical current-month chart points

### Ops

- `/healthz` returns 200
- `/readyz` returns 200
- logs show request id, user id, and workspace id on mutations


## 16. Accepted Risks and Tradeoffs

- `drizzle-kit push` in production is intentionally accepted for speed.
- No test suite means regressions are caught by typechecking and manual smoke only.
- No staging means production rollout discipline matters more than usual.
- No URL routing means no deep links to accounts or transactions.
- Manual user/workspace management remains an external operational task.

These are not oversights. They are deliberate constraints for the MVP.

## 17. Reference Docs

- [Bun server and HTML imports](https://bun.com/docs/runtime/http/server)
- [Bun full-stack HTML import workflow](https://bun.com/docs/bundler/fullstack)
- [Hono on Bun](https://hono.dev/docs/getting-started/bun)
- [Hono RPC](https://hono.dev/docs/guides/rpc)
- [Better Auth Hono integration](https://better-auth.com/docs/integrations/hono)
- [Better Auth Google provider](https://better-auth.com/docs/authentication/google)
- [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
- [Better Auth hooks](https://better-auth.com/docs/concepts/hooks)
- [Better Auth session management](https://better-auth.com/docs/concepts/session-management)
- [Better Auth database concepts and additional fields](https://better-auth.com/docs/concepts/database)
- [Drizzle schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration)
- [Drizzle migrations and push workflow](https://orm.drizzle.team/docs/migrations)
- [Drizzle Bun SQL support](https://orm.drizzle.team/docs/connect-bun-sql)
- [Bun SQL](https://bun.com/docs/runtime/sql)
