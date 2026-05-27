/**
 * docker-entrypoint.ts
 *
 * Startup sequence for the Docker container (run via ts-node --transpile-only):
 *   1. git clone / git pull  — keep wiki metadata up-to-date from GitHub
 *   2. fetch-plugins         — download actual plugin JSON files
 *   3. scripts/server.ts     — build runtime plugins, start TiddlyWiki
 *
 * The git repo is cloned into REPO_CACHE_DIR (a volume-mounted path) so it
 * persists across container restarts.  This keeps the image small: .git history
 * is never baked in; only the source snapshot is copied at build time.
 *
 * Steps 1 and 2 are best-effort — a failure prints a warning and does NOT
 * block server startup.
 */

import { spawnSync, SpawnSyncOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const APP_DIR = path.resolve(__dirname);
const REPO_CACHE_DIR = path.join(APP_DIR, 'repo-cache');
const REPO_URL = 'https://github.com/tiddly-gittly/TiddlyWiki-CPL.git';

/** Run a command, print it, return whether it succeeded. */
function $(cmd: string, opts: SpawnSyncOptions & { ignoreError?: boolean } = {}): boolean {
  console.log(`[entrypoint] $ ${cmd}`);
  const { ignoreError, ...spawnOpts } = opts;
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: APP_DIR, ...spawnOpts });
  if (result.status !== 0) {
    if (!ignoreError) console.warn(`[entrypoint] WARNING: command exited with ${result.status}`);
    return false;
  }
  return true;
}

/** Recursively copy src → dest, overwriting existing files. */
function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. git clone (first run) or git pull (subsequent runs)
// ---------------------------------------------------------------------------
console.log('[entrypoint] Updating wiki metadata from git...');
const isFirstRun = !fs.existsSync(path.join(REPO_CACHE_DIR, '.git'));

if (isFirstRun) {
  console.log(`[entrypoint] First run: cloning ${REPO_URL} …`);
  const ok = $(`git clone --depth=1 ${REPO_URL} ${REPO_CACHE_DIR}`, { ignoreError: true });
  if (!ok) {
    console.warn('[entrypoint] WARNING: git clone failed. Using baked-in wiki metadata.');
  } else {
    console.log('[entrypoint] git clone OK');
  }
} else {
  const ok = $('git pull --ff-only --quiet', { cwd: REPO_CACHE_DIR, ignoreError: true });
  if (!ok) {
    console.warn('[entrypoint] WARNING: git pull failed. Continuing with cached data.');
  } else {
    console.log('[entrypoint] git pull OK');
  }
}

// Sync plugin-metadata (committed tiddler metadata) from the git cache into the
// running wiki.  Skip if the clone failed and REPO_CACHE_DIR doesn't exist.
const repoMetaDir = path.join(REPO_CACHE_DIR, 'wiki', 'tiddlers', 'plugin-metadata');
const appMetaDir = path.join(APP_DIR, 'wiki', 'tiddlers', 'plugin-metadata');
if (fs.existsSync(repoMetaDir)) {
  console.log('[entrypoint] Syncing plugin-metadata from git cache...');
  copyDir(repoMetaDir, appMetaDir);
  console.log('[entrypoint] plugin-metadata synced OK');
}

// ---------------------------------------------------------------------------
// 2. fetch-plugins — run in the background, don't block server startup
// ---------------------------------------------------------------------------
console.log('[entrypoint] Starting background plugin fetch...');
const fetchProc = require('child_process').spawn(
  path.join(APP_DIR, 'node_modules/.bin/ts-node'),
  ['--transpile-only', path.join(APP_DIR, 'scripts/fetch-plugins.ts')],
  { stdio: 'inherit', cwd: APP_DIR, detached: false },
);
fetchProc.on('exit', (code: number | null) => {
  if (code !== 0) {
    console.warn(`[entrypoint] WARNING: fetch-plugins exited with code ${code}. Plugin data may be incomplete.`);
  } else {
    console.log('[entrypoint] fetch-plugins completed OK.');
  }
});

// ---------------------------------------------------------------------------
// 3. start server immediately (don't wait for fetch-plugins)
// ---------------------------------------------------------------------------
console.log('[entrypoint] Starting CPL server...');
const server = spawnSync(
  path.join(APP_DIR, 'node_modules/.bin/ts-node'),
  ['--transpile-only', path.join(APP_DIR, 'scripts/server.ts'), '--prod'],
  { stdio: 'inherit', cwd: APP_DIR },
);
process.exit(server.status ?? 1);
