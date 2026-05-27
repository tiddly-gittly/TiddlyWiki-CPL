# data/

Runtime data written by the CPL Server. This directory is committed to git so
that download stats, ratings, and comments are preserved and shared across mirror
servers.

## Contents

| File / Directory | Description |
|---|---|
| `stats.json` | Aggregate download counts (read by the server at startup) |
| `stats.{serverId}.json` | Per-mirror download stats (written by each mirror) |
| `ratings.json` | Aggregate plugin ratings |
| `ratings.{serverId}.json` | Per-mirror ratings |
| `comments/{plugin}.json` | Approved comments for a plugin |
| `comments/{plugin}.{serverId}.json` | Per-mirror comments |
| `compatibility/` | User-submitted compatibility reports |

## Syncing back to GitHub (Docker deployments)

The Docker container writes to this directory via a bind mount:

```bash
docker run ... -v $(pwd)/data:/app/data ...
```

Because it is a bind mount, every write the container makes is immediately
visible on the host. The container itself carries no git credentials.

To open a Pull Request with the accumulated changes (recommended: **once a week**):

```bash
# Requires gh CLI: https://cli.github.com
pnpm run sync-data
```

`scripts/sync-data.ts` creates a branch `data-sync/{serverId}/{timestamp}`,
commits only `data/`, pushes it, and opens a PR via `gh pr create`. The PR
gives you a review step and avoids direct-push conflicts between mirrors.

## Multi-server setup

Each mirror sets `CPL_SERVER_ID` in its `.env` (e.g. `china`, `us`, `eu`).
The server writes to its own `stats.{serverId}.json` etc. and the aggregation
layer merges all files at read time — no merge conflicts on git.

See the **Multi-Server Deployment** section of the main README for details.
