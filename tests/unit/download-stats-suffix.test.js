const path = require('path');
const paths = require('../paths');

describe('download stats legacy server suffix compatibility', () => {
  const originalWikiPath = process.env.WIKI_PATH;
  const originalWikiSubpath = process.env.WIKI_SUBPATH;

  beforeAll(() => {
    process.env.WIKI_PATH = paths.projectRoot;
    process.env.WIKI_SUBPATH = 'wiki';
    jest.resetModules();
  });

  afterAll(() => {
    if (originalWikiPath === undefined) delete process.env.WIKI_PATH;
    else process.env.WIKI_PATH = originalWikiPath;
    if (originalWikiSubpath === undefined) delete process.env.WIKI_SUBPATH;
    else process.env.WIKI_SUBPATH = originalWikiSubpath;
  });

  test('reads historical stats files with a server-id suffix', () => {
    const { DownloadStatsTiddlerStore } = require('../../src/CPLServer/lib/store/download-stats-tiddlers');
    const stats = DownloadStatsTiddlerStore.getStats('$:/plugins/BTC/TiddlyFlex');
    expect(stats.downloadCount).toBeGreaterThan(0);
    expect(DownloadStatsTiddlerStore.getTopDownloadCounts(20)).toHaveProperty(
      '$:/plugins/BTC/TiddlyFlex'
    );
  });
});
