#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RBM Platform — Gateway Audit
# Per planning_cdc CLAUDE.md, every backend route MUST be present
# in three places:
#   1. services/api-server/src/routes/index.js (router.use mounts)
#   2. services/api-gateway/nginx.conf (location blocks)
#   3. services/web-app/vite.config.js (proxy keys, for dev)
#
# This script greps each source and prints any prefix mismatches.
# Exits 0 if every router.use prefix is reachable through both
# nginx and vite. Exits 1 with a report otherwise.
# ─────────────────────────────────────────────────────────────
set -uo pipefail

. "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

cd "$REPO_ROOT"

ROUTES_INDEX="services/api-server/src/routes/index.js"
NGINX_CONF="services/api-gateway/nginx.conf"
NGINX_PROD_CONF="services/api-gateway/nginx.prod.conf"
VITE_CONFIG="services/web-app/vite.config.js"

[ -f "$ROUTES_INDEX" ] || { fail "Missing $ROUTES_INDEX"; exit 1; }
[ -f "$NGINX_CONF" ]   || { fail "Missing $NGINX_CONF"; exit 1; }
[ -f "$VITE_CONFIG" ]  || { fail "Missing $VITE_CONFIG"; exit 1; }

title "Gateway Audit"

# Extract router.use prefixes (e.g. router.use('/auth', ...) → /api/auth)
# Skip the catch-all '/' mounts because they aren't unique prefixes.
PREFIXES=$(grep -E "^\s*router\.use\(['\"]" "$ROUTES_INDEX" \
  | sed -E "s/.*router\.use\(['\"]([^'\"]+)['\"].*/\1/" \
  | grep -v '^/$' \
  | sort -u)

if [ -z "$PREFIXES" ]; then
  warn "No router.use mounts detected in $ROUTES_INDEX"
fi

MISMATCH=0

echo
info "Backend route mounts (under /api):"
for p in $PREFIXES; do
  echo "  - /api${p}"
done

echo
info "Nginx coverage check ($NGINX_CONF)"
# /api/ is a catch-all in nginx so any sub-path is implicitly covered.
if grep -qE "location\s+/api/" "$NGINX_CONF"; then
  ok "  /api/ catch-all present in nginx.conf"
else
  fail "  /api/ catch-all MISSING in nginx.conf"
  MISMATCH=$((MISMATCH+1))
fi
if grep -qE "location\s+/api/" "$NGINX_PROD_CONF" 2>/dev/null; then
  ok "  /api/ catch-all present in nginx.prod.conf"
else
  warn "  /api/ catch-all not found in nginx.prod.conf"
fi

echo
info "Vite proxy coverage check ($VITE_CONFIG)"
if grep -qE "['\"]\/api['\"]" "$VITE_CONFIG"; then
  ok "  /api proxy present in vite.config.js"
else
  fail "  /api proxy MISSING in vite.config.js"
  MISMATCH=$((MISMATCH+1))
fi
if grep -qE "['\"]\/uploads['\"]" "$VITE_CONFIG"; then
  ok "  /uploads proxy present in vite.config.js"
else
  warn "  /uploads proxy not found in vite.config.js"
fi

# Sub-prefix uniqueness check inside nginx (sanity)
echo
info "Per-service prefix mounts in nginx.conf"
for prefix in /notifications/ /sync/; do
  if grep -qE "location\s+${prefix}" "$NGINX_CONF"; then
    ok "  ${prefix} present"
  else
    fail "  ${prefix} MISSING"
    MISMATCH=$((MISMATCH+1))
  fi
done

# Vite cross-check on the same sub-prefixes (optional in dev)
echo
info "Sidecar service prefixes in vite.config.js (informational)"
for prefix in /notifications /sync; do
  if grep -qE "['\"]${prefix}['\"]" "$VITE_CONFIG"; then
    ok "  ${prefix} present in vite proxy"
  else
    warn "  ${prefix} not in vite proxy (only matters if web-app calls it directly during dev)"
  fi
done

echo
if [ "$MISMATCH" -eq 0 ]; then
  ok "Gateway audit passed — no critical mismatches"
  exit 0
else
  fail "$MISMATCH mismatch(es) found"
  exit 1
fi
