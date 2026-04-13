#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

STAGING_IMAGE="$(kubectl -n cashy-staging get deployment cashy-app \
  -o jsonpath='{.spec.template.spec.containers[0].image}')"

if [[ -z "${STAGING_IMAGE}" ]]; then
  echo "No deployment found in cashy-staging namespace."
  exit 1
fi

IMAGE_TAG="${STAGING_IMAGE#*:}"

echo "Staging is running: ${STAGING_IMAGE}"
echo "Promoting ${IMAGE_TAG} to production..."
read -r -p "Continue? [y/N] " confirm
if [[ "${confirm}" != [yY] ]]; then
  echo "Aborted."
  exit 0
fi

IMAGE_TAG="${IMAGE_TAG}" ENV=production "${ROOT_DIR}/scripts/k3s-deploy.sh"
