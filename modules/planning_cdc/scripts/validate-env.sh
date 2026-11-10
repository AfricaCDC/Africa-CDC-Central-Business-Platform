#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RBM Platform — Validate environment file
# Loads an .env file and verifies that every required variable
# is present, non-empty, and not still set to a placeholder.
#
# Usage:
#   ./scripts/validate-env.sh                  # defaults to .env
#   ./scripts/validate-env.sh .env.production
# ─────────────────────────────────────────────────────────────
set -uo pipefail

. "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  fail "$ENV_FILE not found"
  echo "Create it from .env.example: cp .env.example $ENV_FILE"
  exit 1
fi

title "Validating $ENV_FILE"

# Load env file safely (allexport)
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

ERRORS=0
WARNINGS=0

is_placeholder() {
  case "$1" in
    *CHANGE_ME*|*change_me*|*your_secret_here*|*replace_me*|*REPLACE_ME*|*xxx*|*XXXXX*|*TODO*|*todo*)
      return 0 ;;
  esac
  return 1
}

require() {
  local var="$1"
  local min_len="${2:-1}"
  local val
  val=$(eval "echo \"\${$var:-}\"")
  if [ -z "$val" ]; then
    fail "MISSING   $var"
    ERRORS=$((ERRORS+1))
  elif is_placeholder "$val"; then
    fail "PLACEHOLDER $var = $val"
    ERRORS=$((ERRORS+1))
  elif [ "${#val}" -lt "$min_len" ]; then
    warn "TOO SHORT $var (min ${min_len} chars, got ${#val})"
    WARNINGS=$((WARNINGS+1))
  else
    ok "$var"
  fi
}

warn_optional() {
  local var="$1"
  local val
  val=$(eval "echo \"\${$var:-}\"")
  if [ -z "$val" ]; then
    warn "OPTIONAL  $var (not set)"
    WARNINGS=$((WARNINGS+1))
  elif is_placeholder "$val"; then
    warn "PLACEHOLDER $var = $val"
    WARNINGS=$((WARNINGS+1))
  else
    ok "$var"
  fi
}

echo
info "── Database (MySQL) ──"
require NODE_ENV
require DB_HOST
require DB_PORT
require DB_USER
require DB_PASSWORD 8
require DB_NAME
require DB_ROOT_PASSWORD 8

echo
info "── Authentication ──"
require JWT_ACCESS_SECRET 32
require JWT_REFRESH_SECRET 32
require JWT_ACCESS_TTL
require JWT_REFRESH_TTL

echo
info "── Cache ──"
require REDIS_URL

echo
info "── Network ──"
require CORS_ORIGINS
require GATEWAY_HTTP_PORT
require APP_URL

echo
info "── Service URLs ──"
warn_optional NOTIFICATION_SERVICE_PORT
warn_optional SYNC_SERVICE_PORT

echo
info "── Email (optional) ──"
warn_optional SMTP_HOST
warn_optional SMTP_PORT
warn_optional SMTP_USER
warn_optional SMTP_PASS

echo
info "── Runtime ──"
require LOG_LEVEL

echo
if [ "$ERRORS" -gt 0 ]; then
  fail "$ERRORS error(s) — fix before deploying"
  if [ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ]; then
    exit 1
  else
    warn "NODE_ENV=${NODE_ENV:-?} — exiting non-zero is enforced only for production/staging"
    exit 1
  fi
elif [ "$WARNINGS" -gt 0 ]; then
  warn "$WARNINGS warning(s) — review before deploying"
  exit 0
else
  ok "All required variables present"
  exit 0
fi
