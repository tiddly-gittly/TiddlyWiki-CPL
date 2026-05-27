#!/usr/bin/env bash
# sync-data.sh — Run on the HOST (not inside Docker) to commit and push the
# data/ directory back to GitHub.
#
# The Docker container writes stats/ratings/comments into the mounted data/
# directory.  This script collects those changes, commits them, and pushes
# using the host's existing git credentials.
#
# Usage:
#   bash scripts/sync-data.sh
#
# Suggested cron (every hour, from the repo root):
#   0 * * * * cd /path/to/TiddlyWiki-CPL && bash scripts/sync-data.sh >> /var/log/cpl-sync.log 2>&1

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Pull first to avoid non-fast-forward push failures when multiple mirrors
# are writing data.
echo "[sync-data] Pulling latest changes..."
git pull --ff-only --quiet || {
  echo "[sync-data] WARNING: git pull failed (conflict or network issue). Skipping push."
  exit 0
}

# Stage only the data/ directory — never stage plugin-fetched/ or repo-cache/.
git add data/

if git diff --cached --quiet; then
  echo "[sync-data] No changes in data/ to commit."
  exit 0
fi

TIMESTAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
SERVER_ID="${CPL_SERVER_ID:-default}"
git commit -m "chore(data): sync stats/ratings/comments from ${SERVER_ID} server [${TIMESTAMP}]"

echo "[sync-data] Pushing..."
git push origin master
echo "[sync-data] Done."
