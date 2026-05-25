import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { ensureRuntimePluginsBuilt } from './runtime-plugins';

type ServerMode = 'dev' | 'prod' | 'readonly';

const WIKI_PATH = path.resolve(__dirname, '..');
const DATA_DIR = path.join(WIKI_PATH, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('[CPL Server] Created data directory:', DATA_DIR);
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
const toBootPluginArg = (filePath: string): string => `++${path.relative(WIKI_PATH, filePath).replace(/\\/g, '/')}`;

const twArgs = [
  TW_ENTRY,
  '+plugins/tiddlywiki/filesystem',
  '+plugins/tiddlywiki/tiddlyweb',
  toBootPluginArg(serverPluginPath),
  toBootPluginArg(repoPluginPath),
  'wiki',
  '--listen',
  `port=${port}`,
  `host=${host}`,
];

if (mode === 'prod' || mode === 'readonly') {
  twArgs.push('writers=(anon)');
  console.log(`[CPL Server] Starting in ${mode.toUpperCase()} mode (read-only)`);
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
  cwd: WIKI_PATH,
  stdio: 'inherit',
});

twProcess.on('error', (error: NodeJS.ErrnoException) => {
  console.error('[CPL Server] Failed to start:', error.message);
  if (error.code === 'ENOENT') {
    console.error('[CPL Server] Make sure tiddlywiki is installed: npm install');
  }
  process.exit(1);
});

twProcess.on('exit', (code) => {
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