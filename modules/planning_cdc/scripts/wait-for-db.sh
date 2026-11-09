#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RBM Platform — Wait for MySQL container to accept connections.
# Usage: ./scripts/wait-for-db.sh [container] [timeout-seconds]
# Defaults: container=rbm-db-dev, timeout=60
# ─────────────────────────────────────────────────────────────
set -euo pipefail

CONTAINER="${1:-rbm-db-dev}"
TIMEOUT="${2:-60}"
ROOT_PASSWORD="${DB_ROOT_PASSWORD:-root}"

. "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

info "Waiting up to ${TIMEOUT}s for MySQL container '${CONTAINER}'..."

i=0
while [ "$i" -lt "$TIMEOUT" ]; do
  if docker exec "$CONTAINER" mysqladmin ping -h localhost -u root -p"$ROOT_PASSWORD" --silent >/dev/null 2>&1; then
    ok "MySQL ready in ${i}s"
    exit 0
  fi
  sleep 1
  i=$((i+1))
done

fail "MySQL not ready after ${TIMEOUT}s"
exit 1
