#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RBM Platform — Run Knex migrations
# Two modes:
#   ./scripts/migrate-all.sh             # docker (rbm-api-server)
#   ./scripts/migrate-all.sh --local     # native (services/api-server)
#   ./scripts/migrate-all.sh --staging   # docker compose staging stack
# ─────────────────────────────────────────────────────────────
set -euo pipefail

. "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

cd "$REPO_ROOT"

MODE="docker"
case "${1:-}" in
  --local)   MODE="local"   ;;
  --staging) MODE="staging" ;;
  --dev)     MODE="dev"     ;;
esac

title "RBM Migration Runner ($MODE)"

case "$MODE" in
  local)
    info "Running 'npx knex migrate:latest' natively from services/api-server"
    (cd services/api-server && npx knex migrate:latest --knexfile knexfile.js)
    ;;
  dev)
    info "Running migrations inside ${RBM_API_DEV_CONTAINER}"
    docker exec -t "${RBM_API_DEV_CONTAINER}" sh -c "npx knex migrate:latest --knexfile knexfile.js"
    ;;
  staging)
    info "Running migrations inside the staging api-server container"
    docker compose -f docker-compose.yml -f docker-compose.staging.yml \
      exec -T api-server sh -c "npx knex migrate:latest --knexfile knexfile.js"
    ;;
  docker)
    info "Running migrations inside ${RBM_API_CONTAINER}"
    docker exec -t "${RBM_API_CONTAINER}" sh -c "npx knex migrate:latest --knexfile knexfile.js"
    ;;
esac

ok "Migrations applied"
