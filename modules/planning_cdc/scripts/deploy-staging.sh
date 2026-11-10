#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Planning CDC — Smart staging deploy
#
# Rebuilds only the services affected by changes since the last deploy
# ref. Output is deliberately compact: each phase prints one status
# line, long docker output is captured to /tmp and only surfaced on
# failure, and the health-wait phase streams a live spinner so the
# script never LOOKS stuck.
#
# Usage:
#   bash scripts/deploy-staging.sh            # smart, only changed svcs
#   bash scripts/deploy-staging.sh --force    # rebuild everything
#   bash scripts/deploy-staging.sh --skip-pull
#   bash scripts/deploy-staging.sh --verbose  # stream raw docker output
# ─────────────────────────────────────────────────────────────

# Why `set -E +e` + manual error handling instead of `set -eo pipefail`:
# the previous version used `set -eo pipefail` and hit several subtle
# abort bugs — bash `set -e` exempts commands inside `&&`/`||` chains,
# but the rules have edge cases (functions, subshells, nested pipes)
# that caused silent exits at phase 2 for no good reason. We switched
# to explicit `|| { err …; exit 1; }` on the commands that must not
# fail, and left the rest alone.
set +e
set -o pipefail

# Post-mortem trap: print the line number + exit code whenever the
# script exits non-zero so the next silent death is visible.
trap 'rc=$?; if [ $rc -ne 0 ]; then printf "\n[DEPLOY ABORT] exit=%s\n" "$rc" >&2; fi' EXIT

# ── Colors (respect NO_COLOR) ───────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
  RED='\033[0;31m';   DIM='\033[2m';       BOLD='\033[1m'
  NC='\033[0m'
else
  GREEN=''; YELLOW=''; CYAN=''; RED=''; DIM=''; BOLD=''; NC=''
fi

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.staging.yml"
DEPLOY_REF_FILE=".last-deploy-ref"
ALL_SERVICES="api-server web-app api-gateway nginx-proxy notification-service sync-service"
LOG_DIR="/tmp/planning-deploy"
mkdir -p "$LOG_DIR"
BUILD_LOG="$LOG_DIR/build-$(date +%Y%m%d-%H%M%S).log"
UP_LOG="$LOG_DIR/up-$(date +%Y%m%d-%H%M%S).log"

FORCE_ALL=0
VERBOSE=0

# ── Parse args ──────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --all|--force)   FORCE_ALL=1 ;;
    --skip-pull)     SKIP_PULL=1 ;;
    --no-migrate)    NO_MIGRATE=1 ;;
    --verbose|-v)    VERBOSE=1 ;;
    -h|--help)
      cat <<EOF
Usage: bash scripts/deploy-staging.sh [options]

Options:
  --all, --force   Force rebuild of every service
  --skip-pull      Skip 'git pull' (deploy local changes only)
  --no-migrate     Skip the post-deploy migration check
  --verbose, -v    Stream raw docker build output instead of summary
  -h, --help       Show this help
EOF
      exit 0
      ;;
  esac
done

# ── Small helpers ───────────────────────────────────────────
START_TS=$(date +%s)
phase_start_ts=0

phase() {
  phase_start_ts=$(date +%s)
  printf "\n${CYAN}${BOLD}%s${NC} %s\n" "$1" "$2"
}

phase_done() {
  local elapsed=$(( $(date +%s) - phase_start_ts ))
  printf "${DIM}      done in %ds${NC}\n" "$elapsed"
}

# NOTE: %b (not %s) so printf interprets backslash escapes in the
# caller's argument — i.e. so `info "${BOLD}foo${NC}"` actually bolds
# the text instead of printing raw `\033[1mfoo\033[0m`. Any ANSI codes
# embedded by the caller need %b; the constants are defined as single-
# quoted `\033[...m` strings which must be expanded by printf at output
# time, not when the variable is assigned.
info()  { printf "      %b\n" "$1"; }
warn()  { printf "      ${YELLOW}%b${NC}\n" "$1"; }
err()   { printf "      ${RED}✗ %b${NC}\n" "$1"; }
ok()    { printf "      ${GREEN}✓ %b${NC}\n" "$1"; }

