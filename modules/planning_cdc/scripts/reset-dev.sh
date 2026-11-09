#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RBM Platform — Reset local dev environment.
# DESTROYS the dev MySQL volume, restarts infra, runs migrations
# and seeds. Use only in DEV. Asks for confirmation unless --yes.
# Usage:
#   ./scripts/reset-dev.sh         # interactive
#   ./scripts/reset-dev.sh --yes   # no prompt
# ─────────────────────────────────────────────────────────────
set -euo pipefail

. "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

cd "$REPO_ROOT"

SKIP_CONFIRM=false
case "${1:-}" in
  --yes|-y) SKIP_CONFIRM=true ;;
esac

title "RBM Dev Reset"
warn "This will DESTROY all data in the dev MySQL volume (rbm-db-data-dev)."

if [ "$SKIP_CONFIRM" = false ]; then
  printf "Type 'yes' to confirm: "
  read -r CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
  fi
fi

info "[1/5] Stopping dev containers..."
docker compose -f docker-compose.dev.yml down --volumes --remove-orphans 2>/dev/null || true

info "[2/5] Pruning dangling images and build cache..."
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f >/dev/null 2>&1 || true

info "[3/5] Starting infra (db + cache)..."
docker compose -f docker-compose.dev.yml up -d db cache

info "[4/5] Waiting for MySQL to be ready..."
"$SCRIPT_DIR/wait-for-db.sh" "${RBM_DB_DEV_CONTAINER}" 90

info "[5/5] Running Knex migrations + seeds (native)..."
(
  cd services/api-server
  DB_HOST=127.0.0.1 \
  DB_PORT="${DB_PORT_EXPOSED:-3306}" \
  DB_USER="${DB_USER:-rbm_user}" \
  DB_PASSWORD="${DB_PASSWORD:-rbm_pass}" \
  DB_NAME="${DB_NAME:-rbm_platform_dev}" \
  npx knex migrate:latest --knexfile knexfile.js
)
ok "Migrations applied"

(
  cd services/api-server
  DB_HOST=127.0.0.1 \
  DB_PORT="${DB_PORT_EXPOSED:-3306}" \
  DB_USER="${DB_USER:-rbm_user}" \
  DB_PASSWORD="${DB_PASSWORD:-rbm_pass}" \
  DB_NAME="${DB_NAME:-rbm_platform_dev}" \
  npx knex seed:run --knexfile knexfile.js
)
ok "Seeds applied"

title "Reset complete"
echo "Run 'npm run dev' from the repo root, or 'make dev' once Makefile is in place."
