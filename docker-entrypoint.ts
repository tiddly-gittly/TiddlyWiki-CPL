/**
 * docker-entrypoint.ts
 *
 * Startup + maintenance loop for the Docker container:
 *
 *   0. Start a lightweight maintenance/loading page server (prevents 502)
 *   1. git clone (first run) or git pull (subsequent) into REPO_CACHE_DIR
 *   2. Sync wiki/tiddlers/plugin-metadata from the git cache
 *   3. Build cache/plugins static repo artifacts from currently available plugin files
 *   4. Stop maintenance server, start the TiddlyWiki server
 *   5. Run fetch-plugins in the background; rebuild static repo and restart server when done
 *   6. Every SYNC_INTERVAL_SECONDS (default: 3600), repeat steps 1-2-5-restart
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
const HISTORY_DIR = path.join(
  APP_DIR,
  'wiki',
  'files',
  'plugin-fetched-history',
);
const REPO_URL = 'https://github.com/tiddly-gittly/TiddlyWiki-CPL.git';
const TSNODEPATH = path.join(APP_DIR, 'node_modules/.bin/ts-node');
const SYNC_INTERVAL_SECONDS = Number(process.env.SYNC_INTERVAL_SECONDS ?? 3600);
const DIST_CPL_PLUGIN_FILES = [
  '$__plugins_Gk0Wk_CPL-Repo.json',
  '$__plugins_Gk0Wk_CPL-Server.json',
];
const BUILD_STATUS_FILE = '/tmp/cpl-build-status.json';
const MAINTENANCE_PID_FILE = '/tmp/cpl-maintenance-server.pid';
const MAINTENANCE_FLAG_FILE = '/tmp/cpl-maintenance-active';

// ---------------------------------------------------------------------------
// Build status tracking
// ---------------------------------------------------------------------------

function updateBuildStatus(phase: string, message?: string): void {
  try {
    const status = {
      phase,
      message: message ?? '',
      startedAt: new Date().toISOString(),
    };
    fs.writeFileSync(BUILD_STATUS_FILE, JSON.stringify(status), 'utf-8');
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Maintenance server (prevents 502 during startup)
// ---------------------------------------------------------------------------

let maintenanceProcess: ChildProcess | null = null;

function startMaintenanceServer(): void {
  console.log('[entrypoint] Starting maintenance loading page on :8081...');
  updateBuildStatus('starting', 'Initializing server...');
  // Write flag file so nginx knows to proxy to maintenance backend
  fs.writeFileSync(MAINTENANCE_FLAG_FILE, '1', 'utf-8');
  maintenanceProcess = spawn(
    TSNODEPATH,
    ['--transpile-only', 'scripts/maintenance-server.ts'],
    {
      stdio: 'inherit',
      cwd: APP_DIR,
      detached: false,
    },
  );
  // Give it a moment to bind the port
  spawnSync('sleep', ['1']);
  console.log('[entrypoint] Maintenance server started on :8081.');
}

function stopMaintenanceServer(): void {
  // Remove flag file so nginx switches to TiddlyWiki backend
  try {
    fs.unlinkSync(MAINTENANCE_FLAG_FILE);
  } catch {
    /* ok */
  }

  if (!maintenanceProcess) {
    // Try to kill by PID file
    try {
      if (fs.existsSync(MAINTENANCE_PID_FILE)) {
        const pid = parseInt(
          fs.readFileSync(MAINTENANCE_PID_FILE, 'utf-8').trim(),
          10,
        );
        if (!isNaN(pid)) {
          process.kill(pid, 'SIGTERM');
        }
      }
    } catch {
      /* already dead */
    }
    return;
  }
  console.log('[entrypoint] Stopping maintenance server...');
  maintenanceProcess.removeAllListeners('exit');
  try {
    maintenanceProcess.kill('SIGTERM');
  } catch {
    /* already dead */
  }
  maintenanceProcess = null;
  // Clean up PID file
  try {
    fs.unlinkSync(MAINTENANCE_PID_FILE);
  } catch {
    /* ok */
  }
}

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

