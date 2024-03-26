import { URL } from 'url';
import { resolve, extname } from 'path';
import { ensureFileSync, readdirSync } from 'fs-extra';
import chalk from 'chalk';
import inquirer from 'inquirer';
import type { ITiddlerFields } from 'tiddlywiki';

import {
  getTmpDir,
  shellI,
  tiddlywiki,
  findFirstOne,
  formatTitle,
  getReadmeFromPlugin,
  getTiddlerFromFile,
} from '../utils';
import { IImportOption } from './options';

/**
 * Will move value in the left key, to the right key. So we can just process standard cpl.xxx keys
 */
const fieldConvert = [
  ['title', 'cpl.title'],
  ['author', 'cpl.author'],
  ['name', 'cpl.name'],
  ['description', 'cpl.description'],
  ['plugin-type', 'cpl.plugin-type'],
  ['source', 'cpl.source'],
  ['sourcecode', 'cpl.source'],
  ['github', 'cpl.source'],
  ['documentation', 'cpl.documentation'],
  ['document', 'cpl.documentation'],
  ['doc', 'cpl.documentation'],
  ['dependents', 'cpl.dependents'],
  ['parent-plugin', 'cpl.parent-plugin'],
  ['core-version', 'cpl.core-version'],
];
const importCache: Record<string, string> = {};

/**
 * 导入一个插件
 *
 * @param {string} uri
 * @param {string} title
 * @param {IImportOption} options
 * @param {ITiddlyWiki} $tw
 * @returns
 */
export const importPlugin = async (
  uri: string,
  title: string,
  options: IImportOption,
  $tw = tiddlywiki(),
  downloadUri = uri,
): Promise<boolean> => {
  // 文件暂存路径
  const formatedTitle = formatTitle(title);
  const fileName = `${formatedTitle}${
    extname(new URL(downloadUri).pathname) || '.html'
  }`;

  // 从缓存中寻找已下载的文件
  let pluginFilePath = importCache[downloadUri] as string | undefined;
  // 缓存中不存在
  if (!pluginFilePath) {
    const tmpDir = resolve(getTmpDir(), 'plugins');
    ensureFileSync(resolve(tmpDir, '1'));
    const tmpTiddlerPath = resolve(tmpDir, fileName);
    const filePrefix = `${formatedTitle}.`;
    let pluginFile: string | undefined;
    const findFile = () => {
      pluginFile = findFirstOne(readdirSync(tmpDir), file => {
        if (!file.startsWith(filePrefix)) {
          return false;
        }
        const ext = extname(file);
        if (ext === '') {
          return false;
        }
        return ext in $tw.config.fileExtensionInfo;
      });
    };
    // 尝试寻找文件
    findFile();
    // 文件不存在，尝试下载
    if (!pluginFile) {
      shellI(
        `wget "${downloadUri}" --no-verbose --force-directories --no-check-certificate -O "${tmpTiddlerPath}"`,
      );
    }
    findFile();
    if (!pluginFile) {
      console.warn(
        chalk.yellow(`[Warning] Cannot find file ${formatedTitle}.*`),
      );
      return false;
    }
    importCache[downloadUri] = tmpTiddlerPath;
    pluginFilePath = tmpTiddlerPath;
  }

  // 加载、提取插件文件
  const plugin = getTiddlerFromFile($tw, pluginFilePath, title);
  if (!plugin) {
    console.warn(
      chalk.yellow(
        `[Warning] Cannot find tiddler ${title} in file ${pluginFilePath}`,
      ),
    );
    return false;
  }
  // 生成插件摘要
  let pluginInfo = {
    tags: '$:/tags/PluginWiki',
    'cpl.readme': getReadmeFromPlugin(plugin as any as ITiddlerFields),
    'cpl.uri': uri,
  } as Record<string, unknown>;
  fieldConvert.forEach(([from, to]) => {
    if (from in plugin) {
      pluginInfo[to] = plugin[from];
    }
  });
  // 检查是否已存在，并询问是否替换
  const tmp = $tw.wiki.filterTiddlers(
    `[tag[$:/tags/PluginWiki]cpl.title[${pluginInfo['cpl.title']}]]`,
  )[0] as string | undefined;
  if (tmp && !options?.yes) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: chalk.blue(
          `插件 ${chalk.bold(pluginInfo['cpl.title'])} 已存在 ${chalk.grey(
            `(as ${tmp})`,
          )}, 是否将其替换?\nPlugin ${chalk.bold(
            pluginInfo['cpl.title'],
          )} already exists ${chalk.grey(
            `(as ${tmp})`,
          )}, should I overwrite it?`,
        ),
        default: true,
      },
    ]);
    if (!overwrite) {
      return false;
    }
  }

  // 覆盖(合并)
  const old: Record<string, any> = tmp
    ? JSON.parse($tw.wiki.getTiddlerAsJson(tmp))
    : {};
  for (const field in old) {
    if (field.startsWith('cpl.')) {
      delete old[field];
    }
  }
  pluginInfo = {
    ...(tmp ? JSON.parse($tw.wiki.getTiddlerAsJson(tmp)) : {}),
    ...pluginInfo,
    title:
      tmp ??
      `Plugin_${$tw.wiki.filterTiddlers('[<now YYYY0MM0DD0mm0ss0XXX>]')[0]}`,
  };
  $tw.wiki.addTiddler(pluginInfo);

  // 输出信息
  console.log(
    chalk.green(
      `${
        tmp
          ? chalk.yellow.bold.underline('✔️(Update)')
          : chalk.green.bold.underline('✔️(New)')
      } ${pluginInfo.title}(${chalk.grey(pluginInfo['cpl.title'])})`,
    ),
  );
  return true;
};
