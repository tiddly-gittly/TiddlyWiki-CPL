import { execSync, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as fse from 'fs-extra';

import { paths } from '../src/CPLServer/lib/paths';
import { ensureRuntimePluginsBuilt } from './runtime-plugins';

type ServerMode = 'dev' | 'prod' | 'readonly';

const removeDirectorySync = (targetPath: string): void => {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  // On Windows, cmd's rd and Node's fs.rmSync often fail with ENOTEMPTY for
  // deeply-nested directories such as plugin-fetched-history. PowerShell's
  // Remove-Item handles these cases reliably, so prefer it on Windows.
  if (process.platform === 'win32') {
    try {
      execSync(
        `powershell -NoProfile -Command "try { Remove-Item -Path '${targetPath.replace(
          /'/g,
          "''",
        )}' -Recurse -Force -ErrorAction Stop } catch {}; exit 0"`,
        { stdio: 'ignore' },
      );
      if (!fs.existsSync(targetPath)) {
        return;
      }
    } catch {
      /* fall through to fs.rmSync */
    }
  }
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    /* last resort: leave it for the caller to handle */
  }
};

if (!fs.existsSync(paths.data)) {
  fs.mkdirSync(paths.data, { recursive: true });
  console.log('[CPL Server] Created data directory:', paths.data);
}

const args = process.argv.slice(2);
const port = process.env.PORT ?? '8080';
const host = process.env.HOST ?? '127.0.0.1';

let mode: ServerMode = 'dev';
if (args.includes('--prod') || args.includes('-p')) {
  mode = 'prod';
}
if (args.includes('--readonly') || args.includes('-r')) {
  mode = 'readonly';
}

const TW_ENTRY = require.resolve('tiddlywiki/tiddlywiki.js');
const { repoPluginPath, serverPluginPath } = ensureRuntimePluginsBuilt();
const toBootPluginArg = (filePath: string): string =>
  `++${path.relative(paths.projectRoot, filePath).replace(/\\/g, '/')}`;

let runtimeWikiPath = 'wiki';

