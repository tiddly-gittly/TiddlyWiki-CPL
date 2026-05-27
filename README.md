# TiddlyWiki-CPL [![Total alerts](https://img.shields.io/lgtm/alerts/g/tiddly-gittly/TiddlyWiki-CPL.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/tiddly-gittly/TiddlyWiki-CPL/alerts/) [![](https://github.com/tiddly-gittly/TiddlyWiki-CPL/actions/workflows/gh-pages.yml/badge.svg)](https://github.com/tiddly-gittly/TiddlyWiki-CPL/actions/workflows/gh-pages.yml) [![](https://img.shields.io/badge/Join-Us-blue)](https://tw-cn.netlify.app/)

Welcome to the **[TiddlyWiki Community Plugin Library]**!

![Alt](https://repobeats.axiom.co/api/embed/c9abaa068433185ffad72b7f9e0addcdf9b6f570.svg "Repobeats analytics image")

This plugin source is maintained by the [TiddlyWiki Chinese Community](https://github.com/tiddly-gittly) and is dedicated to collecting all TiddlyWiki5 related plugins on the web, hoping to provide a one-click installation and update plugin experience for TiddlyWiki users all around the world.

If you don't know how to use TiddlyWiki and this source, you are welcome to read the plugins related section in the [TiddlyWiki Tutorials for Chinese Communities](https://tw-cn.netlify.app). As mentioned above, both the plugin source and the tutorial are open source projects, you can find them in [GitHub](https://github.com/tiddly-gittly) and participate in contributing! If you like, you can join us through QQ groups and other means, see the Chinese tutorials mentioned above for details.

To add this plugin library to your Wiki, simply drag the link in [cpl website](https://tw-cpl.netlify.app/#Welcome:Welcome) to your Wiki with your mouse:

<center>

![install_en](https://user-images.githubusercontent.com/16955102/157163687-9f985b58-9027-4f8c-96f9-38869b2ad751.gif)

</center>

On this site, you can browse through various interesting plugins and install them in your own TW once you find the one you like. There is a comment section under each plugin info tiddler on this site where you can leave your thoughts. ↓

<center>

![image](https://user-images.githubusercontent.com/16955102/157163710-3da56081-4b1a-4a50-83eb-0eb3e037bdf9.png)

</center>

## Import plugins / libraries

1. Pull this repo
2. Make sure to install NodeJS and run `npm i`
3. In this repo folder, run: `npm run help` for further guidance

## Development & Testing

### Project Architecture

This project uses [Modern.TiddlyDev](https://github.com/tiddly-gittly/Modern.TiddlyDev) with the following structure:

- `src/CPLServer/` — Server-side plugin (API routes, data store, rate limiting)
- `src/CPLPlugin/` — Client-side plugin (browser API client, UI components)
- `wiki/` — TiddlyWiki content and configuration
- `wiki/files/plugin-offline/` — Offline plugin files (for plugins not available online)
- `wiki/files/plugin-fetched/` — Fetched plugin files (populated by scheduled scripts in production)
- `data/` — Runtime data directory (downloads, ratings, created automatically)

### Local Development

Start the development server with hot reload:

```bash
pnpm dev
```

The server will start on `http://127.0.0.1:15745` by default. The `tiddlywiki-plugin-dev` CLI automatically loads plugins from `src/`, so you don't need to manually declare them in `wiki/tiddlywiki.info`.

For LAN access (useful for mobile testing):

```bash
pnpm dev:lan
```

### Testing

We have three levels of automated tests:

**Unit tests** — Data store, rate limiter, and utility functions:

```bash
pnpm test:unit
```

**API tests** — Server route handlers (runs a test server on port 9876):

```bash
pnpm test:api
```

**E2E tests** — Playwright browser automation across Chromium, Firefox, and WebKit:

```bash
pnpm test:e2e
```

To run E2E tests with the interactive UI:

```bash
pnpm test:e2e:ui
```

**All tests:**

```bash
pnpm test           # Unit tests only (Jest)
# To run everything:
pnpm test:unit && pnpm test:api && pnpm test:e2e
```

### Building

Build the deployable static site artifacts from the Modern.TiddlyDev wiki and plugin library:

```bash
pnpm build
pnpm run build:static-site
pnpm run build:static-library
```

`pnpm build` prepares the plugin packages.

`pnpm run build:static-site` builds the browser-facing static website.

`pnpm run build:static-library` builds the static plugin library JSON artifacts used by the published mirror.

### Adding Offline Plugin Files

Place plugin `.json` files into `wiki/files/plugin-offline/` to make them available for download via the server. The download route (`GET /cpl/api/download-plugin/:title`) checks `wiki/files/plugin-fetched/` first, then falls back to `wiki/files/plugin-offline/`.

### Production Server

For a writable local runtime server that exercises the CPL boot path exactly like the Node.js deployment:

```bash
pnpm server:test
```

Start the production server in read-only mode:

```bash
pnpm server:prod
```

The server launcher compiles the TypeScript plugin sources into runtime plugin JSON files under `cache/runtime-plugins/`, and then starts a standard TiddlyWiki Node.js server with those compiled plugins injected as boot-time plugin arguments. This keeps the runtime compatible with TiddlyWiki's Node.js boot process while preserving TypeScript source under `src/`.

This is intentionally different from `pnpm dev:wiki`: `pnpm dev:wiki` runs the Modern.TiddlyDev development server with wiki writes enabled, while `pnpm server:test` verifies the production-like runtime plugin loading path used by the CPL server.

For public deployments, configure read-only mode so wiki writes stay disabled while download statistics and API routes remain available.

If the server is deployed behind a reverse proxy or CDN, make sure the real client IP is preserved correctly. Download throttling, vote limits, and similar protections depend on the client address seen by the CPL server.

### Docker Deployment

A `Dockerfile` is included for running the server version in a container (not a static-site build image).

**Build and run:**

```bash
docker build -t tiddlywiki-cpl .
docker run -p 8080:8080 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/wiki/files/plugin-fetched:/app/wiki/files/plugin-fetched \
  -v $(pwd)/wiki/files/plugin-fetched-history:/app/wiki/files/plugin-fetched-history \
  -v $(pwd)/repo-cache:/app/repo-cache \
  --env-file .env \
  -e HOST=0.0.0.0 \
  -e PORT=8080 \
  tiddlywiki-cpl
```

**Recommended: mount volumes into the cloned repo directory**

The recommended setup is to run the container from inside your cloned copy of this repo and point each mount at the corresponding path in the repo. This way:

- `data/` is inside a git-tracked directory — you can commit download stats, ratings, and comments back to the repo with a simple `git add data/ && git commit`
- `wiki/files/plugin-fetched/` and `wiki/files/plugin-fetched-history/` are already in `.gitignore`, so they persist on disk across restarts without polluting your git history

```bash
# Clone the repo once on your server, then run from inside it:
git clone https://github.com/tiddly-gittly/TiddlyWiki-CPL.git
cd TiddlyWiki-CPL
docker run -p 8080:8080 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/wiki/files/plugin-fetched:/app/wiki/files/plugin-fetched \
  -v $(pwd)/wiki/files/plugin-fetched-history:/app/wiki/files/plugin-fetched-history \
  -v $(pwd)/repo-cache:/app/repo-cache \
  --env-file .env \
  linonetwo/tiddlywiki-cpl:latest
```

> **Note on Docker mount behaviour:** When you use `-v /host/path:/container/path`, the host directory _completely shadows_ the container directory — any files baked into the image at that path become invisible. This is why `wiki/files/plugin-offline/` must **not** be mounted: its content (offline fallback plugins) lives inside the image and would disappear under a host mount. Only mount paths that are empty in the image (`data/`, `plugin-fetched/`, `plugin-fetched-history/`, `repo-cache/`).
>
> If you omit a `-v` for a path declared as `VOLUME`, Docker creates an anonymous volume and copies the image content into it on first container creation — but this is lost when the container is removed. Always use explicit `-v` mounts for data you want to keep.

**Syncing `data/` back to GitHub (host-side)**

The container has no git credentials and should not need them. Instead, run the provided sync script **on the host** using the host's existing git identity:

```bash
# One-off sync:
bash scripts/sync-data.sh

# Automated: add to crontab (runs every hour)
crontab -e
# Add this line:
0 * * * * cd /path/to/TiddlyWiki-CPL && bash scripts/sync-data.sh >> /var/log/cpl-sync.log 2>&1
```

The script:
1. `git pull --ff-only` — absorbs changes from other mirrors first
2. `git add data/` — stages only the data directory (never touches `plugin-fetched/` etc.)
3. Commits with a timestamped message and pushes

This keeps git credentials entirely on the host and out of the container.

**Volume mount summary:**

| Path in container | Mount from repo | Purpose |
|---|---|---|
| `/app/data` | `$(pwd)/data` | Stats, ratings, comments — **commit back to git** |
| `/app/wiki/files/plugin-fetched` | `$(pwd)/wiki/files/plugin-fetched` | Latest plugin JSONs (gitignored, persists on disk) |
| `/app/wiki/files/plugin-fetched-history` | `$(pwd)/wiki/files/plugin-fetched-history` | Per-version plugin archives (gitignored, persists on disk) |
| `/app/repo-cache` | `$(pwd)/repo-cache` | Shallow git clone (gitignored) — avoids full re-clone on restart |
| `/app/wiki/files/plugin-offline` | ❌ do not mount | Baked into image; mounting would hide the content |

**Environment variables:**

| Variable | Description |
|---|---|
| `HOST` | Bind address (default `0.0.0.0` in container) |
| `PORT` | Listen port (default `8080`) |
| `CPL_JWT_SECRET` | JWT signing secret (required) |
| `CPL_GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `CPL_GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret |
| `CPL_ADMIN_GITHUB_IDS` | Comma-separated GitHub user IDs for moderators |

The container runs `docker-entrypoint.ts` (via `ts-node`) which manages the full lifecycle:

1. **`git clone / pull`** — shallow-clones the repo into `/app/repo-cache` on first start, then `git pull` on subsequent starts to get the latest plugin metadata. Non-fatal: server starts with baked-in metadata if git is unreachable.
2. **Server starts immediately** — no waiting for plugin downloads.
3. **`fetch-plugins` (background)** — downloads plugin JSON files from upstream sources into `wiki/files/plugin-fetched/`. Server restarts when complete to serve the new files.
4. **Periodic sync** — every `SYNC_INTERVAL_SECONDS` (default: `3600`), steps 1 and 3 repeat and the server restarts.

**Extra environment variables:**

| Variable | Default | Description |
|---|---|---|
| `SYNC_INTERVAL_SECONDS` | `3600` | Seconds between git pull + plugin re-fetch cycles. Set to `0` to disable. |

### Environment Configuration

CPL Server requires environment variables for authentication and admin configuration. Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|---|---|
| `CPL_JWT_SECRET` | Random string for JWT signing. Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `CPL_GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `CPL_GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret |
| `CPL_ADMIN_GITHUB_IDS` | Comma-separated list of GitHub user IDs who can moderate comments |
| `CPL_SERVER_ID` | (Optional) Unique server identifier for multi-server deployments (e.g., "china", "us", "eu"). Leave empty for single-server setups. |

**Never commit `.env` to git** — it is already in `.gitignore`.

**Creating a GitHub OAuth App:**
1. Go to https://github.com/settings/applications/new
2. Set Authorization callback URL to `http://your-domain/cpl/api/auth/github/callback`
3. Copy the Client ID and Client Secret to your `.env`

### Comment System

CPL now includes a self-hosted comment system with GitHub OAuth authentication and moderation:

- Users authenticate via GitHub OAuth
- Comments support wikitext formatting (dangerous syntax is filtered server-side)
- New comments are held for moderation (`pending` status)
- Admins (configured in `CPL_ADMIN_GITHUB_IDS`) can approve, reject, or delete comments
- Comment data is stored in `data/comments/` as JSON files, suitable for git backup
- Rate limiting: 10 comments per hour per user (configurable via `CPL_COMMENT_RATE_LIMIT`)

The browser-side CPL client exposes the server API as `$tw.cpl`, with `$tw.cplServerAPI` retained as a legacy alias.

### Multi-Server Deployment

CPL supports deploying multiple mirror servers (e.g., China, US, Europe) that all sync data via git without conflicts.

**How it works:**

1. Each server writes to its own files: `stats.{serverId}.json`, `ratings.{serverId}.json`, `comments/{plugin}.{serverId}.json`
2. When reading data, the server aggregates across all files:
   - Stats: download counts are summed
   - Ratings: ratings are merged and averages recalculated
   - Comments: comments are merged and deduplicated by ID
3. All servers can push/pull from the same git repository without merge conflicts

**Setup:**

1. Set `CPL_SERVER_ID` in each mirror's `.env` file:
   ```bash
   # China mirror
   CPL_SERVER_ID=china
   
   # US mirror
   CPL_SERVER_ID=us
   
   # Europe mirror
   CPL_SERVER_ID=eu
   ```

2. Each server will automatically use server-specific files

3. Periodically run the reconciliation script to detect issues:
   ```bash
   pnpm run reconcile-data                     # Dry run (report only)
   pnpm run reconcile-data -- --fix           # Apply fixes
   pnpm run reconcile-data -- --clean-stale   # Remove stale mirror files (30+ days old)
   ```

**Git workflow:**

```bash
# On each mirror, periodically:
git pull origin main                    # Get data from other mirrors
pnpm run reconcile-data                 # Check for issues
git add data/
git commit -m "Update stats from {serverId} mirror"
git push origin main
```

**Comment IDs:** Each comment gets a unique ID in the format `{serverId}-{timestamp}-{random}` to prevent collisions across mirrors.

**Stale mirrors:** If a mirror goes offline permanently, run `pnpm run reconcile-data -- --clean-stale` to remove its files after 30 days of inactivity.

### Scheduled Plugin Fetching

To keep `wiki/files/plugin-fetched/` up to date with the latest plugin versions, schedule `pnpm run fetch-plugins` to run periodically.

**Windows** — Use Windows Task Scheduler:
1. Create a new task that runs `pnpm run fetch-plugins`
2. Set the working directory to the repo root
3. Schedule it to run daily or at your preferred interval

**Linux/macOS** — Use `cron`:

```bash
# Fetch plugins daily at 3 AM
0 3 * * * cd /path/to/TiddlyWiki-CPL && pnpm run fetch-plugins
```

The script fetches the latest plugin JSON files and saves them to `wiki/files/plugin-fetched/`. Run `pnpm run fetch-plugins:dry-run -- --allow-ci --best-effort` to preview what would be fetched without writing files.
