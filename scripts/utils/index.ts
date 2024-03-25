import { tmpdir } from 'os';
import { resolve } from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import fs from 'fs-extra';
import chalk from 'chalk';
import { ITiddlyWiki, ITiddlerFields, TiddlyWiki } from 'tiddlywiki';

export * from './tiddler';

/**
 * 初始化 TiddlyWiki
 *
 * @param {Record<string, unknown>[]} [preloadTiddlers=[]] 额外的 tiddler
 * @param {string} [dir='.'] 工作路径
 * @param {string[]} [commands=[]] 附加指令
 * @param {(wiki: ITiddlyWiki) => void} [beforeBoot] boot 之前的回调
 * @return {ITiddlyWiki}
 */
export const tiddlywiki = (
  preloadTiddlers: Record<string, unknown>[] = [],
  dir = '.',
  commands: string[] = [],
  beforeBoot?: (wiki: ITiddlyWiki) => void,
): ITiddlyWiki => {
  const $tw = TiddlyWiki();
  $tw.boot.argv = [dir, ...commands];
  $tw.preloadTiddlerArray(preloadTiddlers);
  beforeBoot?.($tw);
  $tw.boot.boot();

  // 添加一些拓展名
  // https://github.com/twcloud/tiddlyweb-sse use .info as extension name
  $tw.config.fileExtensionInfo['.info'] = { type: 'application/json-info' };
  // for https://yaisog.tiddlyhost.com , recognized as .com
  $tw.config.fileExtensionInfo['.com'] = { type: 'text/html' };
  /**
   * https://github.com/twcloud/tiddlyweb-sse is a json with `tiddlers` field, which should have been a stringified JSON text in the text field.
   *
   * tw's json deserializer will omit all non-text field. we have to fix that in our deserializer
   *
   * copy from tw core's core/modules/deserializers.js
   */
  ($tw.Wiki as any).tiddlerDeserializerModules['application/json-info'] = (
    text: string,
    fieldsDefault: Record<string, unknown>,
  ) => {
    let incoming = $tw.utils.parseJSONSafe(text, (err: any) => [
      { title: `JSON error: ${err}`, text: '' },
    ]);
    if (!$tw.utils.isArray(incoming)) {
      incoming = [incoming];
    }
    return (incoming as Record<string, unknown>[]).map(incomingFields => {
      const fields: Record<string, unknown> = { ...fieldsDefault };
      for (const field in incomingFields) {
        const value = incomingFields[field];
        if (typeof value === 'string') {
          fields[field] = value;
        } else if (field === 'tiddlers' && value && typeof value === 'object') {
          const tidllers = value as Record<string, ITiddlerFields>;
          for (const tiddlerTitle in tidllers) {
            tidllers[tiddlerTitle] = {
              ...tidllers[tiddlerTitle],
              text: tidllers[tiddlerTitle].text
                .replaceAll('\r\n', '\n\n')
                .replaceAll('\t', ' '),
            };
          }
          fields.text = JSON.stringify({ [field]: value });
        }
      }
      return fields;
    });
  };
  return $tw;
};

/**
 * 尝试深拷贝，from不存在不会出错，to存在也不会出错
 *
 * @param {string} from 源路径
 * @param {string} to 目标路径
 */
export const tryCopy = (from: string, to: string) => {
  if (fs.existsSync(from)) {
    fs.cpSync(from, to, { force: true, errorOnExist: false, recursive: true });
  }
};

/**
 * 递归遍历所有文件
 *
 * @param {string} dir 根路径
 * @param {(filepath: string, stats: fs.Stats) => void} callback 回调函数
 */
export const walkFilesSync = (
  dir: string,
  callback: (filepath: string, stats: fs.Stats) => void,
) => {
  const stats = fs.statSync(dir);
  if (stats.isFile()) {
    callback(dir, stats);
  } else {
    fs.readdirSync(dir).forEach(item =>
      walkFilesSync(resolve(dir, item), callback),
    );
  }
};

/**
 * 等待若干毫秒
 *
 * @async
 * @param {number} millionseconds 毫秒数
 * @return {Promise<void>}
 */
export const sleep = (millionseconds: number) =>
  new Promise<void>(resolve => setTimeout(() => resolve(), millionseconds));

/**
 * 等待直到某个文件存在
 *
 * @param {string} path 要检测的文件路径
 */
export const waitForFile = (path: string) =>
  new Promise<void>(resolve => {
    const id = setInterval(() => {
      resolve();
      if (fs.existsSync(path)) {
        resolve();
        clearInterval(id);
      }
    }, 100);
  });

/**
 * 执行命令行指令，并打印该指令的结果
 * @param {string} command 要执行的命令
 * @param {ExecSyncOptionsWithStringEncoding} options 执行指令时的附带参数
 * @param {boolean} output 是否输出
 */
export const shell = (
  command: string,
  options: ExecSyncOptionsWithStringEncoding = { encoding: 'utf-8' },
  output = true,
) => {
  return execSync(command, {
    stdio: output ? 'inherit' : ['inherit', 'ignore', 'ignore'],
    ...options,
  });
};

/**
 * 执行命令行指令，并打印该指令的结果，同时忽略任何错误
 * @param {string} command 要执行的命令
 * @param {ExecSyncOptionsWithStringEncoding} options 执行指令时的附带参数
 * @param {boolean} output 是否输出
 */
export const shellI = (
  command: string,
  options: ExecSyncOptionsWithStringEncoding = { encoding: 'utf-8' },
  output = true,
) => {
  try {
    return shell(command, options, output);
  } catch (error) {
    console.error(chalk.red.bold(`[Shell Command Error] ${error}`));
    return undefined;
  }
};

let tmpDir: string | undefined;
export const getTmpDir = () => {
  if (!tmpDir) {
    tmpDir = resolve(tmpdir(), 'tiddlywiki-cpl');
    const tmpTiddlerPath = resolve(tmpDir, '1');
    fs.ensureFileSync(tmpTiddlerPath);
  }
  return tmpDir;
};
