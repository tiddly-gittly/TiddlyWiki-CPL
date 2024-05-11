/* eslint-disable max-depth */
/* eslint-disable complexity */
import { URL } from 'url';
import { resolve, extname } from 'path';
import {
  readdirSync,
  copyFileSync,
  rmSync,
  statSync,
  readFileSync,
  writeFileSync,
  existsSync,
  ensureFileSync
} from 'fs-extra';
import chalk from 'chalk';
import type { ITiddlerFields } from 'tiddlywiki';

import {
  shell,
  tiddlywiki,
  findFirstOne,
  formatTitle,
  getTiddlerFromFile,
  getTmpDir,
} from '../utils';
import { mergePluginInfo } from './merge';
import { buildCPLPlugin } from './cpl-plugin';

const defaultDistDir = resolve('dist', 'library');

/**
 * 构建插件源
 * @param {string} distDir 目标路径，空或者不填则默认为'dist/library'
 * @param {boolean} cache 是否开启缓存模式
 */
export const buildLibrary = (distDir = defaultDistDir, cache = false) => {
  const cacheDir = resolve('cache');
  const cachePluginsDir = resolve(cacheDir, 'plugins');
  const tmpDir = getTmpDir(); // 临时的插件目录
  const pluginsDir = resolve(distDir, 'plugins'); // 插件目标目录
  const failedPlugins: Record<string, string> = {};
  try {
    ensureFileSync(resolve(tmpDir, 'foo'));
    ensureFileSync(resolve(pluginsDir, 'foo'));
    if (cache) {
      ensureFileSync(resolve(cachePluginsDir, 'foo'));
    }

    // 启动 TW
    const $tw = tiddlywiki();

    // 拷贝本地插件 (未在网络上发布的)  cp plugin_files/* ${distDir}/tmp/
    const pluginFilesDir = resolve('plugin_files');
    for (const file of readdirSync(pluginFilesDir)) {
      const p = resolve(pluginFilesDir, file);
      if (statSync(p).isFile()) {
        copyFileSync(p, resolve(tmpDir, file));
      }
    }

    // 遍历、下载所有插件
    const downloadFileMap: Record<string, string> = {};
    const pluginInfoTiddlerTitles = $tw.wiki.filterTiddlers(
      '[all[tiddlers]!is[draft]tag[$:/tags/PluginWiki]has[cpl.title]sort[cpl.title]]',
    );
    const cplMetas: ITiddlerFields[] = [];
    console.log(chalk.bgCyan.black.bold('Downloading plugins...'));
    for (const title of pluginInfoTiddlerTitles) {
      try {
        const tiddler = $tw.wiki.getTiddler(title)!.fields;
        // 应当有 title
        if (
          !tiddler['cpl.title'] ||
          (tiddler['cpl.title'] as string).trim() === ''
        ) {
          console.warn(
            chalk.yellow(`  ${title} missed plugin title, skip this plugin.`),
          );
          continue;
        }
        const title_ = tiddler['cpl.title'] as string;
        // 带有 uri，需要下载下来，但是需要是 tw 支持的格式
        if (
          !tiddler['cpl.uri'] ||
          (tiddler['cpl.uri'] as string).trim() === ''
        ) {
          console.warn(
            chalk.yellow(`  ${title_} missed plugin uri, skip this plugin.`),
          );
          failedPlugins[title_] = 'No uri';
          continue;
        }
        // 排除不受支持的格式
        const url = new URL(tiddler['cpl.uri'] as string);
        const ext = extname(url.pathname) || '.html';
        if (!$tw.config.fileExtensionInfo[ext]) {
          console.warn(
            chalk.yellow(
              `  ${title_} has unsupported file extension ${ext}, skip this plugin.`,
            ),
          );
          continue;
        }
        const formatedTitle = formatTitle(title_);
        const filePath = resolve(tmpDir, `${formatedTitle}${ext}`);

        // 下载
        console.log(chalk.cyan(`  Downloading ${chalk.bold(title_)}...`));
        if (url.href in downloadFileMap) {
          // 这种情况是，一些作者直接将 wiki 的 HTML 上传，里面有很多插件
          copyFileSync(downloadFileMap[url.href], filePath);
        } else {
          try {
            shell(
              `wget "${url.href}" --no-verbose --force-directories --no-check-certificate -O "${filePath}"`,
            );
            downloadFileMap[url.href] = filePath;
          } catch (e) {
            failedPlugins[title_] = `404 not found: ${url.href}`;
            console.error(chalk.red.bold(e));
          }
        }

        // 尝试从缓存中加载
        if ((cache && !existsSync(filePath)) || !statSync(filePath).isFile()) {
          const cachePluginFolderPath = resolve(cachePluginsDir, formatedTitle);
          const latestCachePluginPath = resolve(
            cachePluginFolderPath,
            'latest.json',
          );
          if (
            existsSync(latestCachePluginPath) &&
            statSync(latestCachePluginPath).isFile()
          ) {
            copyFileSync(latestCachePluginPath, filePath);
            console.log(``);
          }
        }

        cplMetas.push(tiddler);
        if (process.env.NODE_ENV === 'development') {
          // only download one plugin for test on development.
          break;
        }
      } catch (e: any) {
        console.error(chalk.red.bold(e));
      }
    }

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
          .filter(t => t.endsWith('.json'))
          .filter(t => statSync(resolve(cachePluginFolderPath, t)).isFile())
          .filter(t => t !== 'latest.json' && t !== '__meta__.json')
          .map(t => {
            const versionText = t.replace(/\.json$/, '').trim();
            versionsSize[versionText] = statSync(
              resolve(cachePluginFolderPath, t),
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

    // 接下来从 tmpDir 处理所有的插件
    const pluginTitlePathMap: Record<string, string> = {};
    const pluginInfos: ReturnType<typeof mergePluginInfo>['newInfoTiddler'][] =
      [];
    console.log(chalk.bgCyan.black.bold('\nExporting plugins...'));
    const files = readdirSync(tmpDir);
    for (const meta of cplMetas) {
      try {
        const title = meta['cpl.title'] as string;
        console.log(chalk.cyan(`  Exporting plugin ${title}`));

        // 找到文件夹下对应的插件文件
        const formatedTitle = formatTitle(title);
        const filePrefix = `${formatedTitle}.`;
        const pluginFile = findFirstOne(files, file => {
          if (!file.startsWith(filePrefix)) {
            return false;
          }
          const ext = extname(file);
          if (ext === '') {
            return false;
          }
          return ext in $tw.config.fileExtensionInfo;
        });
        if (!pluginFile) {
          console.warn(
            chalk.yellow(
              `  Cannot find file ${formatedTitle}.*, skip this plugin.`,
            ),
          );
          continue;
        }

        // 加载、提取插件文件
        const pluginFilePath = resolve(tmpDir, pluginFile);
        const plugin = getTiddlerFromFile($tw, pluginFilePath, title);
        if (!plugin) {
          console.warn(
            chalk.yellow(
              `  Cannot find tiddler ${title} in file ${pluginFile}, skip this plugin.`,
            ),
          );
          continue;
        }

        // 整合信息
        const { pluginTiddler, newInfoTiddler } = mergePluginInfo(
          plugin as any,
          meta,
          $tw,
        );

        // 保存插件
        const distPluginPath = resolve(pluginsDir, `${formatedTitle}.json`);
        const pluginJson = JSON.stringify(pluginTiddler);
        writeFileSync(distPluginPath, pluginJson);
        if (cache) {
          cachePlugin(formatedTitle, pluginJson, pluginTiddler, newInfoTiddler);
          pluginTitlePathMap[newInfoTiddler.title] = formatedTitle;
        }

        // 登记插件
        pluginInfos.push(newInfoTiddler);
      } catch (e: any) {
        const t = ((e?.stack ?? String(e)) as string)
          .split('\n')
          .map(t => `  ${t}`)
          .join('\n');
        console.error(chalk.red(t));
      }
    }

    // 生成 CPL 插件
    console.log(chalk.cyan(`  Exporting plugin $:/plugins/Gk0Wk/CPL-Repo`));
    {
      const [cplPlugin, cplPluginInfo] = buildCPLPlugin($tw);
      const formatedTitle = formatTitle(cplPlugin.title);
      const distPluginPath = resolve(pluginsDir, `${formatedTitle}.json`);
      const pluginJson = JSON.stringify(cplPlugin);
      writeFileSync(distPluginPath, pluginJson);
      pluginInfos.push(cplPluginInfo);
      if (cache) {
        cachePlugin(formatedTitle, pluginJson, cplPlugin as any, cplPluginInfo);
      }
    }

    if (cache) {
      // 生成插件索引
      const pluginIndexPath = resolve(cachePluginsDir, 'index.json');
      ensureFileSync(pluginIndexPath);
      writeFileSync(
        pluginIndexPath,
        JSON.stringify(
          pluginInfos.map(i => ({
            title: i.title,
            name: i.name,
            author: i.author,
            tags: i.tags,
            category: i.category,
            type: i['plugin-type'],
            version: i.version,
            core: i['core-version'],
            description: i.description,
          })),
        ),
      );

      // 生成插件更新信息
      const pluginUpdatePath = resolve(cachePluginsDir, 'update.json');
      const updateMap: Record<string, [string, string]> = {};
      for (const { title, version, ...p } of pluginInfos) {
        updateMap[title] = [
          version,
          p['core-version']?.replace?.(/[\s>=<!]/g, '') || '',
        ];
      }
      writeFileSync(pluginUpdatePath, JSON.stringify(updateMap), 'utf-8');

      // 生成跨域通信用 html
      writeFileSync(
        resolve(cachePluginsDir, 'index.html'),
        readFileSync(resolve(__dirname, 'allplugins.emplate.html'), 'utf-8'),
      );
    }

    // 生成插件源 HTML 文件
    console.log(chalk.bgCyan.black.bold('\nGenerating plugin library file...'));

    writeFileSync(
      resolve(distDir, 'index.html'),
      readFileSync(resolve(__dirname, 'library.emplate.html'), 'utf-8').replace(
        "'%%plugins%%'",
        JSON.stringify(pluginInfos),
      ),
    );

    // 清理缓存
    console.log(chalk.bgCyan.black.bold('\nCleaning up...'));
    rmSync(tmpDir, { recursive: true, force: true });

    console.log(chalk.green.bold('CPL generated'));

    console.log('\n\n');
    console.log(chalk.bgRed.black.bold('Failed plugins'));
    for (const t in failedPlugins) {
      console.log(`${t}: ${failedPlugins[t]}`);
    }
  } catch (e: any) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw e;
  }
};
