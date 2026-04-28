const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PLUGIN_DEV_ENTRY = path.join(
  REPO_ROOT,
  'node_modules',
  'tiddlywiki-plugin-dev',
  'dist',
  'js',
  'main.js'
);
const RUNTIME_PLUGIN_DIR = path.join(REPO_ROOT, 'cache', 'runtime-plugins');
const REPO_PLUGIN_PATH = path.join(RUNTIME_PLUGIN_DIR, '$__plugins_Gk0Wk_CPL-Repo.json');
const SERVER_PLUGIN_PATH = path.join(RUNTIME_PLUGIN_DIR, '$__plugins_Gk0Wk_CPL-Server.json');

const runtimePluginFiles = {
  repoPluginPath: REPO_PLUGIN_PATH,
  serverPluginPath: SERVER_PLUGIN_PATH,
};

let hasBuiltRuntimePlugins = false;

const hasRuntimePluginOutput = () =>
  fs.existsSync(REPO_PLUGIN_PATH) && fs.existsSync(SERVER_PLUGIN_PATH);

const ensureRuntimePluginsBuilt = () => {
  if (hasBuiltRuntimePlugins && hasRuntimePluginOutput()) {
    return runtimePluginFiles;
  }

  fs.mkdirSync(RUNTIME_PLUGIN_DIR, { recursive: true });

  const buildResult = spawnSync(
    process.execPath,
    [
      PLUGIN_DEV_ENTRY,
      'build',
      '--output',
      RUNTIME_PLUGIN_DIR,
      '--wiki',
      'wiki',
      '--src',
      'src',
    ],
    {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: 'inherit',
    }
  );

  if (buildResult.status !== 0) {
    throw new Error(`Failed to build runtime plugins (exit code ${buildResult.status})`);
  }

  if (!hasRuntimePluginOutput()) {
    throw new Error('Runtime plugin build completed without producing both CPL plugin JSON files');
  }

  hasBuiltRuntimePlugins = true;
  return runtimePluginFiles;
};

module.exports = {
  ensureRuntimePluginsBuilt,
  runtimePluginFiles,
};