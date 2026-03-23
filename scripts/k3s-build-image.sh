#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-cashy-app}"

if [[ -n "${IMAGE_TAG:-}" ]]; then
  tag="${IMAGE_TAG}"
else
  tag="$(git -C "${ROOT_DIR}" rev-parse --short HEAD)"
  if ! git -C "${ROOT_DIR}" diff --quiet; then
    tag="${tag}-dirty"
  fi
fi

full_image="${IMAGE_NAME}:${tag}"

docker build -t "${full_image}" "${ROOT_DIR}"
docker save "${full_image}" | sudo k3s ctr images import -

echo "Built and imported ${full_image}."
echo "Deploy with: IMAGE_TAG=${tag} ./scripts/k3s-deploy.sh"
