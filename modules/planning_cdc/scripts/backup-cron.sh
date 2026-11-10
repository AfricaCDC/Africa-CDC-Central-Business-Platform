#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RBM Platform — unattended backup wrapper (cron + deploy)
#
# backup-db.sh needs DB_CONTAINER + credentials; this wrapper
# resolves the running DB container (dev or staging name), loads
# DB_USER / DB_PASSWORD / DB_NAME from the repo .env, then
# delegates. Used by scripts/deploy-staging.sh (pre-migration
# snapshot, D-20260715-02) and by the server crontab:
#
#   0 2 * * * bash /home/complaint/planning/scripts/backup-cron.sh >> /home/complaint/planning/backups/cron.log 2>&1
# ─────────────────────────────────────────────────────────────
set -euo pipefail
# Dumps hold every record of the platform: owner-only files (D-20261108-02).
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ -z "${DB_CONTAINER:-}" ]; then
  DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E '^rbm(-staging)?-db$' | head -1 || true)"
fi
if [ -z "$DB_CONTAINER" ]; then
  echo "[backup-cron] ERROR: no running DB container (rbm-db / rbm-staging-db)" >&2
  exit 1
fi
export DB_CONTAINER

# .env lines may be indented on the server — match with leading whitespace.
for var in DB_USER DB_PASSWORD DB_NAME; do
  val="$(grep -E "^[[:space:]]*${var}=" .env 2>/dev/null | tail -1 | cut -d= -f2- | sed "s/^['\"]//; s/['\"]\$//" || true)"
  if [ -n "$val" ]; then
    export "$var=$val"
  fi
done

exec bash "$SCRIPT_DIR/backup-db.sh"
