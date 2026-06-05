const path = require('path');

/**
 * 项目根目录。
 *
 * 本文件位于 tests/paths.js，向上 1 级即为项目根目录。
 */
const PROJECT_ROOT = path.resolve(__dirname, '..');

/** 检测是否处于测试模式 */
const isTestMode = () => process.env.CPL_TEST_MODE === 'true';

/**
 * 获取当前应使用的 wiki 根目录。
 */
const getWikiRoot = () => {
  if (isTestMode()) {
    return path.join(PROJECT_ROOT, 'tmp', 'test-wiki');
  }
  return path.join(PROJECT_ROOT, 'wiki');
};

/**
 * 测试文件专用的路径常量。
 *
 * 与 src/CPLServer/lib/paths.ts 保持结构一致，供 CommonJS 测试文件使用。
 */
module.exports = {
  projectRoot: PROJECT_ROOT,

  data: path.join(PROJECT_ROOT, 'data'),

  wiki: path.join(PROJECT_ROOT, 'wiki'),
  testWiki: path.join(PROJECT_ROOT, 'tmp', 'test-wiki'),

  get wikiRoot() {
    return getWikiRoot();
  },

  get tiddlers() {
    return path.join(getWikiRoot(), 'tiddlers');
  },

  get comments() {
    return {
      root: path.join(getWikiRoot(), 'tiddlers', 'comments'),
      pending: path.join(getWikiRoot(), 'tiddlers', 'comments', 'pending'),
      approved: path.join(getWikiRoot(), 'tiddlers', 'comments', 'approved'),
    };
  },

  get ratings() {
    return path.join(getWikiRoot(), 'tiddlers', 'ratings');
  },

  get compatibility() {
    return path.join(getWikiRoot(), 'tiddlers', 'compatibility');
  },

  get downloadStats() {
    return path.join(getWikiRoot(), 'tiddlers', 'download-stats');
  },

  files: path.join(PROJECT_ROOT, 'wiki', 'files'),
  pluginFetched: path.join(PROJECT_ROOT, 'wiki', 'files', 'plugin-fetched'),
  pluginOffline: path.join(PROJECT_ROOT, 'wiki', 'files', 'plugin-offline'),
  pluginFetchedHistory: path.join(
    PROJECT_ROOT,
    'wiki',
    'files',
    'plugin-fetched-history',
  ),

  cache: {
    root: path.join(PROJECT_ROOT, 'cache'),
    plugins: path.join(PROJECT_ROOT, 'cache', 'plugins'),
  },

  tmp: path.join(PROJECT_ROOT, 'tmp'),
  repoCache: path.join(PROJECT_ROOT, 'repo-cache'),
  public: path.join(PROJECT_ROOT, 'public'),
  dist: path.join(PROJECT_ROOT, 'dist'),
};
