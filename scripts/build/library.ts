import { extname, resolve } from 'path';
import { URL } from 'url';
import {
  ensureFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs-extra';
import chalk from 'chalk';

import {
  formatTitle,
  getTiddlerFromFile,
  getTmpDir,
  tiddlywiki,
} from '../utils';
import { sanitizePluginFileName } from '../../src/CPLServer/lib/files';
import { mergePluginInfo } from './merge';

const defaultDistDir = resolve('dist', 'library');
const pluginFilesBaseDir = resolve('wiki', 'files');
const fetchedDir = resolve(pluginFilesBaseDir, 'plugin-fetched');
const offlineDir = resolve(pluginFilesBaseDir, 'plugin-offline');

const resolvePluginSourcePath = (pluginTitle: string): string | null => {
  const sanitizedTitle = sanitizePluginFileName(pluginTitle);
  for (const baseDir of [fetchedDir, offlineDir]) {
    const candidate = resolve(baseDir, `${sanitizedTitle}.json`);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
};

const createCplPluginInfo = (plugin: Record<string, string>) => {
  const builtTiddlers =
    JSON.parse(plugin.text || '{"tiddlers":{}}').tiddlers || {};
  return {
    title: plugin.title,
    name: plugin.name,
    author: plugin.author,
    version: plugin.version,
    'plugin-type': plugin['plugin-type'],
    icon: plugin.icon || '',
    'core-version': plugin['core-version'] || '>=5.3.0',
    dependents: plugin.dependents || '',
    'parent-plugin': plugin['parent-plugin'] || '',
    'requires-reload': true,
    category: 'Functional',
    tags: 'CPL [[Plugin Libaray]] Network Essential',
    description: plugin.description,
    readme: builtTiddlers['$:/plugins/Gk0Wk/CPL-Repo/docs/readme']?.text || '',
  };
};

const inferSourceExtension = (
  sourcePath: string,
  sourceUri?: string,
): string => {
  if (sourceUri) {
    try {
      const uriExtension = extname(new URL(sourceUri).pathname);
      if (uriExtension) {
        return uriExtension;
      }
    } catch {
      // ignore malformed URLs and fall through to content sniffing
    }
  }

  const content = readFileSync(sourcePath, 'utf-8').trimStart();
  if (content.startsWith('<!doctype html') || content.startsWith('<html')) {
    return '.html';
  }

  if (content.startsWith('{') || content.startsWith('[')) {
    return '.json';
  }

  return extname(sourcePath) || '.json';
};

const loadPluginFromSource = (
  $tw: ReturnType<typeof tiddlywiki>,
  tmpDir: string,
  sourcePath: string,
  pluginTitle: string,
  sourceUri?: string,
) => {
  const inferredExtension = inferSourceExtension(sourcePath, sourceUri);
  const tempPath = resolve(
    tmpDir,
    `${sanitizePluginFileName(pluginTitle)}${inferredExtension}`,
  );
  writeFileSync(tempPath, readFileSync(sourcePath, 'utf-8'), 'utf-8');
  return getTiddlerFromFile($tw, tempPath, pluginTitle);
};

/**
 * Build static plugin library artifacts from the current wiki metadata and
 * the latest fetched/offline plugin JSON files.
 */
export const buildLibrary = (distDir = defaultDistDir, cache = false) => {
  const cacheDir = resolve('cache');
  const cachePluginsDir = resolve(cacheDir, 'plugins');
  const tmpDir = getTmpDir();
  const pluginsDir = resolve(distDir, 'plugins');
  const failedPlugins: Record<string, string> = {};

  try {
    ensureFileSync(resolve(tmpDir, 'foo'));
    ensureFileSync(resolve(pluginsDir, 'foo'));
    if (cache) {
      ensureFileSync(resolve(cachePluginsDir, 'foo'));
    }

    const $tw = tiddlywiki([], 'wiki');

    const cachePlugin = (
      formatted: string,
      json: string,
      plugin: ReturnType<typeof mergePluginInfo>['pluginTiddler'],
      info: ReturnType<typeof mergePluginInfo>['newInfoTiddler'],
    ) => {
      const cachePluginFolderPath = resolve(cachePluginsDir, formatted);
      const latestCachePluginPath = resolve(
        cachePluginFolderPath,
        'latest.json',
      );
      const currentCachePluginPath = resolve(
        cachePluginFolderPath,
        `${plugin.version}.json`,
      );
      const metaPath = resolve(cachePluginFolderPath, '__meta__.json');
      ensureFileSync(metaPath);
      writeFileSync(latestCachePluginPath, json);
      writeFileSync(currentCachePluginPath, json);
      const versionsSize: Record<string, number> = {};
      const versions = new Set<string>(
        readdirSync(cachePluginFolderPath)
          .filter(fileName => fileName.endsWith('.json'))
          .filter(fileName =>
            statSync(resolve(cachePluginFolderPath, fileName)).isFile(),
          )
          .filter(
            fileName =>
              fileName !== 'latest.json' && fileName !== '__meta__.json',
          )
          .map(fileName => {
            const versionText = fileName.replace(/\.json$/, '').trim();
            versionsSize[versionText] = statSync(
              resolve(cachePluginFolderPath, fileName),
            ).size;
            return versionText;
          }),
      );

      writeFileSync(
        metaPath,
        JSON.stringify({
          ...info,
          latest: plugin.version,
          versions: Array.from(versions).sort((a, b) =>
            $tw.utils.compareVersions(a, b),
          ),
          'versions-size': versionsSize,
        }),
      );
    };

    const pluginInfoTiddlerTitles = $tw.wiki.filterTiddlers(
      '[all[tiddlers]!is[draft]tag[$:/tags/PluginWiki]has[cpl.title]sort[cpl.title]]',
    );

    const pluginInfos: ReturnType<typeof mergePluginInfo>['newInfoTiddler'][] =
      [];
    console.log(
      chalk.bgCyan.black.bold(
        'Exporting plugins from fetched/offline sources...',
      ),
    );

    for (const infoTitle of pluginInfoTiddlerTitles) {
      try {
        const meta = $tw.wiki.getTiddler(infoTitle)?.fields;
        if (!meta) {
          continue;
        }

        const title = meta['cpl.title'] as string | undefined;
        if (!title || title.trim() === '') {
          console.warn(
            chalk.yellow(`  ${infoTitle} missing cpl.title, skipping.`),
          );
          continue;
        }

        const formattedTitle = formatTitle(title);
        const sourcePath = resolvePluginSourcePath(title);
        if (!sourcePath) {
          failedPlugins[title] = 'Missing plugin-fetched/plugin-offline source';
          console.warn(chalk.yellow(`  Missing plugin source for ${title}`));
          continue;
        }

        const plugin = loadPluginFromSource(
          $tw,
          tmpDir,
          sourcePath,
          title,
          typeof meta['cpl.uri'] === 'string' ? meta['cpl.uri'] : undefined,
        );
        if (!plugin) {
          failedPlugins[
            title
          ] = `Cannot load plugin tiddler from ${sourcePath}`;
          console.warn(
            chalk.yellow(`  Cannot parse plugin ${title} from ${sourcePath}`),
          );
          continue;
        }

        const { pluginTiddler, newInfoTiddler } = mergePluginInfo(
          plugin as any,
          meta,
          $tw,
        );
        const pluginJson = JSON.stringify(pluginTiddler);
        writeFileSync(
          resolve(pluginsDir, `${formattedTitle}.json`),
          pluginJson,
        );
        pluginInfos.push(newInfoTiddler);

        if (cache) {
          cachePlugin(
            formattedTitle,
            pluginJson,
            pluginTiddler,
            newInfoTiddler,
          );
        }

        console.log(chalk.cyan(`  Exported plugin ${title}`));
      } catch (error: any) {
        const message = (error?.stack ?? String(error)) as string;
        console.error(chalk.red(message));
      }
    }

    console.log(chalk.cyan(`  Exporting plugin $:/plugins/Gk0Wk/CPL-Repo`));
    {
      const builtCplPluginPath = resolve(
        'dist',
        '$__plugins_Gk0Wk_CPL-Repo.json',
      );
      if (!existsSync(builtCplPluginPath)) {
        throw new Error(
          'Missing dist/$__plugins_Gk0Wk_CPL-Repo.json. Run `pnpm run build` first.',
        );
      }

      const cplPlugin = JSON.parse(
        readFileSync(builtCplPluginPath, 'utf-8'),
      ) as Record<string, string>;
      const cplPluginInfo = createCplPluginInfo(cplPlugin);
      const formattedTitle = formatTitle(cplPlugin.title);
      const pluginJson = JSON.stringify(cplPlugin);
      writeFileSync(resolve(pluginsDir, `${formattedTitle}.json`), pluginJson);
      pluginInfos.push(cplPluginInfo as any);

      if (cache) {
        cachePlugin(
          formattedTitle,
          pluginJson,
          cplPlugin as any,
          cplPluginInfo as any,
        );
      }
    }

    if (cache) {
      const pluginIndexPath = resolve(cachePluginsDir, 'index.json');
      ensureFileSync(pluginIndexPath);
      writeFileSync(
        pluginIndexPath,
        JSON.stringify(
          pluginInfos.map(info => ({
            title: info.title,
            name: info.name,
            author: info.author,
            tags: info.tags,
            category: info.category,
            type: info['plugin-type'],
            version: info.version,
            core: info['core-version'],
            description: info.description,
          })),
        ),
      );

      const pluginUpdatePath = resolve(cachePluginsDir, 'update.json');
      const updateMap: Record<string, [string, string]> = {};
      for (const { title, version, ...pluginInfo } of pluginInfos) {
        updateMap[title] = [
          version,
          pluginInfo['core-version']?.replace?.(/[\s>=<!]/g, '') || '',
        ];
      }
      writeFileSync(pluginUpdatePath, JSON.stringify(updateMap), 'utf-8');

      writeFileSync(
        resolve(cachePluginsDir, 'index.html'),
        readFileSync(resolve(__dirname, 'allplugins.emplate.html'), 'utf-8'),
      );
    }

    console.log(chalk.bgCyan.black.bold('\nGenerating plugin library file...'));
    writeFileSync(
      resolve(distDir, 'index.html'),
      readFileSync(resolve(__dirname, 'library.emplate.html'), 'utf-8').replace(
        "'%%plugins%%'",
        JSON.stringify(pluginInfos),
      ),
    );

    console.log(chalk.bgCyan.black.bold('\nCleaning up...'));
    rmSync(tmpDir, { recursive: true, force: true });

    console.log(chalk.green.bold('CPL generated'));
    console.log('\n\n');
    console.log(chalk.bgRed.black.bold('Failed plugins'));
    for (const title in failedPlugins) {
      console.log(`${title}: ${failedPlugins[title]}`);
    }
  } catch (error: any) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
};
