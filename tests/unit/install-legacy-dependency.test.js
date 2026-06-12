const {
  shouldSkipLegacyDependency,
} = require('../../src/CPLPlugin/startup/plugin-install.ts');

describe('legacy dependency compatibility', () => {
  test('should skip legacy CPL-Repo -> CPL-Server dependency edge', () => {
    expect(
      shouldSkipLegacyDependency(
        '$:/plugins/Gk0Wk/CPL-Repo',
        '$:/plugins/Gk0Wk/CPL-Server'
      )
    ).toBe(true);
  });

  test('should not skip unrelated dependencies', () => {
    expect(
      shouldSkipLegacyDependency(
        '$:/plugins/some-author/some-plugin',
        '$:/plugins/other/dependency'
      )
    ).toBe(false);
  });

  test('should not skip CPL-Server depending on CPL-Repo (reverse direction)', () => {
    expect(
      shouldSkipLegacyDependency(
        '$:/plugins/Gk0Wk/CPL-Server',
        '$:/plugins/Gk0Wk/CPL-Repo'
      )
    ).toBe(false);
  });
});
