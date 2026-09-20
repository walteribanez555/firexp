#!/usr/bin/env bash
# scripts/dev.sh — single-command local dev
# Usage: npm run dev   (or bash scripts/dev.sh)
#
# Starts:
#   1. DynamoDB Local (docker)
#   2. content-api  on PORT=3003  (dynamo mode)
#   3. relay        on PORT=3001  (points at content-api)
#   4. content-dashboard  (vite dev, uses VITE_CONTENT_API_URL)
#
# Ctrl-C stops all background processes.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── colours ──────────────────────────────────────────────────────────────────
C_RESET='\033[0m'
C_CYAN='\033[0;36m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[0;33m'
C_MAGENTA='\033[0;35m'

label() { printf "${1}[%s]${C_RESET} %s\n" "$2" "$3"; }

# ── cleanup on Ctrl-C ────────────────────────────────────────────────────────
PIDS=()

cleanup() {
  echo ""
  label "$C_YELLOW" "dev" "Shutting down all services…"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  label "$C_YELLOW" "dev" "All stopped."
  exit 0
}

trap cleanup INT TERM

# ── 1. DynamoDB Local ─────────────────────────────────────────────────────────
label "$C_CYAN" "dynamodb" "Starting DynamoDB Local…"
docker compose -f "$REPO_ROOT/docker-compose.yml" up -d dynamodb-local
label "$C_CYAN" "dynamodb" "DynamoDB Local running on :8000"

# ── 2. Init DynamoDB tables (ignore errors if already seeded) ─────────────────
label "$C_CYAN" "dynamo:init" "Initialising tables (skip if already seeded)…"
(
  cd "$REPO_ROOT/apps/content-api"
  DYNAMODB_ENDPOINT=http://localhost:8000 \
  AWS_REGION=us-east-1 \
  SERIES_TABLE=firexp-dev-series \
  EPISODES_TABLE=firexp-dev-episodes \
  npm run dynamo:init 2>&1 | sed "s/^/$(printf "${C_CYAN}[dynamo:init]${C_RESET} ")/"
) || label "$C_CYAN" "dynamo:init" "Already seeded or skipped — continuing."

# ── 3. content-api ────────────────────────────────────────────────────────────
label "$C_GREEN" "content-api" "Starting on :3003…"
(
  cd "$REPO_ROOT/apps/content-api"
  DYNAMODB_ENDPOINT=http://localhost:8000 \
  AWS_REGION=us-east-1 \
  SERIES_TABLE=firexp-dev-series \
  EPISODES_TABLE=firexp-dev-episodes \
  PORT=3003 \
  npm run dev 2>&1 | sed "s/^/$(printf "${C_GREEN}[content-api]${C_RESET} ")/"
) &
PIDS+=($!)

# ── 4. relay ─────────────────────────────────────────────────────────────────
label "$C_MAGENTA" "relay" "Starting on :3001…"
(
  cd "$REPO_ROOT/apps/relay"
  CONTENT_API_URL=http://localhost:3003 \
  PORT=3001 \
  npm run dev 2>&1 | sed "s/^/$(printf "${C_MAGENTA}[relay]${C_RESET} ")/"
) &
PIDS+=($!)

# ── 5. content-dashboard ─────────────────────────────────────────────────────
label "$C_YELLOW" "dashboard" "Starting Vite dev server…"
(
  cd "$REPO_ROOT"
  VITE_CONTENT_API_URL=http://localhost:3003/api/v1 \
  npm run dev --workspace content-dashboard 2>&1 | sed "s/^/$(printf "${C_YELLOW}[dashboard]${C_RESET} ")/"
) &
PIDS+=($!)

# ── Wait for all background jobs ─────────────────────────────────────────────
echo ""
label "$C_CYAN" "dev" "All services started. Press Ctrl-C to stop."
wait
