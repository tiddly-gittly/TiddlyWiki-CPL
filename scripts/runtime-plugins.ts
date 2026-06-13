import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { rimrafSync } from 'rimraf';
import { paths } from '../src/CPLServer/lib/paths';

interface RuntimePluginFiles {
  repoPluginPath: string;
  serverPluginPath: string;
}

interface PackedPluginJson {
  text?: string;
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

const PLUGIN_DEV_ENTRY = path.join(
  paths.projectRoot,
  'node_modules',
  'tiddlywiki-plugin-dev',
  'dist',
  'js',
  'main.js',
);
const RUNTIME_PLUGIN_DIR = paths.cache.runtimePlugins;
const REPO_PLUGIN_PATH = path.join(
  RUNTIME_PLUGIN_DIR,
  '$__plugins_Gk0Wk_CPL-Repo.json',
);
const SERVER_PLUGIN_PATH = path.join(
  RUNTIME_PLUGIN_DIR,
  '$__plugins_Gk0Wk_CPL-Server.json',
);

const RUNTIME_PLUGIN_DIRS_ROOT = paths.cache.runtimePluginDirs;
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
  const json = JSON.parse(
    fs.readFileSync(jsonPath, 'utf8'),
  ) as PackedPluginJson;
  if (typeof json.text !== 'string') {
    throw new Error(`Packed plugin ${jsonPath} is missing plugin text`);
  }
  const parsedText = JSON.parse(json.text) as PackedPluginText;
  const tiddlers = parsedText.tiddlers ?? {};

  if (fs.existsSync(outDir)) {
    rimrafSync(outDir);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const pluginInfo = { ...json };
  delete pluginInfo.text;
  delete pluginInfo.type;
  fs.writeFileSync(
    path.join(outDir, 'plugin.info'),
    JSON.stringify(pluginInfo, null, 2),
  );

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
    fs.writeFileSync(
      path.join(outDir, `${safeBase}.tid`),
      `${header}\n\n${text}`,
    );
  }
}

function ensureRuntimePluginsBuilt(): RuntimePluginFiles {
  const isTestMode = process.env.CPL_TEST_MODE === 'true';
  const forceRebuild = process.env.CPL_FORCE_RUNTIME_REBUILD === 'true';

  // Use pre-built dist plugins when available. This avoids the heavy
  // tiddlywiki-plugin-dev rebuild during E2E/API server startup, where
  // TypeScript's typesInstaller can hang on Windows. The dist artifacts are
  // produced by `pnpm run build` and are up-to-date when tests run in CI.
  const distRepoPath = path.join(
    paths.projectRoot,
    'dist',
    '$__plugins_Gk0Wk_CPL-Repo.json',
  );
  const distServerPath = path.join(
    paths.projectRoot,
    'dist',
    '$__plugins_Gk0Wk_CPL-Server.json',
  );
  if (
    !forceRebuild &&
    fs.existsSync(distRepoPath) &&
    fs.existsSync(distServerPath)
  ) {
    fs.mkdirSync(RUNTIME_PLUGIN_DIR, { recursive: true });
    fs.copyFileSync(distRepoPath, REPO_PLUGIN_PATH);
    fs.copyFileSync(distServerPath, SERVER_PLUGIN_PATH);
  } else if (
    !isTestMode &&
    hasBuiltRuntimePlugins &&
    hasRuntimePluginOutput()
  ) {
    return runtimePluginFiles;
  } else {
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
        cwd: paths.projectRoot,
        env: process.env,
        stdio: 'inherit',
      },
    );

    if (buildResult.status !== 0) {
      throw new Error(
        `Failed to build runtime plugins (exit code ${
          buildResult.status ?? 'unknown'
        })`,
      );
    }
  }

  if (!fs.existsSync(REPO_PLUGIN_PATH) || !fs.existsSync(SERVER_PLUGIN_PATH)) {
    throw new Error(
      'Runtime plugin build completed without producing both CPL plugin JSON files',
    );
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

function getRuntimePluginTiddlers(
  pluginName: RuntimePluginName,
): Record<string, PackedTiddler> {
  ensureRuntimePluginsBuilt();

  const pluginPath =
    pluginName === 'repo' ? REPO_PLUGIN_PATH : SERVER_PLUGIN_PATH;
  const json = JSON.parse(
    fs.readFileSync(pluginPath, 'utf8'),
  ) as PackedPluginJson;
  if (typeof json.text !== 'string') {
    throw new Error(`Packed plugin ${pluginPath} is missing plugin text`);
  }
  const parsedText = JSON.parse(json.text) as PackedPluginText;

  return parsedText.tiddlers ?? {};
}

export {
  ensureRuntimePluginsBuilt,
  getRuntimePluginTiddlers,
  runtimePluginFiles,
};
