#!/usr/bin/env node

/**
 * CPL Server Launcher
 * 
 * This script provides an easy way to start the CPL server with various configurations.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ensureRuntimePluginsBuilt } = require('./runtime-plugins');

// Configuration
const WIKI_PATH = path.resolve(__dirname, '..');
const DATA_DIR = path.join(WIKI_PATH, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('[CPL Server] Created data directory:', DATA_DIR);
}

// Parse command line arguments
const args = process.argv.slice(2);
const port = process.env.PORT || '8080';
const host = process.env.HOST || '127.0.0.1';

// Determine mode
let mode = 'dev';
if (args.includes('--prod') || args.includes('-p')) {
  mode = 'prod';
}
if (args.includes('--readonly') || args.includes('-r')) {
  mode = 'readonly';
}

const TW_ENTRY = require.resolve('tiddlywiki/tiddlywiki.js');
const { repoPluginPath, serverPluginPath } = ensureRuntimePluginsBuilt();

// Copy runtime plugins into wiki tiddlers so they load before execStartup()
const tiddlersDir = path.join(WIKI_PATH, 'wiki', 'tiddlers');
fs.mkdirSync(tiddlersDir, { recursive: true });
for (const pluginPath of [repoPluginPath, serverPluginPath]) {
  const dest = path.join(tiddlersDir, path.basename(pluginPath));
  fs.copyFileSync(pluginPath, dest);
  console.log(`[CPL Server] Copied plugin to tiddlers: ${path.basename(pluginPath)}`);
}

// Build tiddlywiki command
const twArgs = [
  TW_ENTRY,
  '+plugins/tiddlywiki/filesystem',
  '+plugins/tiddlywiki/tiddlyweb',
  'wiki',
  '--listen',
  `port=${port}`,
  `host=${host}`
];

// Add authentication if in prod/readonly mode
if (mode === 'prod' || mode === 'readonly') {
  twArgs.push('writers=(anon)');
  console.log(`[CPL Server] Starting in ${mode.toUpperCase()} mode (read-only)`);
} else {
  console.log('[CPL Server] Starting in DEV mode (writable)');
}

// Add debug level if requested
if (args.includes('--debug') || args.includes('-d')) {
  twArgs.push('debug-level=debug');
  console.log('[CPL Server] Debug mode enabled');
}

console.log(`[CPL Server] Server will start on http://${host}:${port}`);
console.log('[CPL Server] Press Ctrl+C to stop');

// Start tiddlywiki
const twProcess = spawn(process.execPath, twArgs, {
  cwd: WIKI_PATH,
  stdio: 'inherit'
});

// Handle process events
twProcess.on('error', (err) => {
  console.error('[CPL Server] Failed to start:', err.message);
  if (err.code === 'ENOENT') {
    console.error('[CPL Server] Make sure tiddlywiki is installed: npm install');
  }
  process.exit(1);
});

twProcess.on('exit', (code) => {
  console.log(`[CPL Server] Server exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[CPL Server] Shutting down...');
  twProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n[CPL Server] Shutting down...');
  twProcess.kill('SIGTERM');
});
