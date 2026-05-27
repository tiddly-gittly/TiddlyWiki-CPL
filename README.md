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

### Deployment

See the [[Deployment]] tiddler in the wiki (`wiki/tiddlers/Deployment.tid`) for the full deployment guide, including:

- Docker quick-start and volume mounts
- Environment variables and GitHub OAuth setup
- Bare-metal setup and plugin fetch scheduling
- Multi-server / mirror deployment and data sync
- Comment system administration
