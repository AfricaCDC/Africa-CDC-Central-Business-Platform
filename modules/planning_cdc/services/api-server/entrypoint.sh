#!/bin/sh
# ─────────────────────────────────────────────────────────────
# RBM api-server entrypoint
# Runs Knex migrations before starting the Express app, so a
# fresh container can never serve traffic against an out-of-date
# schema. Migration failure exits non-zero, so the container
# never starts in a broken state.
# ─────────────────────────────────────────────────────────────
set -e

echo "[api-server] NODE_ENV=${NODE_ENV:-development}"

# ── Wait for the database TCP port before running knex ──
# `depends_on: service_healthy` only checks the mysqladmin socket ping,
# which passes before MySQL's TCP listener is actually ready for external
# connections. Knex migrate uses TCP and will hit ECONNREFUSED if we don't
# wait. Loop until TCP is reachable (max 60s).
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-3306}"
echo "[api-server] Waiting for DB at ${DB_HOST}:${DB_PORT}..."
i=0
until node -e "require('net').createConnection({host:'${DB_HOST}',port:${DB_PORT}}).on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)})" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 60 ]; then
    echo "[api-server] ERROR: DB TCP not ready after 60s — aborting" >&2
    exit 1
  fi
  sleep 1
done
echo "[api-server] DB TCP ready after ${i}s"

# Skip migrations only if explicitly opted out
if [ "${SKIP_MIGRATIONS:-false}" = "true" ]; then
  echo "[api-server] SKIP_MIGRATIONS=true — skipping knex migrate:latest"
else
  echo "[api-server] Running knex migrate:latest..."
  npx knex migrate:latest --knexfile knexfile.js
  echo "[api-server] Migrations complete."
fi

# Run seeds only when explicitly requested (e.g. fresh dev DB)
if [ "${RUN_SEEDS:-false}" = "true" ]; then
  echo "[api-server] RUN_SEEDS=true — running knex seed:run"
  npx knex seed:run --knexfile knexfile.js
fi

echo "[api-server] Starting Express on port ${PORT:-4000}..."
exec node src/index.js
