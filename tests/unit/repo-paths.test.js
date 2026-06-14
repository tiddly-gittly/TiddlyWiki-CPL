const { formatTitle } = require('../../scripts/utils/tiddler.ts');
const { formatPluginTitle } = require('../../src/CPLPlugin/startup/repo.ts');
const {
  isSafePluginVersionFileName,
  sanitizePluginFileName,
} = require('../../src/CPLServer/lib/files.ts');

describe('CPL repo path formatting', () => {
  test.each([
    '$:/plugins/linonetwo/commandpalette',
    '$:/plugins/Gk0Wk/CPL-Repo',
    '$:/languages/zh-Hans',
    '$:/themes/tiddlywiki/vanilla',
  ])('client static repo formatter matches build formatter for %s', title => {
    expect(formatPluginTitle(title)).toBe(formatTitle(title));
  });

  test('static repo install URL should not contain an extra /plugins segment', () => {
    const repo = 'https://tw-cpl.netlify.app/repo';
    const title = '$:/plugins/linonetwo/commandpalette';

    expect(`${repo}/${formatPluginTitle(title)}/__meta__.json`).toBe(
      'https://tw-cpl.netlify.app/repo/linonetwo_commandpalette/__meta__.json'
    );
  });

  test('download-plugin filename sanitizer keeps the runtime plugin filename format', () => {
    expect(sanitizePluginFileName('$:/plugins/test/fetched-preferred')).toBe(
      '$__plugins_test_fetched-preferred'
    );
  });

  test('historical plugin versions reject path traversal names', () => {
    expect(isSafePluginVersionFileName('2026.06.14-1')).toBe(true);
    expect(isSafePluginVersionFileName('1.0.0-beta+sha')).toBe(true);
    expect(isSafePluginVersionFileName('../latest')).toBe(false);
    expect(isSafePluginVersionFileName('../../plugin-fetched/foo')).toBe(false);
    expect(isSafePluginVersionFileName('1.0.0/evil')).toBe(false);
  });
});