function hasBuiltCplPluginDist(): boolean {
  return DIST_CPL_PLUGIN_FILES.every(fileName =>
    fs.existsSync(path.join(APP_DIR, 'dist', fileName)),
  );
}

function ensureCplPluginDist(): boolean {
  if (hasBuiltCplPluginDist()) {
    return true;
  }

  console.log('[entrypoint] Building CPL plugin dist artifacts...');
  return run('pnpm run build');
}

/**
 * Build cache/plugins asynchronously via spawn (non-blocking).
 * Calls onDone when complete, regardless of success/failure.
 */
function buildStaticRepoAsync(onDone: () => void): void {
  if (!ensureCplPluginDist()) {
    console.warn(
      '[entrypoint] WARNING: cannot build static repo because plugin dist build failed.',
    );
    onDone();
    return;
  }

  updateBuildStatus('building', 'Building plugin library (cache/plugins)...');
  console.log(
    '[entrypoint] Building cache/plugins static repo artifacts (async)...',
  );
  const proc = spawn('pnpm', ['run', 'build:static-library'], {
    stdio: 'inherit',
    cwd: APP_DIR,
  });
  proc.on('exit', code => {
    if (code !== 0) {
      console.warn(
        `[entrypoint] WARNING: static repo build failed with code ${code}. /repo/* may be unavailable.`,
      );
    } else {
      console.log('[entrypoint] cache/plugins static repo build OK.');
    }
    onDone();
  });
}

// ---------------------------------------------------------------------------
// git clone / pull + async metadata sync
// ---------------------------------------------------------------------------

function gitSync(): void {
  const isFirstRun = !fs.existsSync(path.join(REPO_CACHE_DIR, '.git'));
  if (isFirstRun) {
    updateBuildStatus('syncing', 'Cloning plugin repository...');
    console.log(`[entrypoint] First run: cloning ${REPO_URL} ...`);
    if (!run(`git clone --depth=1 ${REPO_URL} ${REPO_CACHE_DIR}`)) {
      console.warn(
        '[entrypoint] WARNING: git clone failed. Using baked-in metadata.',
      );
      return;
    }
    console.log('[entrypoint] git clone OK');
  } else {
    updateBuildStatus('syncing', 'Updating plugin metadata...');
    if (!run('git pull --ff-only --quiet', REPO_CACHE_DIR)) {
      console.warn(
        '[entrypoint] WARNING: git pull failed. Continuing with cached data.',
      );
    } else {
      console.log('[entrypoint] git pull OK');
    }
  }
}

