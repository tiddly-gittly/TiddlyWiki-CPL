import { URL } from 'url';
import { resolve, extname } from 'path';
import {
  mkdirSync,
  readdirSync,
  copyFileSync,
  rmSync,
  statSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import chalk from 'chalk';
import type { ITiddlerFields } from 'tiddlywiki';

import { shell, tiddlywiki } from './utils';
import { findFirstOne, formatTitle, getTiddlerFromFile } from './tiddler-utils';
import { mergePluginInfo } from './merge';

const defaultDistDir = resolve('dist', 'library');

/**
 * 构建插件源
 * @param {string} distDir 目标路径，空或者不填则默认为'dist/library'
 */
export const buildLibrary = (distDir = defaultDistDir) => {
  const tmpDir = resolve(distDir, 'tmp'); // 临时的插件目录
  const pluginsDir = resolve(distDir, 'plugins'); // 插件目标目录
  mkdirSync(resolve(tmpDir, 'foo'));
  mkdirSync(resolve(pluginsDir, 'foo'));

  // 启动TW
  const $tw = tiddlywiki();

  // 拷贝本地插件(未在网络上发布的)  cp plugin_files/* ${distDir}/tmp/
  const pluginFilesDir = resolve(distDir, 'plugin_files');
  for (const file of readdirSync(pluginFilesDir)) {
    if (statSync(file).isFile()) {
      copyFileSync(resolve(pluginFilesDir, file), resolve(tmpDir, file));
    }
  }

  // 遍历、下载所有插件
  const downloadFileMap: Record<string, string> = {};
  const pluginInfoTiddlerTitles = $tw.wiki.filterTiddlers(
    '[all[tiddlers]!is[draft]tag[$:/tags/PluginWiki]]',
  );
  const cplMetas: ITiddlerFields[] = [];
  console.log(chalk.cyan('Downloading plugins...'));
  for (const title of pluginInfoTiddlerTitles) {
    try {
      const tiddler = $tw.wiki.getTiddler(title)!.fields;
      // 应当有title
      if (
        !tiddler['cpl.title'] ||
        (tiddler['cpl.title'] as string).trim() === ''
      ) {
        console.warn(
          chalk.yellow(
            `[Warning] ${title} missed plugin title, skip this plugin.`,
          ),
        );
        continue;
      }
      const title_ = tiddler['cpl.title'] as string;
      console.log(chalk.cyan(`Downloading plugin ${title_}`));
      // 带有uri，需要下载下来，但是需要是tw支持的格式
      if (!tiddler['cpl.uri'] || (tiddler['cpl.uri'] as string).trim() === '') {
        console.warn(
          chalk.yellow(
            `[Warning] ${title_} missed plugin uri, skip this plugin.`,
          ),
        );
        continue;
      }
      // 排除不受支持的格式
      const url = new URL(tiddler['cpl.uri'] as string);
      const ext = extname(url.pathname) || '.html';
      if (!$tw.config.fileExtensionInfo[ext]) {
        console.warn(
          chalk.yellow(
            `[Warning] ${title_} has unsupported file extension ${ext}, skip this plugin.`,
          ),
        );
        continue;
      }
      // 下载
      console.log(chalk.cyan(`  Downloading ${chalk.bold(title_)}...`));
      const filePath = resolve(tmpDir, `${formatTitle(title_)}${ext}`);
      if (url.href in downloadFileMap) {
        copyFileSync(downloadFileMap[url.href], filePath);
      } else {
        shell(`wget "${url.href}" --no-check-certificate -O "${filePath}"`);
        downloadFileMap[url.href] = filePath;
      }
      cplMetas.push(tiddler);
    } catch (e: any) {
      console.error(chalk.red.bold(e));
    }
  }

  // 接下来从tmpDir处理所有的插件
  const pluginCallbackInfo: Record<string, string> = {};
  const pluginInfos = [];
  console.log(chalk.gray.bold('Exporting plugins...'));
  const files = readdirSync(tmpDir);
  for (const meta of cplMetas) {
    try {
      const title = meta['cpl.title'] as string;
      console.log(chalk.cyan(`Exporting plugin ${title}`));

      // 找到文件夹下对应的插件文件
      const filePrefix = `${formatTitle(title)}.`;
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
            `[Warning] Cannot find file ${filePrefix}*, skip this plugin.`,
          ),
        );
        return;
      }

      // 加载、提取插件文件
      const pluginFilePath = resolve(tmpDir, pluginFile);
      const plugin = getTiddlerFromFile($tw, pluginFilePath, title);
      if (!plugin) {
        console.warn(
          chalk.yellow(
            `[Warning] Cannot find tiddler ${title} in file ${pluginFile}, skip this plugin.`,
          ),
        );
        return;
      }

      // 整合信息
      const { pluginTiddler, newInfoTiddler } = mergePluginInfo(
        plugin as any,
        meta,
      );

      // 保存插件
      const distPluginPath = resolve(pluginsDir, `${filePrefix}json`);
      writeFileSync(distPluginPath, JSON.stringify(pluginTiddler));

      // 登记插件
      pluginInfos.push(newInfoTiddler);
      pluginCallbackInfo[newInfoTiddler.title as string] = `${
        newInfoTiddler['requires-reload'] === true ? 'true' : 'false'
      }|${newInfoTiddler.version}`;
    } catch (e: any) {
      console.error(chalk.red.bold(e));
    }
  }

  // 生成 CPL 插件
  {
    console.log(chalk.cyan(`Exporting plugin $:/tags/PluginLibrary/CPL`));
    const cplPluginTiddlers: Record<string, ITiddlerFields> = {};
    $tw.wiki
      .filterTiddlers('[tag[$:/tags/PluginLibrary/CPL]]')
      .map(title => ({
        ...$tw.wiki.getTiddler(title)!.fields,
        created: undefined,
        creator: undefined,
        modified: undefined,
        modifier: undefined,
        revision: undefined,
        bag: undefined,
      }))
      .forEach(tiddler => {
        cplPluginTiddlers[tiddler.title] = tiddler as any;
      });
    writeFileSync(
      `${resolve(pluginsDir, formatTitle('$:/plugins/Gk0Wk/CPL-Repo'))}.json`,
      JSON.stringify({
        version: $tw.wiki.getTiddlerText('CPL-Repo-Version'),
        type: 'application/json',
        title: '$:/plugins/Gk0Wk/CPL-Repo',
        'plugin-type': 'plugin',
        name: 'CPL Repo',
        description: 'Repos for CPL',
        author: 'Gk0Wk',
        text: JSON.stringify({ tiddlers: cplPluginTiddlers }),
      }),
    );
    pluginInfos.push({
      title: '$:/plugins/Gk0Wk/CPL-Repo',
      author: 'Gk0Wk',
      name: 'CPL Repo',
      description: 'Repos for CPL',
      version: $tw.wiki.getTiddlerText('CPL-Repo-Version'),
      'plugin-type': 'plugin',
      'requires-reload': false,
      type: 'application/json',
    });
    pluginCallbackInfo[
      '$:/plugins/Gk0Wk/CPL-Repo'
    ] = `false|${$tw.wiki.getTiddlerText('CPL-Repo-Version')}`;
  }

  // 生成插件源HTML文件
  console.log(chalk.gray.bold('Generating plugin library file...'));
  writeFileSync(
    resolve(distDir, 'index.html'),
    readFileSync(`scripts/library.emplate.html`, 'utf-8').replace(
      "'%%plugins%%'",
      JSON.stringify(pluginInfos),
    ),
  );

  // 生成插件信息反馈
  writeFileSync(
    resolve(distDir, 'callback.tid'),
    `title: $:/temp/tw-cpl/plugin-callback-info\ntype: application/json\n\n${JSON.stringify(
      pluginCallbackInfo,
    )}`,
  );

  // 清理缓存
  console.log(chalk.cyan('Cleaning up...'));
  rmSync(tmpDir, { recursive: true, force: true });

  console.log(chalk.green.bold('CPL generated'));
};
