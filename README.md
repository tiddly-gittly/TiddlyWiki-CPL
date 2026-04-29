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

Build the static website and plugin JSON files:

```bash
pnpm build
```

### Adding Offline Plugin Files

Place plugin `.json` files into `wiki/files/plugin-offline/` to make them available for download via the server. The download route (`GET /cpl/api/download-plugin/:title`) checks `wiki/files/plugin-fetched/` first, then falls back to `wiki/files/plugin-offline/`.

### Production Server

Start the production server in read-only mode:

```bash
pnpm server:prod
```

The server launcher compiles the TypeScript plugin sources into runtime plugin JSON files under `cache/runtime-plugins/`, and then starts a standard TiddlyWiki Node.js server with those compiled plugins injected as boot-time plugin arguments. This keeps the runtime compatible with TiddlyWiki's Node.js boot process while preserving TypeScript source under `src/`.

For public deployments, configure read-only mode so wiki writes stay disabled while download statistics and API routes remain available.

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
   node scripts/reconcile-data.js              # Dry run (report only)
   node scripts/reconcile-data.js --fix        # Apply fixes
   node scripts/reconcile-data.js --clean-stale # Remove stale mirror files (30+ days old)
   ```

**Git workflow:**

```bash
# On each mirror, periodically:
git pull origin main                    # Get data from other mirrors
node scripts/reconcile-data.js          # Check for issues
git add data/
git commit -m "Update stats from {serverId} mirror"
git push origin main
```

**Comment IDs:** Each comment gets a unique ID in the format `{serverId}-{timestamp}-{random}` to prevent collisions across mirrors.

**Stale mirrors:** If a mirror goes offline permanently, run `node scripts/reconcile-data.js --clean-stale` to remove its files after 30 days of inactivity.

### Scheduled Plugin Fetching

To keep `wiki/files/plugin-fetched/` up to date with the latest plugin versions, schedule `scripts/fetch-plugins.js` to run periodically.

**Windows** — Use Windows Task Scheduler:
1. Create a new task that runs `node scripts/fetch-plugins.js`
2. Set the working directory to the repo root
3. Schedule it to run daily or at your preferred interval

**Linux/macOS** — Use `cron`:

```bash
# Fetch plugins daily at 3 AM
0 3 * * * cd /path/to/TiddlyWiki-CPL && node scripts/fetch-plugins.js
```

The script fetches the latest plugin JSON files and saves them to `wiki/files/plugin-fetched/`. Run it with `--dry-run` to preview what would be fetched without writing files.
