#!/usr/bin/env bash
# scripts/check-forbidden.sh — repo-wide forbidden-pattern scanner.
#
# Enforces patterns P-01..P-31 from .cleanup/reports/phase2/guardrails-plan.md
# plus the obsolete-identifier registry from docs/OBSOLETE.md.
#
# Modes:
#   --staged         scan only files staged in git index (for pre-commit)
#   --all            scan every tracked file (default)
#   --files a.js b.js  scan only the given files
#
# Exit codes:
#   0 — clean
#   1 — one or more violations
#   2 — internal script error
#
# Allowlist: scripts/forbidden.allowlist.json (per-rule path globs with reasons).

set -u
set -o pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" || { echo "[P] cannot cd to repo root" >&2; exit 2; }

ALLOWLIST_FILE="scripts/forbidden.allowlist.json"
OBSOLETE_FILE="docs/OBSOLETE.md"

# Without jq the allowlist is unreadable and every allowlisted path turns
# into a false positive — fail loudly instead of flooding the report.
if [ -f "$ALLOWLIST_FILE" ] && ! command -v jq >/dev/null 2>&1; then
  echo "[P] jq is required to read $ALLOWLIST_FILE — install jq (e.g. winget install jqlang.jq) and retry." >&2
  exit 2
fi

MODE="all"
FILES=()
if [ $# -gt 0 ]; then
  case "$1" in
    --staged) MODE="staged"; shift;;
    --all)    MODE="all"; shift;;
    --files)  MODE="files"; shift; FILES=("$@"); shift $#;;
    *)        MODE="files"; FILES=("$@"); shift $#;;
  esac
fi

# ── Helpers ───────────────────────────────────────────────────────────
collect_files() {
  case "$MODE" in
    staged) git diff --cached --name-only --diff-filter=ACMR ;;
    files)  printf '%s\n' "${FILES[@]}" ;;
    all)    git ls-files ;;
  esac | sed '/^$/d'
}

# Check whether a path matches any glob in the allowlist for a given rule id.
# Requires: jq, bash glob (extglob) support.
shopt -s extglob globstar nullglob

is_allowed() {
  local rule="$1" path="$2"
  [ ! -f "$ALLOWLIST_FILE" ] && return 1
  local patterns
  # tr -d '\r': Windows jq builds emit CRLF; a trailing \r in a glob makes
  # every allowlist entry silently fail to match (false-positive storm).
  patterns=$(jq -r ".allowlist[\"$rule\"].paths[]? // empty" "$ALLOWLIST_FILE" 2>/dev/null | tr -d '\r') || return 1
  while IFS= read -r glob; do
    [ -z "$glob" ] && continue
    # shell glob match — expand ** to any depth
    case "$path" in
      $glob) return 0 ;;
    esac
  done <<<"$patterns"
  return 1
}

FAIL=0
REPORT=$(mktemp)
trap 'rm -f "$REPORT"' EXIT

fail() {
  local rule="$1"; shift
  local msg="$1"; shift
  local hits="$1"; shift || true
  {
    echo ""
    echo "❌ $rule  $msg"
    if [ -n "${hits:-}" ]; then
      printf '%s\n' "$hits" | sed 's/^/    /'
    fi
  } >> "$REPORT"
  FAIL=1
}

# Filter grep output: drop lines whose file is allowlisted for the given rule.
filter_allowlist() {
  local rule="$1"
  local filtered=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    local file="${line%%:*}"
    if ! is_allowed "$rule" "$file"; then
      filtered+="$line"$'\n'
    fi
  done
  printf '%s' "$filtered"
}

# Scan only JS/JSX source files under services and packages.
SRC_REGEX='\.(js|jsx|mjs|cjs)$'
NON_SRC_SKIP='(node_modules/|dist/|build/|coverage/|\.cleanup/|\.husky/|\.playwright-mcp/|package-lock\.json)'
TEST_SKIP='(\.test\.|\.spec\.|__fixtures__/|__test_fixtures/|scripts/fixtures/forbidden/|/tests/|__tests__/)'

list_src() {
  collect_files | grep -E "$SRC_REGEX" | grep -vE "$NON_SRC_SKIP" || true
}

