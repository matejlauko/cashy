# Cashy

Personal household money tracker built with Bun, Hono, React, and PostgreSQL.

## Local Development

### Prerequisites

- [Bun](https://bun.sh) >= 1.x
- [Docker](https://docs.docker.com/get-docker/) (for PostgreSQL)

### Setup

1. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

2. Copy environment file and adjust values:

   ```bash
   cp .env.example .env
   ```

3. Install dependencies:

   ```bash
   bun install
   ```

4. Push database schema:

   ```bash
   bunx drizzle-kit push
   ```

5. Start development server:
   ```bash
   bun dev
   ```

The app runs at http://localhost:3000.

### Building for Production

```bash
bun run build
```

Bundles frontend assets into `dist/`.

### Running Production Locally

```bash
bun start
```

## CLI

Thin terminal client over the `/api/*` HTTP API. Run from this repo:

```bash
bun run cashy auth login          # browser flow; --manual to paste a token
bun run cashy auth whoami
bun run cashy status [--month YYYY-MM]
bun run cashy balance set Checking=1234.56 "Air Bank"=42 [--date YYYY-MM-DD]
bun run cashy import balances.csv # or .json
bun run cashy auth logout
```

Global flags: `--api-url`, `--token`, `--json`. Config resolution: flags →
`CASHY_API_URL`/`CASHY_TOKEN` env → `~/.config/cashy/config.json` (0600).
Amounts are major units with ≤ 2 decimals. Exit codes: 0 ok, 1 network, 2
validation, 3 unauthorized, 4 not found.

Import file formats (accounts by name or id, empty cells skipped, one API
write per date, oldest first; re-running is safe):

```csv
date,Checking,Savings
2026-07-01,1234.56,9000
2026-07-08,1100.20,
```

```json
{ "2026-07-01": { "Checking": 1234.56, "Savings": 9000 } }
```

Each write covers the full active account set, so any accounts you don't
specify for a date are carried forward at their existing balances (`balance
set` reports "(n account(s) carried forward…)", `import` appends "(+n carried
forward)").

## Docker

### Build

```bash
docker build -t cashy-app .
```

### Run

```bash
docker run --rm \
  --env-file .env \
  -e NODE_ENV=production \
  -p 3000:3000 \
  cashy-app
```

The container needs network access to PostgreSQL. When running alongside the compose PostgreSQL, use `--network host` or configure Docker networking.

## Production Deployment (k3s)

This setup is intentionally small and self-hosted:

- Single-node `k3s`
- Built-in Traefik ingress controller
- Built-in `local-path` storage class
- In-cluster PostgreSQL
- Automatic TLS via cert-manager + Let's Encrypt
- App image built locally and imported directly into k3s

### Prerequisites

- DNS for `cashy.lauko.io` points at your VPS
- Ports `80` and `443` are reachable from the internet
- `kubectl`, `docker`, `sudo`, and `bun` are available on the machine you use for deploys
- `k3s` is installed on the VPS

Google OAuth for web apps requires HTTPS outside localhost, so `APP_URL` must be the final `https://...` URL before login will work.

### One-time Configuration

1. Copy the secret env files:

   ```bash
   cp ops/k8s/app.env.example ops/k8s/app.env
   cp ops/k8s/postgres.env.example ops/k8s/postgres.env
   ```

2. Edit `ops/k8s/app.env`:
   - Set `APP_URL=https://cashy.lauko.io`
   - Set `DATABASE_URL=postgres://app:<password>@postgres:5432/app`
   - Fill in `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`

3. Edit `ops/k8s/postgres.env`:
   - Set `POSTGRES_PASSWORD` to the same password used in `DATABASE_URL`

4. Edit `ops/k8s/cluster-issuer.yaml`:
   - Replace `replace-with-real-email@example.com` with your real Let's Encrypt email

5. If you are not using `cashy.lauko.io`, update the host in `ops/k8s/ingress.yaml` and `APP_URL` in `ops/k8s/app.env` to the same final hostname.

### First Deploy

1. Apply the app and database secrets:

   ```bash
   ./scripts/k3s-apply-secrets.sh
   ```

2. Build the image and import it into k3s:

   ```bash
   IMAGE_TAG=$(git rev-parse --short HEAD) ./scripts/k3s-build-image.sh
   ```

3. Push the database schema:

   ```bash
   ./scripts/k3s-db-push.sh
   ```

4. Deploy the manifests:

   ```bash
   IMAGE_TAG=$(git rev-parse --short HEAD) ./scripts/k3s-deploy.sh
   ```

5. Verify the rollout:

   ```bash
   kubectl -n cashy get pods
   kubectl -n cashy get ingress
   kubectl describe clusterissuer letsencrypt-production
   ```

6. Smoke test:
   - `curl -I https://cashy.lauko.io/healthz`
   - `curl -I https://cashy.lauko.io/readyz`
   - Open the app and complete Google login

The first certificate issuance can take a minute or two after the ingress is created.

### Updating the App

1. Build and import a new image:

   ```bash
   IMAGE_TAG=$(git rev-parse --short HEAD) ./scripts/k3s-build-image.sh
   ```

2. If the schema changed, push it before the rollout:

   ```bash
   ./scripts/k3s-db-push.sh
   ```

3. Deploy the new image:
   ```bash
   IMAGE_TAG=$(git rev-parse --short HEAD) ./scripts/k3s-deploy.sh
   ```

### Backups

Create a local SQL backup through a temporary tunnel to the in-cluster database:

```bash
BACKUP_DIR=/srv/backups/cashy ./scripts/k3s-backup-db.sh
```

Keep those backups off the VPS as well if you care about recovery from disk loss.

## Health Endpoints

| Endpoint   | Purpose         | Success | Failure                 |
| ---------- | --------------- | ------- | ----------------------- |
| `/healthz` | Process alive   | 200 OK  | No response             |
| `/readyz`  | DB connectivity | 200 OK  | 503 Service Unavailable |

## Reference Docs

- https://bun.com/docs/runtime/http/server
- https://bun.com/docs/bundler/fullstack
- https://hono.dev/docs/guides/rpc
- https://better-auth.com/docs/integrations/hono
- https://better-auth.com/docs/authentication/google
