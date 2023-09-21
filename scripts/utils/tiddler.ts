import { extname } from 'path';
import { readFileSync } from 'fs';
import type {
  ITiddlyWiki,
  ITiddlerFieldsParam,
  ITiddlerFields,
} from 'tiddlywiki';

export const getPluginContentTiddlers = (
  pluginTiddler: ITiddlerFields,
): Record<string, ITiddlerFields> | undefined => {
  try {
    return pluginTiddler.tiddlers ?? JSON.parse(pluginTiddler.text).tiddlers;
  } catch (error) {
    console.error(
      `[Get Plugin Content Tiddlers Error] ${error} , this maybe $tw.wiki.deserializeTiddlers(fileMIME, fileText, {}), can't deserialize tiddler ${pluginTiddler.title} properly, for example, json tiddler without a text field with jsonstringify content.`,
    );
    return undefined;
  }
};

/**
 * 判断是否是安装后需要重新加载页面的插件
 * @param {ITiddlerFields} pluginTiddler 插件tiddler
 * @returns {boolean} 需要重载则返回true，反之
 */
export const ifPluginRequiresReload = (pluginTiddler: ITiddlerFields) => {
  const shadowTiddlers = getPluginContentTiddlers(pluginTiddler);
  if (shadowTiddlers) {
    Object.values(shadowTiddlers).some(
      tiddler =>
        tiddler.type === 'application/javascript' && tiddler['module-type'],
    );
  }
  return false;
};

/**
 * 从指定文件获得指定的tiddler
 *
 * @param {string} wikiFile
 * @param {string} tiddlerTitle
 * @returns {$tw.Tiddler}
 */
export const getTiddlerFromFile = (
  $tw: ITiddlyWiki,
  wikiFile: string,
  tiddlerTitle: string,
): ITiddlerFieldsParam | undefined => {
  try {
    const fileMIME = $tw.config.fileExtensionInfo[extname(wikiFile)].type;
    const fileText = readFileSync(wikiFile).toString('utf8');
    return findFirstOne(
      $tw.wiki.deserializeTiddlers(fileMIME, fileText, {}),
      tiddler_ => tiddler_.title === tiddlerTitle,
    );
  } catch (e) {
    console.error(e);
    return undefined;
  }
};

/**
 * 从列表中返回第一个满足要求的项，如果没有就返回undefined
 *
 * @param {T[]} list 若干项的列表
 * @param {(T) => boolean} condition
 * @returns {T | undefined}
 */
export const findFirstOne = <T = unknown>(
  list: T[],
  condition: (value: T) => boolean,
): T | undefined => {
  const len = list.length;
  for (let i = 0; i < len; i++) {
    if (condition(list[i])) {
      return list[i];
    }
  }
  return undefined;
};

/**
 * 格式化插件tiddler的名称
 * @param {string} title 插件tiddler的标题
 * @returns {string} 格式化之后的文件名称
 */
export const formatTitle = (title: string): string =>
  encodeURIComponent(
    title
      .replace('$:/plugins/', '')
      .replace('$:/languages/', 'languages_')
      .replace('$:/themes/', 'themes_')
      .replace(/[:/<>"|?*]/g, '_'),
  );

export const getReadmeFromPlugin = (pluginTiddler: ITiddlerFields) => {
  try {
    return (
      getPluginContentTiddlers(pluginTiddler)?.[`${pluginTiddler.title}/readme`]
        ?.text ?? ''
    );
  } catch (e) {
    console.error(e);
    return '';
  }
};