list_src_no_tests() {
  # In --files mode, caller is explicitly targeting files (e.g. self-tests on
  # fixtures). In --staged / --all, test+fixture paths are filtered out.
  if [ "$MODE" = "files" ]; then
    list_src
  else
    list_src | grep -vE "$TEST_SKIP" || true
  fi
}

list_all_tracked() {
  collect_files | grep -vE "$NON_SRC_SKIP" || true
}

# Files that don't exist on disk (deletes in staged mode); filter them.
existing_only() {
  while IFS= read -r f; do
    [ -n "$f" ] && [ -f "$f" ] && printf '%s\n' "$f"
  done
}

# ── P-01 no TypeScript files ─────────────────────────────────────────
# In --files mode the caller is explicit (self-tests). In --staged/--all,
# fixture files are intentional and must not trip the rule.
if [ "$MODE" = "files" ]; then
  hits=$(collect_files | grep -E '\.(ts|tsx|mts|cts)$' \
         | grep -vE "$NON_SRC_SKIP" || true)
else
  hits=$(collect_files | grep -E '\.(ts|tsx|mts|cts)$' \
         | grep -vE "$NON_SRC_SKIP" \
         | grep -vE "$TEST_SKIP" || true)
fi
[ -n "$hits" ] && fail "P-01" "TypeScript files forbidden (charter stack: JSX/JS only)" "$hits"

SRC_FILES=$(list_src_no_tests | existing_only)
SRC_AND_TESTS=$(list_src | existing_only)

