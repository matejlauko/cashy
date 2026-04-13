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

APP_NAME="${APP_NAME:-cashy-app}"
IMAGE_NAME="${IMAGE_NAME:-cashy-app}"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "${ROOT_DIR}" rev-parse --short HEAD)}"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
RUN_DB_PUSH="${RUN_DB_PUSH:-0}"

export NAMESPACE APP_HOST
ENVSUBST_VARS='${NAMESPACE} ${APP_HOST}'

apply_template() {
  envsubst "${ENVSUBST_VARS}" < "$1" | kubectl apply -f -
}

echo "Deploying ${FULL_IMAGE} to ${ENV} (namespace: ${NAMESPACE}, host: ${APP_HOST})"

for secret_name in postgres-credentials "${APP_NAME}"; do
  if ! kubectl -n "${NAMESPACE}" get secret "${secret_name}" >/dev/null 2>&1; then
    echo "Missing secret ${secret_name} in namespace ${NAMESPACE}. Run ENV=${ENV} ./scripts/k3s-apply-secrets.sh first."
    exit 1
  fi
done

apply_template "${ROOT_DIR}/ops/k8s/namespace.yaml"
apply_template "${ROOT_DIR}/ops/k8s/postgres-service.yaml"
apply_template "${ROOT_DIR}/ops/k8s/postgres-statefulset.yaml"
kubectl -n "${NAMESPACE}" wait --for=condition=Ready pod -l app=postgres --timeout=180s

if [[ "${RUN_DB_PUSH}" == "1" ]]; then
  ENV="${ENV}" "${ROOT_DIR}/scripts/k3s-db-push.sh"
fi

apply_template "${ROOT_DIR}/ops/k8s/https-redirect-middleware.yaml"
apply_template "${ROOT_DIR}/ops/k8s/app-service.yaml"
apply_template "${ROOT_DIR}/ops/k8s/app-deployment.yaml"
kubectl -n "${NAMESPACE}" set image deployment/"${APP_NAME}" app="${FULL_IMAGE}"
kubectl -n "${NAMESPACE}" annotate deployment/"${APP_NAME}" \
  kubernetes.io/change-cause="${IMAGE_TAG} - $(date -u '+%Y-%m-%d %H:%M:%S')" \
  --overwrite
apply_template "${ROOT_DIR}/ops/k8s/ingress.yaml"
kubectl -n "${NAMESPACE}" rollout status deployment/"${APP_NAME}" --timeout=180s

kubectl -n "${NAMESPACE}" get pods
kubectl -n "${NAMESPACE}" get ingress

echo "Deployed ${FULL_IMAGE} to ${ENV}."
