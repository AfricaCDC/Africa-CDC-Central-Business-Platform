#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RBM Platform — MySQL restore
# Drops + recreates the configured DB and restores from a
# .sql.gz backup. Asks for the literal string 'RESTORE' to
# proceed unless --yes is passed.
#
# Usage:
#   ./scripts/restore-db.sh backups/rbm_backup_20260406_010000.sql.gz
#   ./scripts/restore-db.sh --yes <file>
# ─────────────────────────────────────────────────────────────
set -euo pipefail

. "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

cd "$REPO_ROOT"

DB_CONTAINER="${DB_CONTAINER:-rbm-db}"
DB_USER="${DB_USER:-rbm_user}"
DB_PASSWORD="${DB_PASSWORD:-rbm_pass}"
DB_NAME="${DB_NAME:-rbm_platform}"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-rootpass}"

SKIP_CONFIRM=false
BACKUP_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) SKIP_CONFIRM=true; shift ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# //'
      exit 0
      ;;
    *) BACKUP_FILE="$1"; shift ;;
  esac
done

if [ -z "$BACKUP_FILE" ]; then
  fail "Usage: $0 [--yes] <backup-file.sql.gz>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  fail "Backup file not found: $BACKUP_FILE"
  exit 1
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

title "RBM Database Restore"
echo "  Backup file : $BACKUP_FILE ($SIZE)"
echo "  Target DB   : $DB_NAME"
echo "  Container   : $DB_CONTAINER"
warn "This will DROP and RECREATE $DB_NAME. All data will be destroyed."
echo

if [ "$SKIP_CONFIRM" = false ]; then
  printf "Type 'RESTORE' to proceed: "
  read -r CONFIRM
  if [ "$CONFIRM" != "RESTORE" ]; then
    echo "Aborted."
    exit 0
  fi
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  fail "Container '${DB_CONTAINER}' is not running"
  exit 1
fi

info "Dropping and recreating database $DB_NAME"
docker exec -e MYSQL_PWD="$DB_ROOT_PASSWORD" "$DB_CONTAINER" \
  mysql -u root -e "
    DROP DATABASE IF EXISTS \`$DB_NAME\`;
    CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%';
    FLUSH PRIVILEGES;
  "

info "Restoring data from $BACKUP_FILE"
gunzip -c "$BACKUP_FILE" | docker exec -i -e MYSQL_PWD="$DB_PASSWORD" "$DB_CONTAINER" \
  mysql -u "$DB_USER" "$DB_NAME"

ok "Restore complete: $DB_NAME"
info "If schema is older than current code, run: bash scripts/migrate-all.sh"
