#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV="${ENV:-production}"
ENV_FILE="${ROOT_DIR}/ops/k8s/env.${ENV}.sh"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Unknown environment '${ENV}'. Missing ${ENV_FILE}."
  exit 1
fi

# shellcheck source=/dev/null
source "${ENV_FILE}"

APP_SECRET_NAME="${APP_SECRET_NAME:-cashy-app}"
POSTGRES_SECRET_NAME="${POSTGRES_SECRET_NAME:-postgres-credentials}"

if [[ ! -f "${APP_ENV_FILE}" ]]; then
  echo "Missing ${APP_ENV_FILE}. Copy ops/k8s/app.env.example first."
  exit 1
fi

if [[ ! -f "${POSTGRES_ENV_FILE}" ]]; then
  echo "Missing ${POSTGRES_ENV_FILE}. Copy ops/k8s/postgres.env.example first."
  exit 1
fi

kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

kubectl -n "${NAMESPACE}" create secret generic "${POSTGRES_SECRET_NAME}" \
  --from-env-file="${POSTGRES_ENV_FILE}" \
  --dry-run=client \
  -o yaml | kubectl apply -f -

kubectl -n "${NAMESPACE}" create secret generic "${APP_SECRET_NAME}" \
  --from-env-file="${APP_ENV_FILE}" \
  --dry-run=client \
  -o yaml | kubectl apply -f -

echo "Secrets applied in namespace ${NAMESPACE}."
