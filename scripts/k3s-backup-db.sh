#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAMESPACE="${NAMESPACE:-cashy}"
APP_ENV_FILE="${APP_ENV_FILE:-${ROOT_DIR}/ops/k8s/app.env}"
LOCAL_PORT="${LOCAL_PORT:-15432}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
PORT_FORWARD_LOG="${PORT_FORWARD_LOG:-/tmp/cashy-k3s-port-forward.log}"

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
kubectl -n "${NAMESPACE}" port-forward "pod/${postgres_pod}" "${LOCAL_PORT}:5432" >"${PORT_FORWARD_LOG}" 2>&1 &
port_forward_pid=$!
cleanup() {
  kill "${port_forward_pid}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

sleep 2

local_database_url="${database_url/@postgres:5432/@127.0.0.1:${LOCAL_PORT}}"
DATABASE_URL="${local_database_url}" BACKUP_DIR="${BACKUP_DIR}" bun "${ROOT_DIR}/scripts/backup-db.ts"
