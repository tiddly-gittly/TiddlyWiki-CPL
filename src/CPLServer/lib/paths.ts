import * as path from 'path';

/**
 * 项目根目录。
 *
 * 本文件位于 src/CPLServer/lib/paths.ts，向上 3 级即为项目根目录。
 * 使用 __dirname 计算，确保无论进程从哪个目录启动，结果都正确。
 *
 * typeof __dirname 检查让这段代码在浏览器端也能安全加载（TiddlyWiki 打包后），
 * 虽然路径字段实际上只在服务器端使用。
 */
const PROJECT_ROOT =
  typeof __dirname !== 'undefined'
    ? path.resolve(__dirname, '../../..')
    : path.resolve(process.cwd());

/** 检测是否处于测试模式 */
const isTestMode = (): boolean => process.env.CPL_TEST_MODE === 'true';

/**
 * 获取当前应使用的 wiki 根目录。
 *
 * 生产模式: wiki/
 * 测试模式: tmp/test-wiki/（server.ts 会在启动前把生产 wiki 复制到这里）
 */
const getWikiRoot = (): string => {
  if (isTestMode()) {
    return path.join(PROJECT_ROOT, 'tmp', 'test-wiki');
  }
  return path.join(PROJECT_ROOT, 'wiki');
};

/**
 * 集中管理所有项目路径。这是整个项目的唯一路径真实来源（single source of truth）。
 *
 * 设计原则：
 * 1. PROJECT_ROOT 从模块位置计算（__dirname），绝不依赖 process.cwd()
 * 2. 所有派生路径都基于 PROJECT_ROOT，避免 ../../ 深度不一致的问题
 * 3. wiki 相关路径使用 getter 动态计算，自动处理测试/生产模式切换
 * 4. 新增路径时只在此文件中添加，禁止在其他文件中硬编码路径
 */
export const paths = {
  /** 项目根目录 */
  projectRoot: PROJECT_ROOT,

  // 数据目录
  data: path.join(PROJECT_ROOT, 'data'),

  // Wiki 根目录（生产环境）
  wiki: path.join(PROJECT_ROOT, 'wiki'),

  // 测试 Wiki 根目录（由 server.ts 在测试前复制）
  testWiki: path.join(PROJECT_ROOT, 'tmp', 'test-wiki'),

  // 当前使用的 wiki 根目录（自动处理测试模式）
  get wikiRoot() {
    return getWikiRoot();
  },

  // 当前使用的 tiddlers 目录
  get tiddlers() {
    return path.join(getWikiRoot(), 'tiddlers');
  },

  // 评论目录
  get comments() {
    return {
      root: path.join(getWikiRoot(), 'tiddlers', 'comments'),
      pending: path.join(getWikiRoot(), 'tiddlers', 'comments', 'pending'),
      approved: path.join(getWikiRoot(), 'tiddlers', 'comments', 'approved'),
    };
  },

  // 评分目录
  get ratings() {
    return path.join(getWikiRoot(), 'tiddlers', 'ratings');
  },

  // 兼容性报告目录
  get compatibility() {
    return path.join(getWikiRoot(), 'tiddlers', 'compatibility');
  },

  // 下载统计目录
  get downloadStats() {
    return path.join(getWikiRoot(), 'tiddlers', 'download-stats');
  },

  // Wiki 文件目录（测试模式下自动重定向到 tmp/test-wiki/files）
  get files() {
    return path.join(getWikiRoot(), 'files');
  },
  get pluginFetched() {
    return path.join(getWikiRoot(), 'files', 'plugin-fetched');
  },
  get pluginOffline() {
    return path.join(getWikiRoot(), 'files', 'plugin-offline');
  },
  get pluginFetchedHistory() {
    return path.join(getWikiRoot(), 'files', 'plugin-fetched-history');
  },

  // 缓存目录
  cache: {
    root: path.join(PROJECT_ROOT, 'cache'),
    plugins: path.join(PROJECT_ROOT, 'cache', 'plugins'),
    runtimePlugins: path.join(PROJECT_ROOT, 'cache', 'runtime-plugins'),
    runtimePluginDirs: path.join(PROJECT_ROOT, 'cache', 'runtime-plugin-dirs'),
  },

  // 其他目录
  tmp: path.join(PROJECT_ROOT, 'tmp'),
  repoCache: path.join(PROJECT_ROOT, 'repo-cache'),
  public: path.join(PROJECT_ROOT, 'public'),
  dist: path.join(PROJECT_ROOT, 'dist'),
} as const;
