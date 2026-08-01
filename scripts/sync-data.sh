#!/bin/sh
set -eu

REPO_ROOT="${CPL_REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SERVER_ID="${CPL_SERVER_ID:-}"
SYNC_REPO="${CPL_SYNC_REPO:-git@github.com:tiddly-gittly/TiddlyWiki-CPL.git}"
BASE_BRANCH="${CPL_SYNC_BRANCH:-master}"
SYNC_BRANCH="data-sync/${SERVER_ID}"
LOCK_DIR="$REPO_ROOT/.cpl-sync-lock"
SYNC_PATHS="
wiki/tiddlers/comments
wiki/tiddlers/ratings
wiki/tiddlers/compatibility
wiki/tiddlers/download-stats
"

if [ -z "$SERVER_ID" ]; then
  echo "[sync-data] CPL_SERVER_ID is required" >&2
  exit 1
fi

acquire_lock() {
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    if [ -f "$LOCK_DIR/timestamp" ]; then
      lock_time=$(cat "$LOCK_DIR/timestamp" 2>/dev/null || echo 0)
      now=$(date +%s)
      if [ $((now - lock_time)) -gt 3600 ]; then
        rm -rf "$LOCK_DIR"
        continue
      fi
    fi
    sleep 2
  done
  date +%s > "$LOCK_DIR/timestamp"
}

temp_dir=""
cleanup() {
  if [ -n "$temp_dir" ]; then
    rm -rf "$temp_dir"
  fi
  rm -rf "$LOCK_DIR"
}

acquire_lock
trap cleanup EXIT INT TERM

if [ ! -d "$REPO_ROOT/.git" ]; then
  echo "[sync-data] $REPO_ROOT is not a Git repository" >&2
  exit 1
fi

temp_dir=$(mktemp -d)
checkout_dir="$temp_dir/repository"

git clone --quiet --depth 1 --branch "$BASE_BRANCH" "$SYNC_REPO" "$checkout_dir"
git -C "$checkout_dir" checkout -B "$SYNC_BRANCH" >/dev/null
git -C "$checkout_dir" config user.name "CPL Data Sync (${SERVER_ID})"
git -C "$checkout_dir" config user.email "cpl-data-sync@users.noreply.github.com"

for relative_path in $SYNC_PATHS; do
  source_path="$REPO_ROOT/$relative_path"
  destination_path="$checkout_dir/$relative_path"
  if [ -d "$source_path" ]; then
    mkdir -p "$destination_path"
    cp -a "$source_path/." "$destination_path/"
  elif [ -f "$source_path" ]; then
    mkdir -p "$(dirname "$destination_path")"
    cp -a "$source_path" "$destination_path"
  fi
done

git -C "$REPO_ROOT" diff --name-only --diff-filter=D -- $SYNC_PATHS |
while IFS= read -r deleted_path; do
  if [ -n "$deleted_path" ]; then
    rm -rf "$checkout_dir/$deleted_path"
  fi
done

if [ "${CPL_SYNC_DEBUG:-false}" = "true" ]; then
  echo "[sync-data] Working tree after overlay:"
  git -C "$checkout_dir" status --short -- $SYNC_PATHS
fi

for relative_path in $SYNC_PATHS; do
  git -C "$checkout_dir" add -A -f -- "$relative_path" 2>/dev/null || true
done
if [ "${CPL_SYNC_DEBUG:-false}" = "true" ]; then
  echo "[sync-data] Staged changes:"
  git -C "$checkout_dir" diff --cached --stat
fi
if git -C "$checkout_dir" diff --cached --quiet; then
  echo "[sync-data] No runtime data changes to sync"
  exit 0
fi

timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
git -C "$checkout_dir" commit -m "chore(data): sync from ${SERVER_ID} [${timestamp}]" >/dev/null
git -C "$checkout_dir" push --force origin "HEAD:refs/heads/$SYNC_BRANCH"
echo "[sync-data] Updated $SYNC_BRANCH; GitHub Actions will create or refresh the Pull Request"