# Run a command, stream its output to a logfile, display a tiny live
# spinner. On failure, dump the tail of the logfile so the operator can
# diagnose without having to cat it themselves.
run_quiet() {
  local label="$1"; shift
  local logfile="$1"; shift
  if [ "$VERBOSE" = "1" ]; then
    "$@" 2>&1 | tee "$logfile"
    return ${PIPESTATUS[0]}
  fi
  "$@" > "$logfile" 2>&1 &
  local pid=$!
  local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    i=$(( (i + 1) % ${#spin} ))
    printf "\r      ${DIM}%s${NC} %s " "${spin:$i:1}" "$label"
    sleep 0.15
  done
  wait "$pid"; local rc=$?
  printf "\r      %-$((${#label} + 4))s\r" " "  # clear the line
  if [ $rc -ne 0 ]; then
    err "$label failed (rc=$rc) — last 30 lines of $logfile:"
    tail -30 "$logfile" | sed 's/^/        /'
    return $rc
  fi
  return 0
}

# ── Banner ──────────────────────────────────────────────────
printf "\n${CYAN}═══════════════════════════════════════════${NC}\n"
printf "${CYAN}${BOLD}  Planning CDC — Staging Deploy${NC}\n"
printf "${CYAN}═══════════════════════════════════════════${NC}\n"

# ── Sanity: must run from repo root ─────────────────────────
if [ ! -f "docker-compose.yml" ] || [ ! -f "docker-compose.staging.yml" ]; then
  err "This script must run from the planning_cdc repo root."
  exit 1
fi

# ── 1. Pull latest code ─────────────────────────────────────
phase "[1/6]" "Pulling latest code"
if [ "${SKIP_PULL:-0}" = "1" ]; then
  info "skipped (--skip-pull)"
else
  REMOTE="origin"
  if git remote | grep -q '^azure$'; then REMOTE="azure"; fi
  if ! git pull "$REMOTE" main --ff-only > "$LOG_DIR/pull.log" 2>&1; then
    err "git pull failed — see $LOG_DIR/pull.log"
    tail -20 "$LOG_DIR/pull.log" | sed 's/^/        /'
    exit 1
  fi
  HEAD_SHORT=$(git rev-parse --short HEAD)
  if grep -q 'Already up to date' "$LOG_DIR/pull.log"; then
    info "already up to date ($HEAD_SHORT)"
  else
    ok "pulled to $HEAD_SHORT"
    grep -E '^\s*[0-9a-f]{7,}\.\.' "$LOG_DIR/pull.log" | head -1 | sed 's/^/      /' || true
  fi
fi
phase_done

# ── 2. Detect changed files since last deploy ───────────────
phase "[2/6]" "Detecting changed services"

if [ "$FORCE_ALL" = "1" ]; then
  warn "force-all mode — rebuilding every service"
  CHANGED=""
  SERVICES="$ALL_SERVICES"
elif [ -f "$DEPLOY_REF_FILE" ]; then
  LAST_REF=$(cat "$DEPLOY_REF_FILE")
  CHANGED=$(git diff --name-only "$LAST_REF"..HEAD 2>/dev/null || echo "")
  if [ -z "$CHANGED" ]; then
    info "no changes since last deploy (${LAST_REF:0:7})"
    info "use --force to rebuild anyway"
    git rev-parse HEAD > "$DEPLOY_REF_FILE"
    phase_done
    printf "\n${GREEN}═══════════════════════════════════════════${NC}\n"
    printf "${GREEN}${BOLD}  ✓ Nothing to deploy${NC}\n"
    printf "${GREEN}═══════════════════════════════════════════${NC}\n\n"
    exit 0
  fi
else
  warn "no previous deploy ref — rebuilding every service"
  CHANGED=""
  SERVICES="$ALL_SERVICES"
fi

if [ -n "$CHANGED" ] && [ "$FORCE_ALL" != "1" ]; then
  CHANGE_COUNT=$(echo "$CHANGED" | wc -l)
  info "$CHANGE_COUNT file(s) changed since ${LAST_REF:0:7}:"
  echo "$CHANGED" | head -6 | sed 's/^/        • /'
  if [ "$CHANGE_COUNT" -gt 6 ]; then
    printf "        ${DIM}… and %d more${NC}\n" $(( CHANGE_COUNT - 6 ))
  fi

  SERVICES=""
  # IMPORTANT: this helper MUST return 0 unconditionally. Under
  # `set -eo pipefail`, a function whose last expression evaluates to
  # false (which happens on the second mention of the same service,
  # because `[[ ... != ... ]]` short-circuits the `&&`) would abort the
  # whole script silently right after phase 2. Been there.
  needs() {
    local svc="$1"
    if [[ " $SERVICES " != *" $svc "* ]]; then
      SERVICES="$SERVICES $svc"
    fi
    return 0
  }

  # nginx-proxy / api-gateway changes — rebuild both, they're coupled
  if echo "$CHANGED" | grep -qE "services/(api-gateway|nginx-proxy)/|nginx\.conf|proxy_params"; then
    needs "api-gateway"
    needs "nginx-proxy"
  fi

  while IFS= read -r file; do
    # `[ -z "$file" ] && continue` used to sit here and it silently
    # killed the script under `set -eo pipefail` the moment a non-empty
    # file landed: the failing `[ -z ]` test returned 1, the `&&`
    # short-circuited, and the whole statement's exit status was 1 —
    # which set -e caught as fatal. Always write this as an `if`.
    if [ -z "$file" ]; then
      continue
    fi
    case "$file" in
      services/api-server/*)           needs "api-server" ;;
      services/web-app/*)              needs "web-app" ;;
      services/api-gateway/*)          needs "api-gateway"; needs "nginx-proxy" ;;
      services/nginx-proxy/*)          needs "nginx-proxy" ;;
      services/notification-service/*) needs "notification-service" ;;
      services/sync-service/*)         needs "sync-service" ;;
      packages/lib/*|packages/schemas/*|packages/ui/*)
        needs "api-server"; needs "web-app"
        needs "notification-service"; needs "sync-service"
        ;;
      docker-compose*.yml)
        warn "compose changed — rebuilding all services"
        SERVICES="$ALL_SERVICES"; break ;;
      .dockerignore|Makefile)
        warn "$file changed — rebuilding all services"
        SERVICES="$ALL_SERVICES"; break ;;
    esac
  done <<< "$CHANGED"

  SERVICES="${SERVICES# }"

  if [ -z "$SERVICES" ]; then
    info "no service-affecting changes"
    git rev-parse HEAD > "$DEPLOY_REF_FILE"
    phase_done
    printf "\n${GREEN}═══════════════════════════════════════════${NC}\n"
    printf "${GREEN}${BOLD}  ✓ Docs / configs only — nothing to rebuild${NC}\n"
    printf "${GREEN}═══════════════════════════════════════════${NC}\n\n"
    exit 0
  fi
fi

info "services to rebuild: ${BOLD}${SERVICES// /, }${NC}"
phase_done

# ── 3. Build images ─────────────────────────────────────────
phase "[3/6]" "Building images"
# shellcheck disable=SC2086
if ! run_quiet "docker build ($SERVICES)" "$BUILD_LOG" \
    $COMPOSE build --progress=plain $SERVICES; then
  exit 1
fi
# Count how many layers came from cache so the user sees SOMETHING useful
CACHED=$(grep -c ' CACHED$' "$BUILD_LOG" 2>/dev/null || echo 0)
BUILT=$(grep -cE ' DONE [0-9.]+s$' "$BUILD_LOG" 2>/dev/null || echo 0)
ok "built ($CACHED cached, $BUILT fresh layers)"
phase_done

# ── 4. Pre-migration DB backup ──────────────────────────────
# api-server runs `knex migrate:latest` at boot (entrypoint.sh) and the
# repo carries irreversible data migrations (merges, transfers, imports
# with no-op down()) — never recreate it without a restorable snapshot.
# A failed backup ABORTS the deploy: containers stay untouched.
if [[ " $SERVICES " == *" api-server "* ]]; then
  phase "[4/6]" "DB backup before migrations"
  if ! run_quiet "mysqldump snapshot" "$LOG_DIR/backup.log" \
      bash scripts/backup-cron.sh; then
    err "DB backup failed — deploy aborted before touching containers"
    err "restore path: scripts/restore-db.sh (see docs/RUNBOOK.md)"
    exit 1
  fi
  LATEST_BACKUP=$(ls -t backups/rbm_backup_*.sql.gz 2>/dev/null | head -1)
  ok "snapshot ready: ${LATEST_BACKUP:-backups/}"
  phase_done
fi

# ── 5. Recreate containers ──────────────────────────────────
phase "[5/6]" "Recreating containers"
# shellcheck disable=SC2086
if ! run_quiet "docker up ($SERVICES)" "$UP_LOG" \
    $COMPOSE up -d --force-recreate $SERVICES; then
  exit 1
fi

# Always recreate api-gateway + nginx-proxy so nginx re-resolves
# upstream container IPs (avoids stale-IP 502s after a rebuild).
if [[ " $SERVICES " != *" api-gateway "* ]] || [[ " $SERVICES " != *" nginx-proxy "* ]]; then
  info "refreshing gateway + proxy DNS"
  run_quiet "refresh gateway" "$UP_LOG.gateway" \
    $COMPOSE up -d --force-recreate api-gateway nginx-proxy
fi

for svc in $SERVICES; do
  ok "$svc recreated"
done
phase_done

git rev-parse HEAD > "$DEPLOY_REF_FILE"

# ── 5. Wait for health + smoke test ─────────────────────────
phase "[6/6]" "Waiting for services to become healthy"

SMOKE_URL="http://127.0.0.1/api/health"
SMOKE_FALLBACK="http://127.0.0.1/healthz"
DEADLINE=$(( $(date +%s) + 60 ))
HEALTHY=0
spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
i=0
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if curl -fsS -m 2 "$SMOKE_URL" > /dev/null 2>&1 \
     || curl -fsS -m 2 "$SMOKE_FALLBACK" > /dev/null 2>&1; then
    HEALTHY=1
    printf "\r      %-60s\r" " "
    ok "API responding"
    break
  fi
  i=$(( (i + 1) % ${#spin} ))
  printf "\r      ${DIM}%s polling %s${NC}  " "${spin:$i:1}" "$SMOKE_URL"
  sleep 1
done
if [ "$HEALTHY" -ne 1 ]; then
  printf "\r      %-60s\r" " "
  warn "API did not respond to /api/health within 60s — check 'docker logs rbm-staging-api-server'"
fi

# One-line container status table, scoped to the services we touched.
# shellcheck disable=SC2086
$COMPOSE ps --format 'table {{.Name}}\t{{.Status}}' $SERVICES 2>&1 \
  | sed 's/^/      /' \
  | head -15

phase_done

# ── 6. DB migration warning (only if migrations actually changed) ──
if [ -n "$CHANGED" ] && [ "${NO_MIGRATE:-0}" != "1" ]; then
  DB_CHANGED=$(echo "$CHANGED" | grep -E "db/migrations/|knexfile\.js|init-db\.sql" || true)
  if [ -n "$DB_CHANGED" ]; then
    printf "\n${YELLOW}${BOLD}  ⚠  DB schema files changed${NC}\n"
    echo "$DB_CHANGED" | sed 's/^/      • /'
    info "api-server runs migrate:latest on boot — verify with:"
    printf "        ${DIM}docker logs rbm-staging-api-server | grep -i migrate${NC}\n"
  fi
fi

# ── Footer ──────────────────────────────────────────────────
TOTAL=$(( $(date +%s) - START_TS ))
printf "\n${GREEN}═══════════════════════════════════════════${NC}\n"
printf "${GREEN}${BOLD}  ✓ Deploy complete in %ds${NC}\n" "$TOTAL"
printf "${GREEN}═══════════════════════════════════════════${NC}\n"
printf "  ref:      ${BOLD}%s${NC}\n" "$(cat "$DEPLOY_REF_FILE" | cut -c1-12)"
printf "  services: %s\n" "${SERVICES// /, }"
printf "  logs:     ${DIM}%s${NC}\n" "$LOG_DIR"
printf "\n"
