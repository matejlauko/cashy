#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV="${ENV:-production}"
ENV_FILE="${ROOT_DIR}/ops/k8s/env.${ENV}.sh"
if [[ ! -f "${ENV_FILE}" ]]; then echo "Unknown environment '${ENV}'."; exit 1; fi
# shellcheck source=/dev/null
source "${ENV_FILE}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"

if [[ ! -f "${APP_ENV_FILE}" ]]; then
  echo "Missing ${APP_ENV_FILE}. Copy ops/k8s/app.env.example first."
  exit 1
fi

database_url="$(grep '^DATABASE_URL=' "${APP_ENV_FILE}" | cut -d= -f2- || true)"
if [[ -z "${database_url}" ]]; then
  echo "DATABASE_URL is missing from ${APP_ENV_FILE}."
  exit 1
fi

if [[ "${database_url}" != *"@postgres:5432/"* ]]; then
  echo "DATABASE_URL must point at postgres:5432 for this helper script."
  exit 1
fi

kubectl -n "${NAMESPACE}" wait --for=condition=Ready pod -l app=postgres --timeout=180s >/dev/null
postgres_pod="$(kubectl -n "${NAMESPACE}" get pod -l app=postgres -o jsonpath='{.items[0].metadata.name}')"

now="$(date +%Y-%m-%d_%H-%M-%S)"
dir="${BACKUP_DIR}/${now}"
mkdir -p "${dir}"

echo "Backing up to ${dir}/"

# Use pg_dump from inside the container to avoid version mismatch
kubectl -n "${NAMESPACE}" exec "${postgres_pod}" -- \
  pg_dump "${database_url}" --schema-only --no-owner --no-privileges > "${dir}/schema.sql"
echo "Schema saved to schema.sql"

kubectl -n "${NAMESPACE}" exec "${postgres_pod}" -- \
  pg_dump "${database_url}" --data-only --no-owner --no-privileges > "${dir}/data.sql"
echo "Data saved to data.sql"

echo "Done!"
