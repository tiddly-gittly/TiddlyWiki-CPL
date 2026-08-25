#!/bin/sh
set -eu

DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SCRIPT="$DIR/sync-data.ts"

if ! command -v node >/dev/null 2>&1; then
  echo "[sync-data] node is required to run $SCRIPT" >&2
  exit 1
fi

if node --experimental-strip-types -e "process.exit(0)" >/dev/null 2>&1; then
  exec node --experimental-strip-types "$SCRIPT" "$@"
fi

if [ -f "$DIR/../node_modules/ts-node/dist/bin.js" ]; then
  exec node "$DIR/../node_modules/ts-node/dist/bin.js" --transpile-only "$SCRIPT" "$@"
fi

echo "[sync-data] Node 22.6+ (type stripping) or ts-node is required" >&2
exit 1