function syncPluginMetadataAsync(onDone: () => void): void {
  const src = path.join(REPO_CACHE_DIR, 'wiki', 'tiddlers', 'plugin-metadata');
  const dest = path.join(APP_DIR, 'wiki', 'tiddlers', 'plugin-metadata');
  if (!fs.existsSync(src)) {
    console.warn(
      '[entrypoint] plugin-metadata source missing; using baked metadata.',
    );
    onDone();
    return;
  }

  updateBuildStatus('syncing', 'Syncing plugin metadata...');
  fs.mkdirSync(dest, { recursive: true });
  console.log('[entrypoint] Syncing plugin-metadata in background...');
  const proc = spawn('cp', ['-a', `${src}/.`, dest], {
    stdio: 'inherit',
    cwd: APP_DIR,
  });
  proc.on('error', error => {
    console.warn(
      `[entrypoint] WARNING: plugin-metadata sync failed to start: ${error.message}`,
    );
    onDone();
  });
  proc.on('exit', code => {
    if (code !== 0) {
      console.warn(
        `[entrypoint] WARNING: plugin-metadata sync failed with code ${code}. Using baked metadata.`,
      );
    } else {
      console.log('[entrypoint] plugin-metadata synced OK');
    }
    onDone();
  });
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let serverProcess: ChildProcess | null = null;

function startServer(): void {
  console.log('[entrypoint] Starting CPL server...');
  serverProcess = spawn(
    TSNODEPATH,
    ['--transpile-only', 'scripts/server.ts', '--prod'],
    {
      stdio: 'inherit',
      cwd: APP_DIR,
    },
  );
  serverProcess.on('exit', code => {
    if (code !== null && code !== 0) {
      console.error(
        `[entrypoint] Server exited unexpectedly with code ${code}. Restarting in 5 seconds...`,
      );
      // Brief back-off to avoid tight crash-loop.
      setTimeout(() => {
        startServer();
      }, 5000);
      return;
    }
    console.error(
      `[entrypoint] Server exited with code ${code}. Exiting container.`,
    );
    process.exit(code ?? 1);
  });
}

function restartServer(): void {
  if (!serverProcess) {
    startServer();
    return;
  }
  console.log('[entrypoint] Restarting server to pick up updated plugins...');
  serverProcess.removeAllListeners('exit');
  serverProcess.kill('SIGTERM');
  serverProcess.on('close', () => {
    startServer();
  });
}

// ---------------------------------------------------------------------------
// fetch-plugins (background) -> restart server when done
// ---------------------------------------------------------------------------

function runFetchPlugins(onDone: () => void, force = false): void {
  updateBuildStatus('fetching', 'Downloading plugin data from sources...');
  console.log('[entrypoint] Starting background plugin fetch...');
  const args = ['--transpile-only', 'scripts/fetch-plugins.ts'];
  if (force) {
    args.push('--force');
  }
  const proc = spawn(TSNODEPATH, args, {
    stdio: 'inherit',
    cwd: APP_DIR,
  });
  proc.on('exit', code => {
    if (code !== 0) {
      console.warn(
        `[entrypoint] WARNING: fetch-plugins exited with code ${code}.`,
      );
    } else {
      console.log('[entrypoint] fetch-plugins completed OK.');
    }
    buildStaticRepoAsync(onDone);
  });
}

// ---------------------------------------------------------------------------
// Periodic sync loop
// ---------------------------------------------------------------------------

function scheduleSync(): void {
  if (SYNC_INTERVAL_SECONDS <= 0) {
    console.log(
      '[entrypoint] Periodic sync disabled (SYNC_INTERVAL_SECONDS=0).',
    );
    return;
  }
  console.log(
    `[entrypoint] Periodic sync scheduled every ${SYNC_INTERVAL_SECONDS}s.`,
  );
  setInterval(() => {
    console.log('[entrypoint] === Periodic sync start ===');
    gitSync();
    syncPluginMetadataAsync(() => {
      runFetchPlugins(() => {
        console.log(
          '[entrypoint] Periodic sync complete. Restarting server...',
        );
        updateBuildStatus('rebuilding', 'Rebuilding with fetched plugins...');
        restartServer();
        setTimeout(() => {
          updateBuildStatus('idle', 'Server is running');
        }, 5000);
      }, true); /* force=true — always re-download to pick up latest plugin versions */
    });
  }, SYNC_INTERVAL_SECONDS * 1000);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Ensure runtime directories exist (Dockerfile creates them, but volume mounts
// may replace them with empty dirs on first run).
fs.mkdirSync(path.join(APP_DIR, 'wiki', 'files', 'plugin-fetched'), {
  recursive: true,
});
fs.mkdirSync(HISTORY_DIR, { recursive: true });

// 0. Start maintenance/loading page server immediately (prevents 502 errors)
startMaintenanceServer();

// 1. git clone / pull into repo-cache. Metadata sync happens in background.
// Failures are non-fatal: the server will start with baked-in metadata.
gitSync();

// 2. Start the server immediately with whatever cache/plugins already exists.
//    build:static-library runs in background and will restart server when done.
updateBuildStatus('ready', 'Server is starting...');
stopMaintenanceServer();
startServer();

// Mark as idle once server is up
setTimeout(() => {
  updateBuildStatus('idle', 'Server is running');
}, 5000);

// 3. Sync latest metadata and run build:static-library in background,
//    then fetch plugins and restart server.
syncPluginMetadataAsync(() => {
  buildStaticRepoAsync(() => {
    runFetchPlugins(() => {
      updateBuildStatus('rebuilding', 'Rebuilding with fetched plugins...');
      restartServer();
      setTimeout(() => {
        updateBuildStatus('idle', 'Server is running');
      }, 5000);
    });
  });
});

// 4. Schedule periodic sync + restart
scheduleSync();
