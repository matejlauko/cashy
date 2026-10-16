# Deploying Cashy to Cloudflare

The app is one Worker (`cashy`) that serves the built frontend as static assets and the API from `src/worker.ts`, backed by the D1 database `cashy`. Design and rationale: [`docs/superpowers/specs/2026-10-10-cloudflare-migration-design.md`](superpowers/specs/2026-10-10-cloudflare-migration-design.md).

Everything below runs from the repo root. `bunx wrangler …` uses the project's pinned Wrangler.

## First-time setup

Steps 1–4 put the new stack on a `workers.dev` URL next to the running VPS. Nothing changes for users until [the cutover](#cutover).

### 1. Log in

```sh
bunx wrangler login
bunx wrangler whoami   # must be the account that holds the lauko.io zone
```

### 2. Create the database

```sh
bunx wrangler d1 create cashy --jurisdiction=eu
```

Paste the printed `database_id` into `wrangler.jsonc`, replacing the `00000000-…` placeholder. `--jurisdiction=eu` pins the data to the EU and cannot be changed later.

The local dev database is keyed by this id, so it starts empty after the change. Refill it:

```sh
bun run db:restore:local
```

### 3. Deploy with the production secrets

The three secrets come from the old stack's env file. `BETTER_AUTH_SECRET` must be the production value, otherwise existing logins stop working.

```sh
SECRETS=$(mktemp)
grep -E '^(BETTER_AUTH_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET)=' ops/k8s/app.env > "$SECRETS"
bun run deploy -- --secrets-file "$SECRETS"
rm "$SECRETS"
```

`bun run deploy` builds, applies pending migrations to the remote database (it asks first), and uploads the Worker. Note two things in its output:

- the `https://cashy.<subdomain>.workers.dev` URL;
- `startup_time_ms`, which must stay well under 1000.

Later deploys are just `bun run deploy`; secrets persist.

Check it is alive:

```sh
curl https://cashy.<subdomain>.workers.dev/readyz    # OK
```

`Server misconfigured` (HTTP 500) means a var or secret is missing; `bunx wrangler tail` shows which.

### 4. Import the data and verify

Take a fresh dump of production (on the machine with `kubectl` access), convert it, import it:

```sh
./scripts/k3s-backup-db.sh                         # writes backups/<timestamp>/
bun scripts/pg-dump-to-d1.ts backups/<timestamp>   # writes backups/<timestamp>/d1-import.sql
bunx wrangler d1 execute cashy --remote --file=backups/<timestamp>/d1-import.sql
```

The converter prints row counts per table. Compare with the database:

```sh
bunx wrangler d1 execute cashy --remote --command \
  "SELECT (SELECT count(*) FROM balance_snapshot) AS snapshots, (SELECT count(*) FROM financial_transaction) AS transactions, (SELECT count(*) FROM financial_account) AS accounts"
```

Then compare the two deployments' API responses for every month. The token is your CLI token (from `cashy auth login`, or `CASHY_TOKEN`); it works on both because the `apikey` rows were imported.

```sh
bun scripts/parity-check.ts https://cashy.lauko.io https://cashy.<subdomain>.workers.dev
```

It must end with `no differences`.

**CPU check.** The free plan allows 10 ms of CPU per request and tolerates occasional overruns. Cold requests are the risk. In one terminal run `bunx wrangler tail --format json`; in another, redeploy a few times (each deploy starts cold) and after each one call:

```sh
bun run cashy --api-url https://cashy.<subdomain>.workers.dev status
```

Every event in the tail should have `"outcome": "ok"`. An `exceededCpu` outcome, or error 1102 in the CLI, means cold requests are being killed: upgrade to Workers Paid ($5/month), or see risk R1 in the spec for alternatives.

Browser login cannot be tested on `workers.dev`, because Google only redirects to the registered origin. It is the first check after cutover.

To re-run the import (for example at cutover), empty the tables first:

```sh
bunx wrangler d1 execute cashy --remote --file=scripts/d1-wipe.sql
```

## Cutover

About fifteen minutes. Do not use the app during it.

1. Final dump: `./scripts/k3s-backup-db.sh`.
2. Stop writes to the old database (Postgres keeps running for rollback):
   ```sh
   kubectl -n cashy scale deployment/cashy-app --replicas=0
   ```
3. Wipe, convert and import the final dump, as in step 4 above.
4. In `wrangler.jsonc`: uncomment the `routes` line and set `"workers_dev": false`.
5. In the Cloudflare dashboard, delete the `cashy` A record of `lauko.io` (it conflicts with the custom domain). Then:
   ```sh
   bun run deploy
   ```
   The certificate is issued automatically, usually within a minute or two.
6. Confirm "Always Use HTTPS" is on for the zone (SSL/TLS → Edge Certificates). Traefik did this redirect before.
7. Smoke test:
   - open `https://cashy.lauko.io` in a browser that was signed in before: the dashboard loads without a login prompt;
   - sign out, sign in with Google;
   - add and delete a test transaction, submit a balance update;
   - `bun run cashy auth whoami` and `bun run cashy status`. A 403 with a Cloudflare challenge page means Bot Fight Mode is blocking the CLI: turn it off for the zone (Security → Bots);
   - `/healthz` and `/readyz` return 200.

### Rollback

Possible until the old stack is deleted:

1. Remove the custom domain: comment the `routes` line out again and `bun run deploy` (or remove it under the Worker's Settings → Domains & Routes).
2. Recreate the A record `cashy → 91.99.158.62`, DNS only.
3. `kubectl -n cashy scale deployment/cashy-app --replicas=1`.

Anything written to D1 after the cutover has to be re-entered by hand in the old app.

### Afterwards

After a couple of weeks without problems: keep the final Postgres dump somewhere off the VPS, delete the `cashy` namespace on k3s, and remove the old-stack files from the repo (`Dockerfile`, `.dockerignore`, `compose.yaml`, `ops/k8s/`, `scripts/k3s-*.sh`, `scripts/local-connect-db.sh`, the untracked `drizzle/` folder). `scripts/pg-dump-to-d1.ts`, `scripts/lib/pg-dump.ts`, `scripts/parity-check.ts` and `scripts/d1-wipe.sql` are one-off migration tools and can go at the same time.

## Day to day

| Task | Command |
| --- | --- |
| Deploy | `bun run deploy` |
| Live logs | `bunx wrangler tail` (stored logs and traces: dashboard → Workers → cashy → Observability) |
| Back up | `bun run db:backup` → `backups/<timestamp>/schema.sql` + `data.sql` |
| Undo recent damage | `bunx wrangler d1 time-travel restore cashy --timestamp=<RFC 3339 time>` (reaches back 7 days on the free plan) |
| Copy production into local dev | `bun run db:backup && bun run db:restore:local` |
| Run SQL | `bunx wrangler d1 execute cashy --remote --command "…"` |
| Add a user | fill in and run `scripts/bootstrap-user-workspace.sql` |
| Set or rotate a secret | `bunx wrangler secret put <NAME>` (deploys immediately) |

### Restoring a backup into an empty database

```sh
bunx wrangler d1 execute <database> --remote --file=backups/<timestamp>/schema.sql
bunx wrangler d1 execute <database> --remote --file=backups/<timestamp>/data.sql
```

Do not run `migrations apply` first: the data file already contains the migration history. A backup is two files because a single combined export cannot be restored into an empty database (it inserts child rows before their parent tables exist).

### Schema changes

1. Edit `src/db/schema/*.ts`.
2. `bun run db:generate`, then **read the generated SQL** in `migrations/`. drizzle-kit emits broken SQL for index expressions with more than one argument; write those by hand in a custom migration (`bunx drizzle-kit generate --custom --name=<name>`).
3. `bun run db:migrate:local`, test.
4. `bun run deploy` applies the migration to the remote database before uploading the Worker.

`wrangler deploy` uploads the build in `dist/`, described by the generated `dist/cashy/wrangler.json`, so always deploy through `bun run deploy`, which rebuilds first. The `wrangler d1 …` commands read `wrangler.jsonc` directly.
