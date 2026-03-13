# Money TS

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

The app runs at http://localhost:3050.

### Building for Production

```bash
bun run build
```

Bundles frontend assets into `dist/`.

### Running Production Locally

```bash
bun start
```

## Docker

### Build

```bash
docker build -t money-ts-app .
```

### Run

```bash
docker run --rm \
  --env-file .env \
  -e NODE_ENV=production \
  -p 3050:3050 \
  money-ts-app
```

The container needs network access to PostgreSQL. When running alongside the compose PostgreSQL, use `--network host` or configure Docker networking.

## Production Deployment (k3s)

### Rollout Order

1. **Create namespace:**
   ```bash
   kubectl apply -f ops/k8s/namespace.yaml
   ```

2. **Create secrets:**
   ```bash
   kubectl -n money-ts create secret generic postgres-credentials \
     --from-literal=POSTGRES_PASSWORD='<strong-password>'

   kubectl -n money-ts create secret generic money-ts-app \
     --from-literal=DATABASE_URL='postgres://app:<password>@postgres:5432/app' \
     --from-literal=APP_URL='https://money.example.com' \
     --from-literal=BETTER_AUTH_SECRET='<random-secret>' \
     --from-literal=GOOGLE_CLIENT_ID='<id>' \
     --from-literal=GOOGLE_CLIENT_SECRET='<secret>'
   ```

3. **Deploy PostgreSQL:**
   ```bash
   kubectl apply -f ops/k8s/postgres-statefulset.yaml
   kubectl apply -f ops/k8s/postgres-service.yaml
   kubectl -n money-ts wait --for=condition=Ready pod -l app=postgres --timeout=60s
   ```

4. **Push database schema** (from a machine with DB access):
   ```bash
   DATABASE_URL='postgres://app:<password>@<db-host>:5432/app' bunx drizzle-kit push
   ```

5. **Build and import app image:**
   ```bash
   docker build -t money-ts-app:latest .
   docker save money-ts-app:latest | sudo k3s ctr images import -
   ```

6. **Deploy app:**
   ```bash
   kubectl apply -f ops/k8s/app-deployment.yaml
   kubectl apply -f ops/k8s/app-service.yaml
   kubectl apply -f ops/k8s/ingress.yaml
   ```

7. **Verify:**
   ```bash
   kubectl -n money-ts wait --for=condition=Ready pod -l app=money-ts-app --timeout=60s
   kubectl -n money-ts get pods
   ```

8. **Smoke test:**
   - `curl -s https://money.example.com/healthz` returns `OK`
   - `curl -s https://money.example.com/readyz` returns `OK`
   - Open browser, verify Google login works
   - Create an account and update balances to confirm writes work

### Updating the App

1. Build new image and import to k3s
2. If schema changed: run `bunx drizzle-kit push` against production DB first
3. Restart deployment: `kubectl -n money-ts rollout restart deployment/money-ts-app`
4. Wait for rollout: `kubectl -n money-ts rollout status deployment/money-ts-app`
5. Smoke test

## Health Endpoints

| Endpoint | Purpose | Success | Failure |
|----------|---------|---------|---------|
| `/healthz` | Process alive | 200 OK | No response |
| `/readyz` | DB connectivity | 200 OK | 503 Service Unavailable |

## Reference Docs

- https://bun.com/docs/runtime/http/server
- https://bun.com/docs/bundler/fullstack
- https://hono.dev/docs/guides/rpc
- https://better-auth.com/docs/integrations/hono
- https://better-auth.com/docs/authentication/google
