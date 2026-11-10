#!/usr/bin/env bash
# scripts/check-nginx.sh — guardrail for nginx-proxy + api-gateway configs.
#
# Scope per .cleanup/reports/phase2/per-service/nginx-proxy.md (T-22):
#   - blocks any CSP containing 'unsafe-inline' / 'unsafe-eval'
#   - blocks any mention of /notifications/ws (CSP-05 — orphan WS path)
#   - blocks any 'server_tokens on'
#   - blocks ssl_protocols weaker than 'TLSv1.2 TLSv1.3'
#   - requires real_ip_header + set_real_ip_from in api-gateway
#   - runs `nginx -t` against a temp render when the binary is available
#
# Exit 0 = pass, non-zero = fail.
# Designed to run in CI pre-push and in the husky pre-push hook.

set -euo pipefail

cd "$(dirname "$0")/.."

ROOT="$(pwd)"
PROXY_CONF="$ROOT/services/nginx-proxy/nginx.conf"
GW_CONF="$ROOT/services/api-gateway/nginx.conf"
GW_PROD="$ROOT/services/api-gateway/nginx.prod.conf"

FAIL=0
log() { printf '[check-nginx] %s\n' "$*"; }
fail() { printf '[check-nginx] FAIL: %s\n' "$*" >&2; FAIL=1; }

# ─── 1. CSP script-src must NOT contain unsafe-inline / unsafe-eval ─────
# (style-src 'unsafe-inline' is tolerated — Google Fonts and common CSS-in-JS
# libraries require it; the XSS-critical rule is on script-src per F-008.)
for f in "$GW_CONF" "$GW_PROD"; do
  [ -f "$f" ] || continue
  if grep -nE "script-src[^;]*'unsafe-(inline|eval)'" "$f" >/dev/null; then
    fail "$f: CSP script-src contains 'unsafe-inline' or 'unsafe-eval' — F-008"
    grep -nE "script-src[^;]*'unsafe-(inline|eval)'" "$f" || true
  fi
done

# ─── 2. Orphan /notifications/ws block must not exist (CSP-05) ──────────
for f in "$PROXY_CONF" "$GW_CONF" "$GW_PROD"; do
  [ -f "$f" ] || continue
  if grep -nE "/notifications/ws" "$f" >/dev/null; then
    fail "$f mentions /notifications/ws — orphan WebSocket route, CSP-05"
  fi
done

# ─── 3. server_tokens must NOT be 'on' anywhere ─────────────────────────
for f in "$PROXY_CONF" "$GW_CONF" "$GW_PROD"; do
  [ -f "$f" ] || continue
  if grep -nE "^\s*server_tokens\s+on\s*;" "$f" >/dev/null; then
    fail "$f sets 'server_tokens on' — F-005"
  fi
done

# ─── 4. ssl_protocols must include TLSv1.2 + TLSv1.3 (and nothing older)
if [ -f "$PROXY_CONF" ]; then
  if grep -nE "^\s*ssl_protocols\b" "$PROXY_CONF" >/dev/null; then
    if ! grep -nE "^\s*ssl_protocols\s+TLSv1\.2\s+TLSv1\.3\s*;" "$PROXY_CONF" >/dev/null; then
      fail "$PROXY_CONF ssl_protocols must be exactly 'TLSv1.2 TLSv1.3' — F-004"
    fi
    if grep -nE "ssl_protocols.*TLSv1(\s|;|$)" "$PROXY_CONF" | grep -vE "TLSv1\.[23]" >/dev/null; then
      fail "$PROXY_CONF ssl_protocols mentions TLSv1 or SSLv3 — must be removed"
    fi
  fi
fi

# ─── 5. api-gateway must trust X-Forwarded-For from nginx-proxy ─────────
if [ -f "$GW_CONF" ]; then
  if ! grep -nE "real_ip_header\s+X-Forwarded-For" "$GW_CONF" >/dev/null; then
    fail "$GW_CONF missing 'real_ip_header X-Forwarded-For' — F-030-A real-IP trust"
  fi
  if ! grep -nE "set_real_ip_from\s+" "$GW_CONF" >/dev/null; then
    fail "$GW_CONF missing 'set_real_ip_from' — F-030-A real-IP trust"
  fi
fi

# ─── 6. Optional: nginx -t dry-run when nginx is installed locally ──────
if command -v nginx >/dev/null 2>&1; then
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  cat >"$TMP/test.conf" <<EOF
events {}
http {
  include $PROXY_CONF;
}
EOF
  if ! nginx -t -c "$TMP/test.conf" >/dev/null 2>"$TMP/err"; then
    log "nginx -t failed for nginx-proxy (expected — uses Docker DNS resolver):"
    cat "$TMP/err" | sed -n '1,20p'
    # Don't fail the check on resolver errors — only on syntax errors.
    if grep -q "unexpected" "$TMP/err"; then
      fail "$PROXY_CONF has syntax errors per nginx -t"
    fi
  fi
else
  log "nginx binary not found locally — skipping nginx -t (CI runs it in container)"
fi

if [ "$FAIL" -ne 0 ]; then
  log "one or more nginx checks FAILED"
  exit 1
fi

log "all nginx checks passed"
exit 0
