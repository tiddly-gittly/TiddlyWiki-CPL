import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface RuntimePluginFiles {
  repoPluginPath: string;
  serverPluginPath: string;
}

interface PackedPluginJson {
  text: string;
  type?: string;
  [key: string]: unknown;
}

interface PackedTiddler {
  title: string;
  text?: string;
  type?: string;
  [key: string]: unknown;
}

interface PackedPluginText {
  tiddlers: Record<string, PackedTiddler>;
}

type RuntimePluginName = 'repo' | 'server';

const REPO_ROOT = path.resolve(process.cwd());
const PLUGIN_DEV_ENTRY = path.join(
  REPO_ROOT,
  'node_modules',
  'tiddlywiki-plugin-dev',
  'dist',
  'js',
  'main.js',
);
const RUNTIME_PLUGIN_DIR = path.join(REPO_ROOT, 'cache', 'runtime-plugins');
const REPO_PLUGIN_PATH = path.join(RUNTIME_PLUGIN_DIR, '$__plugins_Gk0Wk_CPL-Repo.json');
const SERVER_PLUGIN_PATH = path.join(RUNTIME_PLUGIN_DIR, '$__plugins_Gk0Wk_CPL-Server.json');

const RUNTIME_PLUGIN_DIRS_ROOT = path.join(REPO_ROOT, 'cache', 'runtime-plugin-dirs');
const SERVER_PLUGIN_DIR = path.join(RUNTIME_PLUGIN_DIRS_ROOT, 'CPL-Server');
const REPO_PLUGIN_DIR = path.join(RUNTIME_PLUGIN_DIRS_ROOT, 'CPL-Repo');

const runtimePluginFiles: RuntimePluginFiles = {
  repoPluginPath: REPO_PLUGIN_DIR,
  serverPluginPath: SERVER_PLUGIN_DIR,
};

let hasBuiltRuntimePlugins = false;

const hasRuntimePluginOutput = (): boolean =>
  fs.existsSync(path.join(SERVER_PLUGIN_DIR, 'plugin.info')) &&
  fs.existsSync(path.join(REPO_PLUGIN_DIR, 'plugin.info'));

function extractPluginJsonToDir(jsonPath: string, outDir: string): void {
  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as PackedPluginJson;
  const parsedText = JSON.parse(json.text) as PackedPluginText;
  const tiddlers = parsedText.tiddlers ?? {};

  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  const pluginInfo = { ...json };
  delete pluginInfo.text;
  delete pluginInfo.type;
  fs.writeFileSync(path.join(outDir, 'plugin.info'), JSON.stringify(pluginInfo, null, 2));

  for (const tiddler of Object.values(tiddlers)) {
    const safeBase = tiddler.title.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (tiddler.type === 'application/javascript') {
      fs.writeFileSync(path.join(outDir, `${safeBase}.js`), tiddler.text ?? '');

      const meta = { ...tiddler };
      delete meta.text;
      const metaLines = Object.entries(meta)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join('\n');
      fs.writeFileSync(path.join(outDir, `${safeBase}.js.meta`), metaLines);
      continue;
    }

    const fields = { ...tiddler };
    const text = typeof fields.text === 'string' ? fields.text : '';
    delete fields.text;
    const header = Object.entries(fields)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('\n');
    fs.writeFileSync(path.join(outDir, `${safeBase}.tid`), `${header}\n\n${text}`);
  }
}

function ensureRuntimePluginsBuilt(): RuntimePluginFiles {
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
    },
  );

  if (buildResult.status !== 0) {
    throw new Error(`Failed to build runtime plugins (exit code ${buildResult.status ?? 'unknown'})`);
  }

  if (!fs.existsSync(REPO_PLUGIN_PATH) || !fs.existsSync(SERVER_PLUGIN_PATH)) {
    throw new Error('Runtime plugin build completed without producing both CPL plugin JSON files');
  }

  fs.mkdirSync(RUNTIME_PLUGIN_DIRS_ROOT, { recursive: true });
  extractPluginJsonToDir(SERVER_PLUGIN_PATH, SERVER_PLUGIN_DIR);
  extractPluginJsonToDir(REPO_PLUGIN_PATH, REPO_PLUGIN_DIR);

  if (!hasRuntimePluginOutput()) {
    throw new Error('Failed to extract runtime plugins to directory format');
  }

  hasBuiltRuntimePlugins = true;
  return runtimePluginFiles;
}

function getRuntimePluginTiddlers(pluginName: RuntimePluginName): Record<string, PackedTiddler> {
  ensureRuntimePluginsBuilt();

  const pluginPath = pluginName === 'repo' ? REPO_PLUGIN_PATH : SERVER_PLUGIN_PATH;
  const json = JSON.parse(fs.readFileSync(pluginPath, 'utf8')) as PackedPluginJson;
  const parsedText = JSON.parse(json.text) as PackedPluginText;

  return parsedText.tiddlers ?? {};
}

export { ensureRuntimePluginsBuilt, getRuntimePluginTiddlers, runtimePluginFiles };