#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RBM Platform — Health Check
# Pings every service /health endpoint and the infrastructure
# (MySQL + Redis). Exits non-zero if any check fails.
#
# Usage:
#   ./scripts/health-check.sh           # local dev (services on localhost)
#   ./scripts/health-check.sh --docker  # production compose containers
#   ./scripts/health-check.sh --dev     # dev compose containers
# ─────────────────────────────────────────────────────────────
set -uo pipefail

. "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

MODE="local"
case "${1:-}" in
  --docker)  MODE="docker"  ;;
  --dev)     MODE="dev"     ;;
  --staging) MODE="staging" ;;
  -h|--help)
    grep -E '^# ' "$0" | sed 's/^# //'
    exit 0
    ;;
esac

FAILED=0

check_http() {
  local name="$1"
  local url="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 5 "$url" 2>/dev/null || echo "000")
  if [ "$code" = "200" ] || [ "$code" = "204" ]; then
    ok "$name ($url)"
  else
    fail "$name — HTTP $code ($url)"
    FAILED=$((FAILED+1))
  fi
}

check_tcp() {
  local name="$1"
  local host="$2"
  local port="$3"
  if command -v nc >/dev/null 2>&1; then
    if nc -z -w3 "$host" "$port" 2>/dev/null; then
      ok "$name ($host:$port)"
      return
    fi
  else
    # Fallback using bash /dev/tcp
    if (echo > "/dev/tcp/$host/$port") >/dev/null 2>&1; then
      ok "$name ($host:$port)"
      return
    fi
  fi
  fail "$name — not reachable ($host:$port)"
  FAILED=$((FAILED+1))
}

check_mysql_ping() {
  local container="$1"
  local user="${2:-root}"
  local password="${3:-rootpass}"
  if docker exec "$container" mysqladmin ping -h localhost -u"$user" -p"$password" --silent >/dev/null 2>&1; then
    ok "MySQL ($container)"
  else
    fail "MySQL — ping failed ($container)"
    FAILED=$((FAILED+1))
  fi
}

check_redis_ping() {
  local container="$1"
  if docker exec "$container" redis-cli ping 2>/dev/null | grep -q PONG; then
    ok "Redis ($container)"
  else
    fail "Redis — ping failed ($container)"
    FAILED=$((FAILED+1))
  fi
}

title "RBM Platform Health Check ($MODE)"

case "$MODE" in
  local)
    info "Infrastructure"
    check_tcp "MySQL" "localhost" "3306"
    check_tcp "Redis" "localhost" "6379"
    echo
    info "Services"
    check_http "api-server"           "http://localhost:4000/api/health"
    check_http "notification-service" "http://localhost:3005/health"
    check_http "sync-service"         "http://localhost:3006/health"
    check_http "web-app"              "http://localhost:5000"
    ;;
  dev)
    info "Infrastructure (dev compose)"
    check_mysql_ping "${RBM_DB_DEV_CONTAINER}" "root" "${DB_ROOT_PASSWORD:-root}"
    check_redis_ping "rbm-cache-dev"
    echo
    info "Services (dev compose)"
    check_http "api-server"           "http://localhost:4000/api/health"
    check_http "notification-service" "http://localhost:3005/health"
    check_http "sync-service"         "http://localhost:3006/health"
    check_http "web-app"              "http://localhost:5000"
    check_http "api-gateway"          "http://localhost:8080/health"
    ;;
  docker|staging)
    info "Infrastructure"
    check_mysql_ping "${RBM_DB_CONTAINER}" "root" "${DB_ROOT_PASSWORD:-rootpass}"
    check_redis_ping "rbm-cache"
    echo
    info "Services (probed via container exec)"
    for svc in api-server notification-service sync-service web-app api-gateway; do
      container="rbm-${svc}"
      [ "$MODE" = "staging" ] && container="rbm-staging-${svc}"
      status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")
      case "$status" in
        healthy)            ok   "$svc ($container) — healthy" ;;
        starting)           warn "$svc ($container) — starting" ;;
        unhealthy|missing)  fail "$svc ($container) — $status"; FAILED=$((FAILED+1)) ;;
        *)                  warn "$svc ($container) — $status" ;;
      esac
    done
    ;;
esac

echo
if [ "$FAILED" -eq 0 ]; then
  ok "All checks passed"
  exit 0
else
  fail "$FAILED check(s) failed"
  exit 1
fi
