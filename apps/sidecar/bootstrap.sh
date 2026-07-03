#!/usr/bin/env bash
# Bootstrap script — runs inside the Daytona sandbox on spawn.
#
# Installs Bun, downloads the sidecar bundle from GitHub, starts it in the
# background. The mobile app polls /health until ready, then connects WS.
#
# This script is fetched + executed by the mobile app via Daytona's
# POST /toolbox/{id}/toolbox/process/execute endpoint.
#
# Env vars (set by mobile app at sandbox spawn):
#   AGENTIC_LLM_PROVIDER   — 'openai' | 'anthropic' | 'google' | ...
#   AGENTIC_LLM_MODEL      — model id
#   AGENTIC_LLM_BASE_URL   — base URL for the provider
#   OPENAI_API_KEY / ANTHROPIC_API_KEY / etc.
#   AGENTIC_WORKSPACE      — workspace root (default: /home/daytona/workspace)
#   PORT                   — WS port (default: 3000)
#   AGENTIC_SIDECAR_URL    — where to download sidecar.js from (default: GitHub raw)
#   AGENTIC_REPO_REF       — git ref (branch/tag/commit) to pull from (default: main)

set -euo pipefail

LOG_FILE=/tmp/agentic-sidecar.log
PID_FILE=/tmp/agentic-sidecar.pid

# Don't re-bootstrap if already running
if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
  echo "Sidecar already running (pid $(cat $PID_FILE))"
  exit 0
fi

echo "[bootstrap] starting at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[bootstrap] user=$(whoami) pwd=$(pwd) home=$HOME"

# ─── Step 1: Install Bun ────────────────────────────────────────────────────
if ! command -v bun > /dev/null 2>&1; then
  echo "[bootstrap] installing Bun…"
  curl -fsSL https://bun.sh/install | bash 2>&1 | tail -5
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
echo "[bootstrap] bun: $(bun --version)"

# ─── Step 2: Set up workspace ───────────────────────────────────────────────
export AGENTIC_WORKSPACE="${AGENTIC_WORKSPACE:-/home/daytona/workspace}"
mkdir -p "$AGENTIC_WORKSPACE/download" "$AGENTIC_WORKSPACE/upload" "$AGENTIC_WORKSPACE/skills"
cd "$AGENTIC_WORKSPACE"

# ─── Step 3: Download sidecar bundle (skip if already present) ────────────
# Pin to a specific commit to avoid CDN cache issues with raw.githubusercontent.com.
# To update: change AGENTIC_REPO_REF to the latest commit SHA, rebuild the snapshot.
AGENTIC_REPO_REF="${AGENTIC_REPO_REF:-0cba48e}"
SIDECAR_URL="${AGENTIC_SIDECAR_URL:-https://raw.githubusercontent.com/UIoperationparameters99/agentic-phone/$AGENTIC_REPO_REF/apps/sidecar/dist/sidecar.js}"
SIDECAR_PATH="$AGENTIC_WORKSPACE/.sidecar/sidecar.js"
mkdir -p "$(dirname "$SIDECAR_PATH")"

# Skip download if the file already exists, is >100KB, AND contains the relay code.
# (We check for 'llm_request' to ensure we have the relay-capable version.)
if [ -f "$SIDECAR_PATH" ] && [ "$(wc -c < "$SIDECAR_PATH")" -gt 100000 ] && grep -q 'llm_request' "$SIDECAR_PATH" 2>/dev/null; then
  echo "[bootstrap] sidecar.js already present ($(wc -c < "$SIDECAR_PATH") bytes, relay-capable), skipping download"
else
  echo "[bootstrap] downloading sidecar from $SIDECAR_URL"
  curl -fsSL "$SIDECAR_URL" -o "$SIDECAR_PATH"
  echo "[bootstrap] saved to $SIDECAR_PATH ($(wc -c < "$SIDECAR_PATH") bytes)"
  # Verify the relay code is present
  if ! grep -q 'llm_request' "$SIDECAR_PATH" 2>/dev/null; then
    echo "[bootstrap] WARNING: downloaded sidecar.js does not contain relay code — LLM calls may fail"
  fi
fi

# ─── Step 4: Start sidecar in background ────────────────────────────────────
export PORT="${PORT:-3000}"
export NODE_ENV=production

echo "[bootstrap] starting sidecar on port $PORT…"
nohup bun "$SIDECAR_PATH" > "$LOG_FILE" 2>&1 &
SIDECAR_PID=$!
echo "$SIDECAR_PID" > "$PID_FILE"

echo "[bootstrap] sidecar pid=$SIDECAR_PID, log=$LOG_FILE"

# ─── Step 5: Wait for health (max 30s) ──────────────────────────────────────
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:$PORT/health" > /dev/null 2>&1; then
    echo "[bootstrap] ✅ sidecar healthy after ${i}s"
    echo "[bootstrap] WS endpoint: ws://localhost:$PORT/ws"
    exit 0
  fi
  sleep 1
done

echo "[bootstrap] ❌ sidecar did not become healthy in 30s"
echo "[bootstrap] last 20 log lines:"
tail -20 "$LOG_FILE" || true
exit 1