if [ -n "$SRC_FILES" ]; then
  # ── P-02 hasAnyRole / ROLE_GROUPS / ADMIN_ROLES outside packages/lib ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE '\b(hasAnyRole\(|ROLE_GROUPS\.|ADMIN_ROLES)\b' 2>/dev/null | filter_allowlist "P-02")
  [ -n "$hits" ] && fail "P-02" "hardcoded role-group check — use rbacService.checkPermission" "$hits"

  # ── P-03 inline role string arrays [ 'ADMIN', ... ] ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE "\[\s*['\"](ADMIN|SUPER_ADMIN|FOCAL_PERSON|HEAD_OF_DIVISION|ME_OFFICER|DIRECTOR|SYSTEM|CBP_OFFICER|STAFF|REVIEWER|APPROVER|FINANCE|DIVISION_HEAD|SYSTEM_ADMIN)['\"]" 2>/dev/null | filter_allowlist "P-03")
  [ -n "$hits" ] && fail "P-03" "role literal in array — import from packages/lib/roles.js" "$hits"

  # ── P-04 status literals ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE "['\"](DRAFT|IN_REVIEW|APPROVED|REJECTED|SUBMITTED|VALIDATED|CANCELLED|IN_PROGRESS|COMPLETED|NOT_APPLICABLE)['\"]" 2>/dev/null | filter_allowlist "P-04")
  [ -n "$hits" ] && fail "P-04" "status literal — import STATUSES from packages/lib/enums.js" "$hits"

  # ── P-05 console.* in production code ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE '\bconsole\.(log|error|warn|debug|info)\(' 2>/dev/null | filter_allowlist "P-05")
  [ -n "$hits" ] && fail "P-05" "console.* in source — use structured logger (packages/lib/logger.js)" "$hits"

  # ── P-06 window.confirm / window.alert / confirm( / alert( ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE '\b(window\.)?(confirm|alert|prompt)\(' 2>/dev/null | filter_allowlist "P-06")
  [ -n "$hits" ] && fail "P-06" "window.confirm/alert/prompt — use a modal component" "$hits"

  # ── P-07 key={index} / key={i} / key={idx} in JSX ──
  JSX_FILES=$(printf '%s\n' $SRC_FILES | grep -E '\.jsx$' || true)
  if [ -n "$JSX_FILES" ]; then
    hits=$(printf '%s\n' $JSX_FILES | xargs -r grep -HnE 'key=\{(index|i|idx)\}' 2>/dev/null | filter_allowlist "P-07")
    [ -n "$hits" ] && fail "P-07" "key={index} in JSX — use a stable id" "$hits"
  fi

  # ── P-08 legacy error envelope ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE 'res\.(status\([0-9]+\)\.)?json\(\s*\{\s*error\s*:' 2>/dev/null | filter_allowlist "P-08")
  [ -n "$hits" ] && fail "P-08" "legacy {error:...} envelope — use {success:false, message, code}" "$hits"

  # ── P-09 hardcoded URL in component / page / hook ──
  COMP_FILES=$(printf '%s\n' $SRC_FILES | grep -E 'services/web-app/src/(pages|components|hooks)/' || true)
  if [ -n "$COMP_FILES" ]; then
    hits=$(printf '%s\n' $COMP_FILES | xargs -r grep -HnE "(api|axios)\.(get|post|put|delete|patch)\(\s*['\"][/a-zA-Z]" 2>/dev/null | filter_allowlist "P-09")
    [ -n "$hits" ] && fail "P-09" "URL hardcoded in component/hook — move to src/services/*.api.js" "$hits"
    hits=$(printf '%s\n' $COMP_FILES | xargs -r grep -HnE "fetch\(\s*['\"]https?://" 2>/dev/null | filter_allowlist "P-09")
    [ -n "$hits" ] && fail "P-09" "fetch(http://...) in component — move to src/services/*.api.js" "$hits"
  fi

  # ── P-10 docker hostnames in source ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE 'http://(notification-service|sync-service|api-server|api-gateway|web-app)(:[0-9]+)?' 2>/dev/null | filter_allowlist "P-10")
  [ -n "$hits" ] && fail "P-10" "docker hostname in source — local dev runs natively; use 127.0.0.1 or env var" "$hits"

  # ── P-11 useEffect + fetch/axios/api. (best-effort grep) ──
  # Two-pass: find files with useEffect, then check for fetch/axios/api usage in the same file.
  P11_HITS=""
  for f in $SRC_FILES; do
    grep -q 'useEffect\s*(' "$f" 2>/dev/null || continue
    if grep -qE '(fetch\s*\(|axios\.|api[A-Za-z_]*\.(get|post|put|delete|patch))' "$f" 2>/dev/null; then
      P11_HITS+="$(grep -nE 'useEffect\s*\(' "$f" 2>/dev/null | sed "s|^|$f:|")"$'\n'
    fi
  done
  hits=$(printf '%s' "$P11_HITS" | filter_allowlist "P-11")
  [ -n "$hits" ] && fail "P-11" "useEffect present in a file that also calls fetch/axios/api — likely effect-based fetching; use TanStack Query" "$hits"

  # ── P-13 per-file Knex instantiation ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE "require\(['\"]knex['\"]\)\s*\(" 2>/dev/null | filter_allowlist "P-13")
  [ -n "$hits" ] && fail "P-13" "per-file Knex pool — import from services/*/src/config/db.js" "$hits"

  # ── P-14 legacy JWT_SECRET ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE '\bprocess\.env\.JWT_SECRET\b' 2>/dev/null | filter_allowlist "P-14")
  [ -n "$hits" ] && fail "P-14" "legacy JWT_SECRET — use JWT_ACCESS_SECRET" "$hits"

  # ── P-15 .raw( on Knex outside allow-list (WARN-level; printed but non-blocking) ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE '\b(db|knex)\.raw\(' 2>/dev/null | filter_allowlist "P-15")
  if [ -n "$hits" ]; then
    echo "⚠️  P-15 raw SQL outside allow-list (review required):" >> "$REPORT"
    printf '%s\n' "$hits" | sed 's/^/    /' >> "$REPORT"
  fi

  # ── P-17 JWT in localStorage ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE "localStorage\.(set|get|remove)Item\(\s*['\"](token|jwt|accessToken|refreshToken)" 2>/dev/null | filter_allowlist "P-17")
  [ -n "$hits" ] && fail "P-17" "JWT in localStorage — use httpOnly cookie" "$hits"

  # ── P-18 window.location.href = ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE "window\.location\.href\s*=" 2>/dev/null | filter_allowlist "P-18")
  [ -n "$hits" ] && fail "P-18" "window.location.href — use react-router navigate" "$hits"

  # ── P-24 helmet() in backend services ──
  BACKEND_FILES=$(printf '%s\n' $SRC_FILES | grep -E 'services/(api-server|notification-service|sync-service)/src/.*\.js$' || true)
  if [ -n "$BACKEND_FILES" ]; then
    hits=$(printf '%s\n' $BACKEND_FILES | xargs -r grep -HnE "(require\(['\"]helmet['\"]\)\(\)|app\.use\(\s*helmet\()" 2>/dev/null | filter_allowlist "P-24")
    [ -n "$hits" ] && fail "P-24" "helmet() active — nginx is authoritative for security headers" "$hits"
  fi

  # ── P-25 contentSecurityPolicy: false ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE 'contentSecurityPolicy\s*:\s*false' 2>/dev/null | filter_allowlist "P-25")
  [ -n "$hits" ] && fail "P-25" "helmet CSP disabled — remove helmet entirely (nginx owns CSP)" "$hits"

  # ── P-28 sync status literals ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE "['\"](IDLE|RUNNING|COMPLETED_SYNC|FAILED_SYNC)['\"]" 2>/dev/null | filter_allowlist "P-04")
  [ -n "$hits" ] && fail "P-28" "sync status literal — import from packages/lib/enums.js" "$hits"

  # ── P-29 axios outside cbpService.js allowlist ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE "require\(['\"]axios['\"]\)|from\s+['\"]axios['\"]" 2>/dev/null | filter_allowlist "P-29")
  [ -n "$hits" ] && fail "P-29" "axios outside allow-list — use fetch" "$hits"

  # ── P-30 React.FC ──
  hits=$(printf '%s\n' $SRC_FILES | xargs -r grep -HnE '\bReact\.FC\b' 2>/dev/null | filter_allowlist "P-30")
  [ -n "$hits" ] && fail "P-30" "React.FC — stack is JSX without type annotations" "$hits"

  # ── P-31 entity-type magic strings ──
  # Scan only files that DON'T import from @rbm/lib/enums or packages/lib/enums.
  ENTITY_TERMS='division|directorate|unit|office|outcome|output|activity|task|specific_activity|indicator|workplan|goal|objective|project|program|plan|portfolio'
  for f in $SRC_FILES; do
    case "$f" in
      services/*/src/*) ;;
      *) continue ;;
    esac
    if is_allowed "P-31" "$f"; then continue; fi
    if grep -qE "from\s+['\"](@rbm/lib/enums|.*packages/lib/enums)['\"]|require\(['\"](@rbm/lib/enums|.*packages/lib/enums)['\"]\)" "$f" 2>/dev/null; then
      continue
    fi
    hits=$(grep -niE "['\"](${ENTITY_TERMS})['\"]" "$f" 2>/dev/null || true)
    if [ -n "$hits" ]; then
      fail "P-31" "entity-type magic string in $f — import ENTITY_TYPES from @rbm/lib/enums" "$hits"
    fi
  done
fi

# ── OBSOLETE registry sweep (env / url / symbol with kind:old blocks) ──
if [ -f "$OBSOLETE_FILE" ] && [ -n "$SRC_AND_TESTS" ]; then
  # Extract simple old: <literal> lines from docs/OBSOLETE.md
  mapfile -t OBSOLETE_TOKENS < <(grep -E '^old:\s*\S' "$OBSOLETE_FILE" \
    | sed -E 's/^old:\s*//' \
    | grep -vE '^[A-Z][a-z]+ ' \
    | awk '{print $1}' \
    | sort -u \
    | grep -E '^(http://|\S+_SECRET|\S+_URL|DB_HOST=|[A-Za-z_][A-Za-z0-9_]{2,})' || true)
  for tok in "${OBSOLETE_TOKENS[@]:-}"; do
    [ -z "${tok:-}" ] && continue
    # skip very common words that would produce huge false positives
    case "$tok" in
      const|let|var|function|if|for|while|the|a|an) continue ;;
    esac
    hits=$(printf '%s\n' $SRC_AND_TESTS | xargs -r grep -nF "$tok" 2>/dev/null | head -20 || true)
    if [ -n "$hits" ]; then
      # WARN-level: don't fail the build, but surface the occurrence.
      echo "⚠️  OBSOLETE identifier still present: $tok" >> "$REPORT"
      printf '%s\n' "$hits" | sed 's/^/    /' >> "$REPORT"
    fi
  done
fi

# ── Output + exit ────────────────────────────────────────────────────
if [ -s "$REPORT" ]; then
  cat "$REPORT" >&2
  echo "" >&2
  echo "See .cleanup/reports/phase2/guardrails-plan.md §2 for rule details" >&2
  echo "or docs/process/guardrails.md for the handbook." >&2
fi

exit $FAIL
