#!/usr/bin/env bash
# Stage one commit of this repo as modules/planning_cdc in a CBP checkout (D-20261110-02).
# Usage: bash scripts/sync-to-cbp.sh <cbp-checkout> [<ref>]   (ref defaults to HEAD)
# Leaves the change staged in the CBP checkout. The caller commits it.
set -euo pipefail

cbp=${1:?usage: bash scripts/sync-to-cbp.sh <cbp-checkout> [<ref>]}
ref=${2:-HEAD}
prefix=modules/planning_cdc
planning=$(cd "$(dirname "$0")/.." && pwd)
# The CBP repo is public. It gets what builds and runs the stack and nothing else:
# docs, workbooks, indicator snapshots and tool state stay in Azure DevOps.
published=(services packages scripts docker-compose.yml .dockerignore .env.example
  package.json package-lock.json .gitignore disaggregations.json)

cd "$cbp"
git fetch --quiet --depth=1 --no-tags "$planning" "$ref"
git rm -rq --ignore-unmatch -- "$prefix"
git read-tree --prefix="$prefix/" -u FETCH_HEAD
keep=()
for path in "${published[@]}"; do keep+=(":(exclude)$prefix/$path"); done
git rm -rqf --ignore-unmatch -- "$prefix" "${keep[@]}"
# Data inside the published paths: the budget and workplan snapshots the data
# migrations read, and any spreadsheet or browser snapshot.
git rm -rqf --ignore-unmatch -- "$prefix/services/api-server/src/db/data" \
  ":(glob,icase)$prefix/**/*.xls" ":(glob,icase)$prefix/**/*.xlsx" \
  ":(glob,icase)$prefix/**/*.xlsm" ":(glob,icase)$prefix/**/*.xlsb" \
  ":(glob,icase)$prefix/**/*.ods" ":(glob,icase)$prefix/**/*.csv" ":(glob,icase)$prefix/**/*.tsv" \
  ":(glob)$prefix/**/.playwright-mcp/**"
