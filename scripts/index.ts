import { resolve } from 'path';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import chalk from 'chalk';
import { input, confirm } from '@inquirer/prompts';
import { program } from 'commander';
import { tiddlywiki } from './utils';
import { importPlugin } from './import/plugin';
import { importLibrary } from './import/library';
import { buildLibrary } from './build/library';
import { buildOnlineHTML } from './build/website';

const sleep = (t: number) =>
  new Promise<void>(resolve =>
    setTimeout(() => {
      resolve();
    }, t),
  );

program
  .name('TiddlyWiki CPL')
  .description('TiddlyWiki5 Plugin Library for TiddlyWiki Chinese Communities');

const importCommand = program
  .command('import')
  .description('导入插件或插件源 - Import plugins or plugin-libraries');

importCommand
  .command('plugin')
  .description('导入一个插件 - Import a plugin')
  .action(async () => {
    // 处理输入
    const url = await input({
      message: chalk.bold(
        `请输入插件的URL链接 - Input URL of plugin (.tid, .json, .html, etc.)`,
      ),
    });
    const title = await input({
      message: chalk.bold(
        `请输入插件的标题 - Input title of plugin tiddler  ${chalk.grey(
          `(e.g. $:/plugins/tiddlywiki/codemirror)`,
        )}`,
      ),
    });
    // 导入插件
    await importPlugin(url.trim(), title.trim(), {
      yes: true,
      includeOfficial: false,
    });

    await sleep(1000);
  });

importCommand
  .command('library')
  .description('导入一个插件库 - Import a plugin library')
  .option(
    '--official',
    '导入官方插件源 - Import official plugin library',
    false,
  )
  .option('--all', '更新已注册的插件源 - Update registered library', false)
  .action(async ({ official, all }: { official: boolean; all: boolean }) => {
    interface IRegisteredLibrary {
      name: string;
      uri: string;
    }

    if (all) {
      const registeredLibrariesPath = resolve('libraries.json');
      let registeredLibraries: IRegisteredLibrary[] = [];
      try {
        registeredLibraries = JSON.parse(
          readFileSync(registeredLibrariesPath, 'utf-8'),
        );
      } catch {}
      console.log(
        chalk.cyan(
          `即将更新 ${registeredLibraries.length} 个插件源  Importing ${registeredLibraries.length} libraries...`,
        ),
      );
      const $tw = tiddlywiki(
        process.env.GITHUB_ACTIONS === 'true'
          ? [{ title: '$:/status/UserName', text: 'GitHub Action' }]
          : [],
      );
      for (const { uri, name } of registeredLibraries) {
        console.log(
          chalk.cyan(`导入插件库 Importing Library ${chalk.bold(name)}...`),
        );
        try {
          await importLibrary(uri, { yes: true, includeOfficial: false }, $tw);
        } catch (e: any) {
          console.log(chalk.red.bold(`失败 Error: ${e}`));
        }
      }
    } else if (official) {
      console.log(chalk.cyan('导入官方插件源 - Importing official library...'));
      const latestVersion = execSync(
        `curl https://api.github.com/repos/TiddlyWiki/TiddlyWiki5/tags -s | jq -r '.[0].name'`,
      )
        .toString()
        .trim();
      console.log(`版本(Version): ${chalk.green(latestVersion)}`);
      const $tw = tiddlywiki(
        process.env.GITHUB_ACTIONS === 'true'
          ? [{ title: '$:/status/UserName', text: 'GitHub Action' }]
          : [],
      );
      // https://tiddlywiki.com/library/v5.2.7
      await importLibrary(
        `https://tiddlywiki.com/library/${latestVersion}`,
        {
          yes: true,
          includeOfficial: official,
        },
        $tw,
      );
    } else {
      const url = await input({
        message: chalk.bold(
          `请输入插件源的链接${chalk.gray(
            '(可从插件源条目的url字段找到)',
          )}\nInput libaray url${chalk.gray(
            '(can find in url field of the plugin library tiddler)',
          )}`,
        ),
      });
      await importLibrary(url, { yes: true, includeOfficial: false });
      const registeredLibrariesPath = resolve('libraries.json');
      let registeredLibraries: IRegisteredLibrary[] = [];
      try {
        registeredLibraries = JSON.parse(
          readFileSync(registeredLibrariesPath, 'utf-8'),
        );
      } catch {}
      if (
        process.env.GITHUB_ACTIONS !== 'true' &&
        !registeredLibraries.find(({ uri }) => uri === url)
      ) {
        const register = await confirm({
          message: chalk.bold(
            `是否要将该插件源注册? 下次只需 ${chalk.blue(
              'import --all',
            )} 即可更新所有插件源!\nRegister this library? Then just ${chalk.blue(
              'import --all',
            )} next time!`,
          ),
        });
        if (!register) {
          return;
        }
        const name = await input({
          message: '给插件源起一个名字 - Name the library',
        });
        registeredLibraries.push({
          uri: url,
          name,
        });
        writeFileSync(
          registeredLibrariesPath,
          JSON.stringify(registeredLibraries),
        );
      }
    }
    await sleep(1000);
  });

const buildCommand = program.command('build');

buildCommand
  .command('library')
  .description('构建 CPL 插件源  -  Build CPL library')
  .option('--dist <dist-path>', '构建输出路径 Build output path', undefined)
  .option('--cache-mode', '开启缓存模式 Cache mode', false)
  .action(
    ({ distPath, cacheMode }: { distPath?: string; cacheMode: boolean }) => {
      buildLibrary(distPath, cacheMode);
    },
  );

buildCommand
  .command('website')
  .description(
    '构建 CPL 网站(不包含插件源)  -  Build CPL website (not including library)',
  )
  .option('--wiki <wiki-path>', 'wiki的根路径, root path of wiki', '.')
  .option('--dist <dist-path>', '构建输出路径 Build output path', 'dist')
  .option(
    '--exclude <exclude-filter>',
    '要排除的tiddler的过滤表达式  Filter to exclude publishing tiddlers',
    '-[is[draft]]',
  )
  .action(
    async ({
      distPath,
      wikiPath,
      excludeFilter,
    }: {
      distPath: string;
      wikiPath: string;
      excludeFilter: string;
    }) => {
      await buildOnlineHTML(wikiPath, distPath, 'index.html', excludeFilter);
    },
  );

program.parse();
