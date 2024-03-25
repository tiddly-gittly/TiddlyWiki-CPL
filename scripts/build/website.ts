import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import type { ITiddlerFields } from 'tiddlywiki';

import { tiddlywiki, waitForFile, shellI, getTmpDir } from '../utils';
import { buildCPLPlugin } from './cpl-plugin';

/** 项目路径 */
const bypassTiddlers = new Set([
  '$:/core',
  'IfEditorMode',
  '$:/UpgradeLibrary',
  '$:/UpgradeLibrary/List',
  '$:/plugins/telmiger/EditorCounter',
  '$:/plugins/tiddlywiki/pluginlibrary',
  '$:/plugins/flibbles/relink-titles',
]);

const headerMetadataTiddler: ITiddlerFields = {
  title: '$:/CPL/no-cache-html',
  tags: ['$:/tags/RawMarkupWikified/TopHead'],
  text: [
    '`',
    '<meta http-equiv="cache-control" content="no-cache">',
    '<meta http-equiv="expires" content="0">',
    '<meta http-equiv="pragma" content="no-cache">',
    '`',
  ].join('\n'),
} as any;

/**
 * 构建在线HTML版本：核心JS和资源文件不包括在HTML中， 下载后不能使用
 * @param {string} [wikiPath='.'] wiki 路径
 * @param {string} [dist='dist'] 构建产物路径
 * @param {string} [htmlName='index.html'] 构建产生的 index 文件名
 * @param {string} [excludeFilter='-[is[draft]]'] 要排除的tiddler的过滤表达式，默认为'-[is[draft]]'
 */
export const buildOnlineHTML = async (
  wikiPath = '.',
  dist = 'dist',
  htmlName = 'index.html',
  excludeFilter = '-[is[draft]]',
) => {
  // 构建插件库，导出插件
  const wikiFolder = path.resolve(wikiPath);
  const distDir = path.resolve(dist);
  const publicDir = path.resolve('public');

  // 读取、导出外置资源、处理 tiddler
  console.log(chalk.bgCyan.black.bold('\nExporting media tiddlers...'));
  const $tw = tiddlywiki([], wikiFolder);
  const tiddlers: Map<string, ITiddlerFields> = new Map();
  const assetsPath = path.resolve(distDir, 'assets');
  fs.ensureFileSync(path.resolve(assetsPath, '1'));
  $tw.wiki.each(({ fields }, title: string) => {
    if (
      bypassTiddlers.has(title) ||
      title.startsWith('$:/boot/') ||
      title.startsWith('$:/temp/') ||
      title.startsWith('$:/plugins/tiddlywiki/codemirror')
    ) {
      return;
    }
    if ($tw.wiki.isBinaryTiddler(title) || $tw.wiki.isImageTiddler(title)) {
      const { extension, encoding } = $tw.config.contentTypeInfo[
        fields.type || 'text/vnd.tiddlywiki'
      ] ?? { extension: '.bin', encoding: 'base64' };
      const fileName = encodeURIComponent(
        title.endsWith(extension) ? title : `${title}${extension}`,
      );
      fs.writeFileSync(
        path.resolve(assetsPath, fileName),
        fields.text,
        encoding as any,
      );
      tiddlers.set(title, {
        ...fields,
        text: '',
        _canonical_uri: `./assets/${encodeURIComponent(fileName)}`,
      });
      console.log(chalk.gray(`  ${title} => assets/${fileName}`));
    } else {
      tiddlers.set(title, { ...fields });
    }
  });

  // 拷贝公共资源
  console.log(chalk.bgCyan.black.bold('\nCopying public assets...'));
  shellI(`cp -r ${publicDir}${path.sep} ${distDir}`);

  // 缓存策略
  tiddlers.set(headerMetadataTiddler.title, headerMetadataTiddler);

  // CPL 插件
  console.log(chalk.bgCyan.black.bold('\nGenerating CPL plugin...'));
  const cplPlugin = buildCPLPlugin($tw)[0];
  tiddlers.set(cplPlugin.title, cplPlugin as any);

  // 停用自动更新
  tiddlers.set(
    '$:/plugins/Gk0Wk/CPL-Repo/config/auto-update-intervals-minutes',
    {
      title: '$:/plugins/Gk0Wk/CPL-Repo/config/auto-update-intervals-minutes',
      text: '-1',
    } as any,
  );
  // 不要弹窗
  tiddlers.set('$:/plugins/Gk0Wk/CPL-Repo/config/popup-readme-at-startup', {
    title: '$:/plugins/Gk0Wk/CPL-Repo/config/popup-readme-at-startup',
    text: '1',
  } as any);

  // 构建
  console.log(
    chalk.bgCyan.black.bold('\nBuilding up TiddlyWiki online website...'),
  );
  const tmpFolder = getTmpDir();
  try {
    fs.cpSync(
      path.resolve(wikiFolder, 'tiddlywiki.info'),
      path.resolve(tmpFolder, 'tiddlywiki.info'),
    );
    tiddlywiki(Array.from(tiddlers.values()), tmpFolder, [
      ...['--output', distDir] /* 指定输出路径 */,
      ...[
        '--rendertiddler',
        '$:/core/save/offline-external-js',
        htmlName,
        'text/plain',
        '',
        'publishFilter',
        excludeFilter,
      ] /* 导出无核心的HTML文件 */,
      ...[
        '--rendertiddler',
        '$:/core/templates/tiddlywiki5.js',
        `tiddlywikicore-${$tw.version}.js`,
        'text/plain',
      ] /* 导出核心 */,
    ]);
    await waitForFile(
      path.resolve(distDir, `tiddlywikicore-${$tw.version}.js`),
    );
  } catch (e) {
    console.error(e);
  }
  fs.rmSync(tmpFolder, { recursive: true, force: true });
};
