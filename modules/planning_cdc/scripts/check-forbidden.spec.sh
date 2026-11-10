#!/usr/bin/env bash
# scripts/check-forbidden.spec.sh — self-tests for check-forbidden.sh
#
# For each rule P-0X we have a "bad" fixture that MUST be flagged, and
# a "good" fixture that MUST pass. Run from repo root: bash scripts/check-forbidden.spec.sh
# Exit 0 on success, 1 on any failing assertion.

set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" || exit 2

SCRIPT="scripts/check-forbidden.sh"
FIXDIR="scripts/fixtures/forbidden"

pass=0
fail=0

assert_flagged() {
  local rule="$1" file="$2"
  if bash "$SCRIPT" --files "$file" 2>&1 | grep -Eq "^❌ $rule\b"; then
    pass=$((pass+1))
    printf '  ✅ %s: bad fixture flagged (%s)\n' "$rule" "$file"
  else
    fail=$((fail+1))
    printf '  ❌ %s: bad fixture NOT flagged (%s)\n' "$rule" "$file"
  fi
}

assert_clean() {
  local rule="$1" file="$2"
  if ! bash "$SCRIPT" --files "$file" 2>&1 | grep -Eq "^❌ $rule\b"; then
    pass=$((pass+1))
    printf '  ✅ %s: good fixture clean (%s)\n' "$rule" "$file"
  else
    fail=$((fail+1))
    printf '  ❌ %s: good fixture FLAGGED (%s)\n' "$rule" "$file"
  fi
}

echo "Running check-forbidden fixture suite…"

# P-01 TypeScript forbidden
assert_flagged "P-01" "$FIXDIR/P-01.bad.ts"
assert_clean   "P-01" "$FIXDIR/P-01.good.js"

# P-02 hasAnyRole / ROLE_GROUPS
assert_flagged "P-02" "$FIXDIR/P-02.bad.js"
assert_clean   "P-02" "$FIXDIR/P-02.good.js"

# P-03 inline role arrays
assert_flagged "P-03" "$FIXDIR/P-03.bad.js"
assert_clean   "P-03" "$FIXDIR/P-03.good.js"

# P-04 status literals
assert_flagged "P-04" "$FIXDIR/P-04.bad.js"
assert_clean   "P-04" "$FIXDIR/P-04.good.js"

# P-05 console.log
assert_flagged "P-05" "$FIXDIR/P-05.bad.js"
assert_clean   "P-05" "$FIXDIR/P-05.good.js"

# P-06 window.confirm
assert_flagged "P-06" "$FIXDIR/P-06.bad.jsx"
assert_clean   "P-06" "$FIXDIR/P-06.good.jsx"

# P-07 key={index}
assert_flagged "P-07" "$FIXDIR/P-07.bad.jsx"
assert_clean   "P-07" "$FIXDIR/P-07.good.jsx"

# P-08 legacy error envelope
assert_flagged "P-08" "$FIXDIR/P-08.bad.js"
assert_clean   "P-08" "$FIXDIR/P-08.good.js"

# P-10 docker hostnames
assert_flagged "P-10" "$FIXDIR/P-10.bad.js"
assert_clean   "P-10" "$FIXDIR/P-10.good.js"

# P-11 useEffect + fetch
assert_flagged "P-11" "$FIXDIR/P-11.bad.jsx"
assert_clean   "P-11" "$FIXDIR/P-11.good.jsx"

# P-13 per-file Knex
assert_flagged "P-13" "$FIXDIR/P-13.bad.js"
assert_clean   "P-13" "$FIXDIR/P-13.good.js"

# P-14 legacy JWT_SECRET
assert_flagged "P-14" "$FIXDIR/P-14.bad.js"
assert_clean   "P-14" "$FIXDIR/P-14.good.js"

# P-17 localStorage token
assert_flagged "P-17" "$FIXDIR/P-17.bad.js"
assert_clean   "P-17" "$FIXDIR/P-17.good.js"

# P-18 window.location.href
assert_flagged "P-18" "$FIXDIR/P-18.bad.js"
assert_clean   "P-18" "$FIXDIR/P-18.good.js"

# P-24 helmet
assert_flagged "P-24" "services/api-server/src/__test_fixtures/P-24.bad.js"
assert_clean   "P-24" "$FIXDIR/P-24.good.js"

# P-31 entity-type magic strings
assert_flagged "P-31" "services/api-server/src/__test_fixtures/P-31.bad.js"
assert_clean   "P-31" "services/api-server/src/__test_fixtures/P-31.good.js"

echo ""
echo "Total: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
