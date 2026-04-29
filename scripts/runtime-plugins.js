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

// TiddlyWiki plugin directory paths (for +dir boot loading)
const RUNTIME_PLUGIN_DIRS_ROOT = path.join(REPO_ROOT, 'cache', 'runtime-plugin-dirs');
const SERVER_PLUGIN_DIR = path.join(RUNTIME_PLUGIN_DIRS_ROOT, 'CPL-Server');
const REPO_PLUGIN_DIR = path.join(RUNTIME_PLUGIN_DIRS_ROOT, 'CPL-Repo');

const runtimePluginFiles = {
  repoPluginPath: REPO_PLUGIN_DIR,
  serverPluginPath: SERVER_PLUGIN_DIR,
};

let hasBuiltRuntimePlugins = false;

const hasRuntimePluginOutput = () =>
  fs.existsSync(path.join(SERVER_PLUGIN_DIR, 'plugin.info')) &&
  fs.existsSync(path.join(REPO_PLUGIN_DIR, 'plugin.info'));

/**
 * Extract a packed plugin JSON file into a TiddlyWiki plugin directory structure.
 * TiddlyWiki's loadPluginFolder() only handles directories, not JSON files,
 * so we must unpack the JSON into a directory with plugin.info + individual tiddler files.
 */
const extractPluginJsonToDir = (jsonPath, outDir) => {
  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const tiddlers = JSON.parse(json.text).tiddlers;

  // Clean and recreate the output directory
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  // Write plugin.info (exclude `text` and `type` - those are reconstructed by loadPluginFolder)
  const pluginInfo = Object.assign({}, json);
  delete pluginInfo.text;
  delete pluginInfo.type;
  fs.writeFileSync(path.join(outDir, 'plugin.info'), JSON.stringify(pluginInfo, null, 2));

  // Write each tiddler as its own file pair (.js + .js.meta) or .tid
  for (const tiddler of Object.values(tiddlers)) {
    // Create a safe filename from the tiddler title
    const safeBase = tiddler.title.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (tiddler.type === 'application/javascript') {
      // Write JS content file
      fs.writeFileSync(path.join(outDir, safeBase + '.js'), tiddler.text || '');
      // Write meta file with all fields except text
      const meta = Object.assign({}, tiddler);
      delete meta.text;
      const metaLines = Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n');
      fs.writeFileSync(path.join(outDir, safeBase + '.js.meta'), metaLines);
    } else {
      // Write as .tid file
      const fields = Object.assign({}, tiddler);
      const text = fields.text || '';
      delete fields.text;
      const header = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
      fs.writeFileSync(path.join(outDir, safeBase + '.tid'), header + '\n\n' + text);
    }
  }
};

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

  if (!fs.existsSync(REPO_PLUGIN_PATH) || !fs.existsSync(SERVER_PLUGIN_PATH)) {
    throw new Error('Runtime plugin build completed without producing both CPL plugin JSON files');
  }

  // Extract packed plugin JSONs to TW plugin directories so loadPluginFolder() can load them
  fs.mkdirSync(RUNTIME_PLUGIN_DIRS_ROOT, { recursive: true });
  extractPluginJsonToDir(SERVER_PLUGIN_PATH, SERVER_PLUGIN_DIR);
  extractPluginJsonToDir(REPO_PLUGIN_PATH, REPO_PLUGIN_DIR);

  if (!hasRuntimePluginOutput()) {
    throw new Error('Failed to extract runtime plugins to directory format');
  }

  hasBuiltRuntimePlugins = true;
  return runtimePluginFiles;
};

module.exports = {
  ensureRuntimePluginsBuilt,
  runtimePluginFiles,
};