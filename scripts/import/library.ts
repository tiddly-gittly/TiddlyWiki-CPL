import { URL } from 'url';
import { resolve, dirname } from 'path';
import { readFileSync } from 'fs';
import chalk from 'chalk';
import { ITiddlerFields } from 'tiddlywiki';
import { mkdirsForFileSync, shellI } from '../utils';
import { IImportOption } from './options';
import { importPlugin } from './plugin';

/**
 * Don't let user install these two plugins manually
 * https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
 */
const forbiddenOfficialLibraryPlugins = [
  '$:/plugins/tiddlywiki/tiddlyweb',
  '$:/plugins/tiddlywiki/filesystem',
];

/**
 * 导入一个插件源
 *
 * @param {string} uri
 * @param {IImportOption} options
 *  yes: 是否自动确认
 * @returns
 */
export const importLibrary = async (uri: string, options: IImportOption) => {
  const tmpDir = resolve('dist', 'library', 'tmp');
  const u = new URL(uri);
  let { pathname } = u;
  // index.html 可能被省略
  if (!pathname.endsWith('.html') && !pathname.endsWith('.htm')) {
    pathname = `${pathname}/index.html`;
    u.pathname = pathname;
  }
  const basePathname = dirname(pathname);

  try {
    // 下载JSON文件，包含插件的信息
    console.log(chalk.cyan('获取插件源信息 - Fetching library...'));
    const tmpLibraryJsonPath = resolve(tmpDir, 'tiddlers.json');
    mkdirsForFileSync(tmpLibraryJsonPath);
    u.pathname = `${basePathname}/recipes/library/tiddlers.json`;
    shellI(
      `wget "${u.href}" --no-check-certificate -O "${tmpLibraryJsonPath}"`,
    );
    const pluginsJson = JSON.parse(
      readFileSync(tmpLibraryJsonPath, 'utf-8'),
    ) as ITiddlerFields[];

    // 遍历并进行导入
    console.log(
      chalk.cyan(
        `准备导入 ${pluginsJson.length} 个插件  -  Importing ${pluginsJson.length} plugins...`,
      ),
    );
    for (const plugin of pluginsJson) {
      const { title } = plugin;
      if (!title || title.trim() === '') {
        continue;
      }
      if (
        forbiddenOfficialLibraryPlugins.includes(title) ||
        (!options.includeOfficial && title.startsWith('$:/plugins/tiddlywiki/'))
      ) {
        console.log(chalk.gray(`跳过 Skip ${chalk.underline(title)}`));
        continue;
      }
      console.log(chalk.gray(`导入 Importing ${chalk.underline(title)}`));
      u.pathname = `${basePathname}/recipes/library/tiddlers/${encodeURIComponent(
        encodeURIComponent(plugin.title),
      )}.json`;
      await importPlugin(u.href, plugin.title, options);
    }
  } catch (e) {
    console.error(chalk.red.bold(e));
  }
};
