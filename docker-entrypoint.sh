#!/bin/sh
# docker-entrypoint.sh
# Runs before the TiddlyWiki server starts:
#   1. Pull latest wiki metadata from git (plugin info, tiddler metadata, etc.)
#   2. Fetch actual plugin JSON files from upstream sources
#
# Both steps are best-effort: failures print a warning but do NOT abort startup.
# The server can still run with whatever data is already present.
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# ---- 1. git pull -------------------------------------------------------
echo "[entrypoint] Pulling latest wiki metadata from git..."
if [ -d ".git" ]; then
  # Configure a minimal git identity so git doesn't complain in headless envs.
  git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true
  if git pull --ff-only --quiet 2>&1; then
    echo "[entrypoint] git pull OK"
  else
    echo "[entrypoint] WARNING: git pull failed (network issue or non-fast-forward). Continuing with existing data."
  fi
else
  echo "[entrypoint] WARNING: not a git repository — skipping git pull."
fi

# ---- 2. fetch-plugins --------------------------------------------------
echo "[entrypoint] Fetching plugin JSON files from upstream sources..."
if node_modules/.bin/ts-node --transpile-only scripts/fetch-plugins.ts 2>&1; then
  echo "[entrypoint] fetch-plugins OK"
else
  echo "[entrypoint] WARNING: fetch-plugins encountered errors. Server will start with partial/cached plugin data."
fi

# ---- 3. start server ---------------------------------------------------
echo "[entrypoint] Starting CPL server..."
exec node_modules/.bin/ts-node --transpile-only scripts/server.ts --prod
