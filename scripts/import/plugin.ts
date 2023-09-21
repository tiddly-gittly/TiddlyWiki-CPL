import { URL } from 'url';
import { tmpdir } from 'os';
import { readdirSync } from 'fs';
import { resolve, extname } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import type { ITiddlerFields } from 'tiddlywiki';

import {
  mkdirsForFileSync,
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
): Promise<boolean> => {
  // 文件暂存路径
  const formatedTitle = formatTitle(title);
  const fileName = `${formatedTitle}${
    extname(new URL(uri).pathname) || '.html'
  }`;

  // 从缓存中寻找已下载的文件
  let pluginFile = importCache[uri] as string | undefined;
  // 缓存中不存在
  if (!pluginFile) {
    const tmpDir = resolve(tmpdir(), 'tiddlywiki-cpl');
    const tmpTiddlerPath = resolve(tmpDir, fileName);
    mkdirsForFileSync(tmpTiddlerPath);
    const filePrefix = `${formatedTitle}.`;
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
      shellI(`wget "${uri}" --no-check-certificate -O "${tmpTiddlerPath}"`);
    }
    findFile();
    if (!pluginFile) {
      console.warn(
        chalk.yellow(`[Warning] Cannot find file ${formatedTitle}.*`),
      );
      return false;
    }
    importCache[uri] = pluginFile;
  }

  // 加载、提取插件文件
  const tmpJsonPath = resolve('dist', 'library', 'tmp', pluginFile);
  const plugin = getTiddlerFromFile($tw, tmpJsonPath, title);
  if (!plugin) {
    console.warn(
      chalk.yellow(
        `[Warning] Cannot find tiddler ${title} in file ${pluginFile}.`,
      ),
    );
    return false;
  }
  // 生成插件摘要
  let pluginInfo = {
    tags: '$:/tags/PluginWiki',
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
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
  pluginInfo = {
    ...(tmp ? JSON.parse(($tw.wiki as any).getTiddlerAsJson(tmp)) : {}),
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
          ? chalk.yellow.bold.underline('✔️')
          : chalk.green.bold.underline('✔️')
      } ${pluginInfo.title}(${chalk.grey(pluginInfo['cpl.title'])})`,
    ),
  );
  return true;
};
