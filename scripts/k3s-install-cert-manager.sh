#!/usr/bin/env bash
set -euo pipefail

CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.19.2}"

kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml"
kubectl -n cert-manager wait \
  --for=condition=Available \
  deployment/cert-manager \
  deployment/cert-manager-cainjector \
  deployment/cert-manager-webhook \
  --timeout=180s

echo "cert-manager ${CERT_MANAGER_VERSION} is installed and ready."
