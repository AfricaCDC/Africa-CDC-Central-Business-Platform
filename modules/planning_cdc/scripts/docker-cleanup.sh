#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RBM Platform — Docker disk cleanup
# Removes stopped containers, dangling images, unused networks
# and build cache. Optionally prunes unused volumes (--all).
#
# Usage:
#   ./scripts/docker-cleanup.sh         # safe cleanup
#   ./scripts/docker-cleanup.sh --all   # ALSO prune unused volumes
# ─────────────────────────────────────────────────────────────
set -euo pipefail

. "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

title "RBM Docker Cleanup"

info "[1/4] Removing stopped containers..."
docker container prune -f >/dev/null

info "[2/4] Removing dangling images..."
docker image prune -f >/dev/null

info "[3/4] Removing unused networks..."
docker network prune -f >/dev/null

info "[4/4] Trimming build cache (keep 2GB)..."
docker builder prune -f --keep-storage 2GB >/dev/null

if [ "${1:-}" = "--all" ]; then
  warn "--all also removes unused volumes (potential data loss)"
  printf "Type 'yes' to confirm: "
  read -r CONFIRM
  if [ "$CONFIRM" = "yes" ]; then
    docker volume prune -f >/dev/null
    ok "Volumes pruned"
  else
    info "Volume cleanup skipped"
  fi
fi

ok "Cleanup done"
docker system df
