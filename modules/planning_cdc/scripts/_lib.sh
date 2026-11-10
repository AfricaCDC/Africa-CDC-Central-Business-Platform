#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RBM Platform — shared shell helpers
# Source from any other script:
#   . "$(dirname "$0")/_lib.sh"
# ─────────────────────────────────────────────────────────────

# Colors (no-op when stdout is not a TTY)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  BOLD=''
  NC=''
fi

ok()    { printf "${GREEN}\xe2\x9c\x93${NC} %s\n" "$1"; }
fail()  { printf "${RED}\xe2\x9c\x97${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}~${NC} %s\n" "$1"; }
info()  { printf "${BLUE}\xe2\x86\x92${NC} %s\n" "$1"; }
title() { printf "\n${BOLD}=== %s ===${NC}\n" "$1"; }

# Resolve repo root: this lib lives in <root>/scripts/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Default container names
RBM_DB_CONTAINER="${RBM_DB_CONTAINER:-rbm-db}"
RBM_DB_DEV_CONTAINER="${RBM_DB_DEV_CONTAINER:-rbm-db-dev}"
RBM_API_CONTAINER="${RBM_API_CONTAINER:-rbm-api-server}"
RBM_API_DEV_CONTAINER="${RBM_API_DEV_CONTAINER:-rbm-api-server-dev}"
