/**
 * docker-entrypoint.ts
 *
 * Startup + maintenance loop for the Docker container:
 *
 *   1. git clone (first run) or git pull (subsequent) into REPO_CACHE_DIR
 *   2. Sync wiki/tiddlers/plugin-metadata from the git cache
 *   3. Start the TiddlyWiki server immediately
 *   4. Run fetch-plugins in the background; restart server when done
 *   5. Every SYNC_INTERVAL_SECONDS (default: 3600), repeat steps 1-2-4-restart
 *
 * Environment variables:
 *   SYNC_INTERVAL_SECONDS  – how often to sync git + re-fetch plugins (default: 3600)
 *                            set to 0 to disable periodic sync
 */

import { spawnSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const APP_DIR = path.resolve(__dirname);
const REPO_CACHE_DIR = path.join(APP_DIR, 'repo-cache');
const REPO_URL = 'https://github.com/tiddly-gittly/TiddlyWiki-CPL.git';
const TSNODEPATH = path.join(APP_DIR, 'node_modules/.bin/ts-node');
const SYNC_INTERVAL_SECONDS = Number(process.env.SYNC_INTERVAL_SECONDS ?? 3600);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string, cwd = APP_DIR): boolean {
  console.log(`[entrypoint] $ ${cmd}`);
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd });
  if (result.status !== 0) {
    console.warn(`[entrypoint] WARNING: exited with ${result.status}`);
    return false;
  }
  return true;
}

function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

// ---------------------------------------------------------------------------
// git clone / pull + metadata sync
// ---------------------------------------------------------------------------

function gitSync(): void {
  const isFirstRun = !fs.existsSync(path.join(REPO_CACHE_DIR, '.git'));
  if (isFirstRun) {
    console.log(`[entrypoint] First run: cloning ${REPO_URL} ...`);
    if (!run(`git clone --depth=1 ${REPO_URL} ${REPO_CACHE_DIR}`)) {
      console.warn('[entrypoint] WARNING: git clone failed. Using baked-in metadata.');
      return;
    }
    console.log('[entrypoint] git clone OK');
  } else {
    if (!run('git pull --ff-only --quiet', REPO_CACHE_DIR)) {
      console.warn('[entrypoint] WARNING: git pull failed. Continuing with cached data.');
    } else {
      console.log('[entrypoint] git pull OK');
    }
  }
  const src = path.join(REPO_CACHE_DIR, 'wiki', 'tiddlers', 'plugin-metadata');
  const dest = path.join(APP_DIR, 'wiki', 'tiddlers', 'plugin-metadata');
  if (fs.existsSync(src)) {
    copyDir(src, dest);
    console.log('[entrypoint] plugin-metadata synced OK');
  }
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let serverProcess: ChildProcess | null = null;

function startServer(): void {
  console.log('[entrypoint] Starting CPL server...');
  serverProcess = spawn(TSNODEPATH, ['--transpile-only', 'scripts/server.ts', '--prod'], {
    stdio: 'inherit',
    cwd: APP_DIR,
  });
  serverProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[entrypoint] Server exited unexpectedly with code ${code}. Exiting container.`);
      process.exit(code);
    }
  });
}

function restartServer(): void {
  if (!serverProcess) { startServer(); return; }
  console.log('[entrypoint] Restarting server to pick up updated plugins...');
  serverProcess.removeAllListeners('exit');
  serverProcess.kill('SIGTERM');
  serverProcess.on('close', () => { startServer(); });
}

// ---------------------------------------------------------------------------
// fetch-plugins (background) -> restart server when done
// ---------------------------------------------------------------------------

function runFetchPlugins(onDone: () => void): void {
  console.log('[entrypoint] Starting background plugin fetch...');
  const proc = spawn(TSNODEPATH, ['--transpile-only', 'scripts/fetch-plugins.ts'], {
    stdio: 'inherit',
    cwd: APP_DIR,
  });
  proc.on('exit', (code) => {
    if (code !== 0) {
      console.warn(`[entrypoint] WARNING: fetch-plugins exited with code ${code}.`);
    } else {
      console.log('[entrypoint] fetch-plugins completed OK.');
    }
    onDone();
  });
}

// ---------------------------------------------------------------------------
// Periodic sync loop
// ---------------------------------------------------------------------------

function scheduleSync(): void {
  if (SYNC_INTERVAL_SECONDS <= 0) {
    console.log('[entrypoint] Periodic sync disabled (SYNC_INTERVAL_SECONDS=0).');
    return;
  }
  console.log(`[entrypoint] Periodic sync scheduled every ${SYNC_INTERVAL_SECONDS}s.`);
  setInterval(() => {
    console.log('[entrypoint] === Periodic sync start ===');
    gitSync();
    runFetchPlugins(() => {
      console.log('[entrypoint] Periodic sync complete. Restarting server...');
      restartServer();
    });
  }, SYNC_INTERVAL_SECONDS * 1000);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// 1. git clone / pull + metadata sync (blocking, so server starts with latest metadata)
// Failures are non-fatal: the server will start with baked-in metadata.
gitSync();

// 2. Start server immediately
startServer();

// 3. Fetch plugins in background; restart server when done so it loads them
runFetchPlugins(() => {
  restartServer();
});

// 4. Schedule periodic sync + restart
scheduleSync();
