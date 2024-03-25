import { URL } from 'url';
import { readFileSync, ensureFileSync } from 'fs-extra';
import { resolve, dirname } from 'path';
import chalk from 'chalk';
import { ITiddlerFields } from 'tiddlywiki';
import { shellI, getTmpDir, tiddlywiki } from '../utils';
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
export const importLibrary = async (
  uri: string,
  options: IImportOption,
  $tw = tiddlywiki(),
) => {
  const tmpDir = getTmpDir();

  try {
    const u = new URL(uri);
    let { pathname } = u;
    // index.html 可能被省略
    if (!pathname.endsWith('.html') && !pathname.endsWith('.htm')) {
      pathname = pathname.endsWith('/')
        ? `${pathname}index.html`
        : `${pathname}/index.html`;
      u.pathname = pathname;
    }
    const basePathname = dirname(pathname);

    // 下载JSON文件，包含插件的信息
    console.log(chalk.cyan('获取插件源信息 - Fetching library...'));
    const tmpLibraryJsonPath = resolve(tmpDir, 'library-json', 'tiddlers.json');
    ensureFileSync(tmpLibraryJsonPath);
    u.pathname = `${basePathname}/recipes/library/tiddlers.json`;
    shellI(
      `wget "${u.href}" --no-verbose --force-directories --no-check-certificate -O "${tmpLibraryJsonPath}"`,
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
        console.log(chalk.gray(`跳过无标题 Skip no title ${JSON.stringify(plugin)}`));
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
      const url1 = u.href;
      //   u.pathname = `${basePathname}/recipes/library/tiddlers/${encodeURIComponent(
      //     plugin.title,
      //   )}.json`;
      //   const url2 = u.href;
      await importPlugin(url1, plugin.title, options, $tw);
    }
  } catch (e) {
    console.error(chalk.red.bold(e));
  }
};
