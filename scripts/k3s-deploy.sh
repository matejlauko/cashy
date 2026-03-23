#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAMESPACE="${NAMESPACE:-cashy}"
APP_NAME="${APP_NAME:-cashy-app}"
IMAGE_NAME="${IMAGE_NAME:-cashy-app}"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "${ROOT_DIR}" rev-parse --short HEAD)}"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
RUN_DB_PUSH="${RUN_DB_PUSH:-0}"

for secret_name in postgres-credentials cashy-app; do
  if ! kubectl -n "${NAMESPACE}" get secret "${secret_name}" >/dev/null 2>&1; then
    echo "Missing secret ${secret_name} in namespace ${NAMESPACE}. Run ./scripts/k3s-apply-secrets.sh first."
    exit 1
  fi
done

kubectl apply -f "${ROOT_DIR}/ops/k8s/namespace.yaml"
kubectl apply -f "${ROOT_DIR}/ops/k8s/postgres-service.yaml"
kubectl apply -f "${ROOT_DIR}/ops/k8s/postgres-statefulset.yaml"
kubectl -n "${NAMESPACE}" wait --for=condition=Ready pod -l app=postgres --timeout=180s

if [[ "${RUN_DB_PUSH}" == "1" ]]; then
  "${ROOT_DIR}/scripts/k3s-db-push.sh"
fi

kubectl apply -f "${ROOT_DIR}/ops/k8s/https-redirect-middleware.yaml"
kubectl apply -f "${ROOT_DIR}/ops/k8s/app-service.yaml"
kubectl apply -f "${ROOT_DIR}/ops/k8s/app-deployment.yaml"
kubectl -n "${NAMESPACE}" set image deployment/"${APP_NAME}" app="${FULL_IMAGE}"
kubectl apply -f "${ROOT_DIR}/ops/k8s/ingress.yaml"
kubectl -n "${NAMESPACE}" rollout status deployment/"${APP_NAME}" --timeout=180s

kubectl -n "${NAMESPACE}" get pods
kubectl -n "${NAMESPACE}" get ingress

echo "Deployed ${FULL_IMAGE}."