function prepareTestWiki(): void {
  if (process.env.CPL_TEST_MODE !== 'true') {
    return;
  }

  removeDirectorySync(paths.testWiki);
  fs.mkdirSync(path.dirname(paths.testWiki), { recursive: true });

  // Copy the production wiki to a temporary location for tests.
  // The plugin-fetched and plugin-fetched-history directories contain
  // ~1 GB of cached plugin JSON files. Copying them on every test run
  // is unnecessary and causes multi-minute startup times on Windows.
  // Use robocopy on Windows with /XD to skip them; fall back to fs-extra
  // on other platforms.
  if (process.platform === 'win32') {
    const wikiPath = path.resolve(paths.wiki);
    const testWikiPath = path.resolve(paths.testWiki);
    const excludeDirs = [
      path.join(wikiPath, 'files', 'plugin-fetched'),
      path.join(wikiPath, 'files', 'plugin-fetched-history'),
    ];
    const robocopyArgs = [
      `"${wikiPath}"`,
      `"${testWikiPath}"`,
      '/E',
      ...excludeDirs.map(dir => `/XD "${dir}"`),
      '/NFL',
      '/NDL',
      '/NJH',
      '/NJS',
      '/R:2',
      '/W:1',
    ];
    try {
      execSync(`robocopy ${robocopyArgs.join(' ')}`, { stdio: 'ignore' });
    } catch {
      // robocopy returns non-zero for success-with-files-copied (exit codes
      // 1-7). Ignore failures here; the existence checks below will catch
      // real problems.
    }
    // Recreate the excluded dirs as empty so downstream code can still
    // write fetched-plugin caches into the test wiki if needed.
    fs.mkdirSync(path.join(testWikiPath, 'files', 'plugin-fetched'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(testWikiPath, 'files', 'plugin-fetched-history'), {
      recursive: true,
    });
  } else {
    fse.copySync(paths.wiki, paths.testWiki, { overwrite: true });
  }

  runtimeWikiPath = paths.testWiki;
  console.log(
    `[CPL Server] Test mode: using temporary wiki at ${runtimeWikiPath}`,
  );
}

prepareTestWiki();

const twArgs = [
  TW_ENTRY,
  '+plugins/tiddlywiki/filesystem',
  '+plugins/tiddlywiki/tiddlyweb',
  toBootPluginArg(serverPluginPath),
  toBootPluginArg(repoPluginPath),
];

/**
 * In test mode, inject localhost config tiddlers BEFORE TiddlyWiki loads
 * the wiki. This prevents the CPL-Repo browser client from attempting
 * external fetches on startup, which fail in CI due to CORS/network
 * restrictions. The injected tiddlers are regular user tiddlers and
 * override the plugin's shadow defaults (defaults.multids).
 */
function injectTestModeConfig(): void {
  if (process.env.CPL_TEST_MODE !== 'true') {
    return;
  }

  const publicHost = process.env.CPL_TEST_PUBLIC_HOST ?? 'localhost';
  const origin = `http://${publicHost}:${port}`;
  const repoOrigin = `${origin}/repo`;
  const tempDir = path.join(os.tmpdir(), 'cpl-test-config');
  removeDirectorySync(tempDir);
  fs.mkdirSync(tempDir, { recursive: true });

  // Write tiddler files that override the CPL-Repo client defaults.
  // Filesystem plugin loads these as user tiddlers, which take priority
  // over the plugin's shadow tiddlers from defaults.multids.
  const overrides: Record<string, string> = {
    '$:/plugins/Gk0Wk/CPL-Repo/config/current-repo': repoOrigin,
    '$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo': repoOrigin,
    '$:/plugins/Gk0Wk/CPL-Repo/config/current-server': origin,
    '$:/plugins/Gk0Wk/CPL-Repo/config/current-server-repo': repoOrigin,
    '$:/plugins/Gk0Wk/CPL-Repo/config/repos': repoOrigin,
    '$:/plugins/Gk0Wk/CPL-Repo/config/static-repos': repoOrigin,
    '$:/plugins/Gk0Wk/CPL-Repo/config/server-repos': repoOrigin,
    '$:/plugins/Gk0Wk/CPL-Repo/config/servers': origin,
  };

  if (process.env.CPL_TEST_MOCK_REPO_URL) {
    overrides['$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo'] =
      process.env.CPL_TEST_MOCK_REPO_URL;
    overrides['$:/plugins/Gk0Wk/CPL-Repo/config/repos'] =
      process.env.CPL_TEST_MOCK_REPO_URL;
    overrides['$:/plugins/Gk0Wk/CPL-Repo/config/static-repos'] =
      process.env.CPL_TEST_MOCK_REPO_URL;
  }

  for (const [title, text] of Object.entries(overrides)) {
    const filePath = path.join(
      tempDir,
      `${title.replace(/[/:<>"|?*$]/g, '_')}.tid`,
    );
    fs.writeFileSync(filePath, `title: ${title}\n\n${text}\n`, 'utf-8');
  }

  // Inject --load after the wiki path so tiddlers are loaded at wiki init
  // (tiddlywiki CLI: tiddlywiki <wiki-path> --load <dir> --listen ...)
  const wikiIndex = twArgs.indexOf(runtimeWikiPath);
  if (wikiIndex !== -1) {
    twArgs.splice(wikiIndex + 1, 0, '--load', tempDir);
  }

  console.log(`[CPL Server] Test mode: injected local config at ${origin}`);
}

twArgs.push(runtimeWikiPath, '--listen', `port=${port}`, `host=${host}`);

// Inject in test mode after the wiki path is present, so --load is inserted
// as: tiddlywiki <wiki-path> --load <dir> --listen ...
injectTestModeConfig();

if (mode === 'prod' || mode === 'readonly') {
  const secret = process.env.CPL_JWT_SECRET;
  if (!secret || secret === 'default-dev-secret-change-me') {
    console.error(
      '[CPL Server] Refusing to start read-only production server without CPL_JWT_SECRET.',
    );
    process.exit(1);
  }

  const readonlyWriter = `cpl-readonly-${crypto
    .randomBytes(12)
    .toString('hex')}`;
  // Set ACL so native tiddlyweb routes reject unauthenticated writes.
  // readers=(anon) allows anonymous read access.
  // Do NOT set username/password here: enabling basic auth would cause
  // TiddlyWiki's BasicAuthenticator to intercept Authorization: Bearer
  // headers sent to CPL API routes, breaking JWT authentication.
  twArgs.push('readers=(anon)', `writers=${readonlyWriter}`);
  console.log(
    `[CPL Server] Starting in ${mode.toUpperCase()} mode (read-only)`,
  );
} else {
  console.log('[CPL Server] Starting in DEV mode (writable)');
}

if (args.includes('--debug') || args.includes('-d')) {
  twArgs.push('debug-level=debug');
  console.log('[CPL Server] Debug mode enabled');
}

console.log(`[CPL Server] Server will start on http://${host}:${port}`);
console.log('[CPL Server] Press Ctrl+C to stop');

const twProcess = spawn(process.execPath, twArgs, {
  cwd: paths.projectRoot,
  stdio: 'inherit',
});

twProcess.on('error', (error: NodeJS.ErrnoException) => {
  console.error('[CPL Server] Failed to start:', error.message);
  if (error.code === 'ENOENT') {
    console.error(
      '[CPL Server] Make sure tiddlywiki is installed: npm install',
    );
  }
  process.exit(1);
});

twProcess.on('exit', code => {
  console.log(`[CPL Server] Server exited with code ${code}`);
  process.exit(code ?? 0);
});

process.on('SIGINT', () => {
  console.log('\n[CPL Server] Shutting down...');
  twProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n[CPL Server] Shutting down...');
  twProcess.kill('SIGTERM');
});
