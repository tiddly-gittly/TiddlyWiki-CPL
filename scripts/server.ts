import { execSync, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { paths } from '../src/CPLServer/lib/paths';
import { ensureRuntimePluginsBuilt } from './runtime-plugins';

type ServerMode = 'dev' | 'prod' | 'readonly';

const DEFAULT_JWT_SECRET = 'default-dev-secret-change-me';

const removeDirectorySync = (targetPath: string): void => {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  // On Windows, Node's fs.rmSync often fails with ENOTEMPTY for deeply
  // nested directories (plugin-fetched-history). Use cmd for reliable removal.
  if (process.platform === 'win32') {
    try {
      execSync(`cmd /c rd /s /q "${targetPath}"`, { stdio: 'ignore' });
    } catch {
      /* already gone */
    }
    // Give Windows a moment to release handles before re-creating.
    try {
      execSync('cmd /c ping 127.0.0.1 -n 1 -w 500 > nul', { stdio: 'ignore' });
    } catch {
      /* */
    }
  } else {
    fs.rmSync(targetPath, { recursive: true, force: true });
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

  // On Windows, fs.cpSync internally calls rmdir on existing subdirectories,
  // which can fail with ENOTEMPTY. Fall back to xcopy.
  if (process.platform === 'win32') {
    try {
      fs.cpSync(paths.wiki, paths.testWiki, { recursive: true });
    } catch {
      execSync(
        `cmd /c xcopy /E /I /Y "${paths.wiki}" "${paths.testWiki}" > nul`,
        { stdio: 'ignore' },
      );
    }
  } else {
    fs.cpSync(paths.wiki, paths.testWiki, { recursive: true });
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
  if (
    !process.env.CPL_JWT_SECRET ||
    process.env.CPL_JWT_SECRET === DEFAULT_JWT_SECRET
  ) {
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
