#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RBM Platform — MySQL backup
# Dumps the configured DB to ./backups/rbm_backup_<ts>.sql.gz
# Enforces a 35-day retention window. Logs to backups/backup.log.
#
# Usage:
#   ./scripts/backup-db.sh                       # docker container default
#   ./scripts/backup-db.sh --local               # mysqldump on the host
#
# Environment overrides:
#   DB_CONTAINER  (default rbm-db)
#   DB_HOST       (default 127.0.0.1)
#   DB_PORT       (default 3306)
#   DB_USER       (default rbm_user)
#   DB_PASSWORD   (default rbm_pass)
#   DB_NAME       (default rbm_platform)
#   RETENTION_DAYS (default 35)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

. "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

cd "$REPO_ROOT"

MODE="docker"
case "${1:-}" in
  --local) MODE="local" ;;
esac

DB_CONTAINER="${DB_CONTAINER:-rbm-db}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-rbm_user}"
DB_PASSWORD="${DB_PASSWORD:-rbm_pass}"
DB_NAME="${DB_NAME:-rbm_platform}"
RETENTION_DAYS="${RETENTION_DAYS:-35}"

BACKUP_DIR="$REPO_ROOT/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/rbm_backup_${TIMESTAMP}.sql.gz"
LOG_FILE="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

title "RBM DB Backup"
log "INFO  Mode=$MODE  DB=$DB_NAME  Target=$BACKUP_FILE"

if [ "$MODE" = "docker" ]; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    log "ERROR Container '${DB_CONTAINER}' is not running"
    exit 1
  fi
  if MYSQL_PWD="$DB_PASSWORD" docker exec -i \
       -e MYSQL_PWD="$DB_PASSWORD" \
       "$DB_CONTAINER" \
       mysqldump \
         -u "$DB_USER" \
         --single-transaction \
         --routines --triggers --events \
         --default-character-set=utf8mb4 \
         "$DB_NAME" \
       | gzip > "$BACKUP_FILE"; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "OK    Backup complete (${SIZE})"
  else
    log "ERROR mysqldump failed"
    rm -f "$BACKUP_FILE"
    exit 1
  fi
else
  if ! command -v mysqldump >/dev/null 2>&1; then
    log "ERROR mysqldump CLI not installed on host (try docker mode without --local)"
    exit 1
  fi
  if MYSQL_PWD="$DB_PASSWORD" mysqldump \
       -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
       --single-transaction \
       --routines --triggers --events \
       --default-character-set=utf8mb4 \
       "$DB_NAME" \
     | gzip > "$BACKUP_FILE"; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "OK    Backup complete (${SIZE})"
  else
    log "ERROR mysqldump failed"
    rm -f "$BACKUP_FILE"
    exit 1
  fi
fi

# Retention cleanup
log "INFO  Enforcing ${RETENTION_DAYS}-day retention"
DELETED=0
while IFS= read -r old; do
  rm -f "$old"
  DELETED=$((DELETED + 1))
  log "INFO  Deleted $(basename "$old")"
done < <(find "$BACKUP_DIR" -name 'rbm_backup_*.sql.gz' -type f -mtime +"$RETENTION_DAYS" 2>/dev/null)

TOTAL=$(find "$BACKUP_DIR" -name 'rbm_backup_*.sql.gz' -type f | wc -l)
log "INFO  Removed=${DELETED}  Total backups=${TOTAL}"
log "─────────────────────────────────────────────"
