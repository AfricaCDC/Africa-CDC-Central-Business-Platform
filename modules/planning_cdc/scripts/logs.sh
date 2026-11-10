#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RBM Platform — Log viewer
# Wrapper around `docker compose logs` with service name aliasing.
#
# Usage:
#   ./scripts/logs.sh                       # tail all (prod compose)
#   ./scripts/logs.sh -f                    # follow all
#   ./scripts/logs.sh -s api                # only api-server
#   ./scripts/logs.sh -s web --dev          # web-app dev container
#   ./scripts/logs.sh -l error -f           # all, filter for "error"
#   ./scripts/logs.sh --staging -s gateway  # staging api-gateway
# ─────────────────────────────────────────────────────────────
set -uo pipefail

. "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

cd "$REPO_ROOT"

SERVICES=""
LEVEL=""
FOLLOW=""
LINES="200"
SINCE=""
COMPOSE="-f docker-compose.yml"

while [ $# -gt 0 ]; do
  case "$1" in
    -s|--service) SERVICES="$2"; shift 2 ;;
    -l|--level)   LEVEL="$2"; shift 2 ;;
    -f|--follow)  FOLLOW="--follow"; shift ;;
    -n|--lines)   LINES="$2"; shift 2 ;;
    --since)      SINCE="--since $2"; shift 2 ;;
    --staging)    COMPOSE="-f docker-compose.yml -f docker-compose.staging.yml"; shift ;;
    --dev)        COMPOSE="-f docker-compose.dev.yml"; shift ;;
    --all)        shift ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# //'
      exit 0
      ;;
    *) fail "Unknown option: $1"; exit 1 ;;
  esac
done

resolve_service() {
  case "$1" in
    api|backend) echo "api-server" ;;
    web|frontend) echo "web-app" ;;
    gateway|nginx) echo "api-gateway" ;;
    proxy) echo "nginx-proxy" ;;
    notify|notifications) echo "notification-service" ;;
    sync) echo "sync-service" ;;
    db|mysql) echo "db" ;;
    cache|redis) echo "cache" ;;
    *) echo "$1" ;;
  esac
}

CMD="docker compose $COMPOSE logs --tail=$LINES $FOLLOW $SINCE"

if [ -n "$SERVICES" ]; then
  SVC=$(resolve_service "$SERVICES")
  CMD="$CMD $SVC"
fi

if [ -n "$LEVEL" ]; then
  eval "$CMD" 2>&1 | grep -i --color=always -E "\"level\":\"$LEVEL\"|$LEVEL"
else
  eval "$CMD"
fi
