/**
 * Library Build Artifact Tests
 *
 * Verifies that `pnpm run build && pnpm run build:static-library` produces the
 * correct output for both CPL-Repo and CPL-Server so that legacy CPL clients
 * can successfully check for updates.
 *
 * Regression coverage:
 *   - CPL-Repo plugin must NOT declare CPL-Server as a dependent (users must
 *     not be forced to install the server plugin when they only need the
 *     client).
 *   - CPL-Server must appear in the static repo as Gk0Wk_CPL-Server/__meta__.json
 *     so that legacy update checks return 200 instead of 404.
 */

const fs = require('fs');
const path = require('path');
const paths = require('../paths');

const distDir = paths.dist;
const cachePluginsDir = paths.cache.plugins;

// These tests require build artefacts. If the build has not been run yet (e.g.
// a developer running just unit tests), skip gracefully so they are not
// confusingly red. In CI the build step runs before this suite — fail loudly.
const distExists = fs.existsSync(distDir);
const cacheExists = fs.existsSync(cachePluginsDir);
const isCI = process.env.CI === 'true';

function requireBuildOrSkip(dirName, dirExists) {
  if (dirExists) return;
  if (isCI) {
    throw new Error(
      `${dirName} not found — run \`pnpm run build\` before tests in CI`
    );
  }
  console.warn(`Skipping: ${dirName} not found – run \`pnpm run build\` first.`);
  return true;
}

describe('CPL Static Library Build Artifacts', () => {
  const skipDist = requireBuildOrSkip('dist/', distExists);
  const skipCache = requireBuildOrSkip('cache/plugins/', cacheExists);
  describe('dist/ build output', () => {
    test('dist/$__plugins_Gk0Wk_CPL-Repo.json should exist', () => {
      if (skipDist) return;
      const filePath = path.join(distDir, '$__plugins_Gk0Wk_CPL-Repo.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test(
      'CPL-Repo built plugin must have empty dependents ' +
        '(regression: client must not force-install server plugin)',
      () => {
        if (skipDist) return;
        const filePath = path.join(distDir, '$__plugins_Gk0Wk_CPL-Repo.json');
        if (!fs.existsSync(filePath)) {
          return;
        }
        const plugin = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        expect(plugin.dependents ?? '').toBe('');
      }
    );

    test('dist/$__plugins_Gk0Wk_CPL-Server.json should exist', () => {
      if (skipDist) return;
      const filePath = path.join(distDir, '$__plugins_Gk0Wk_CPL-Server.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const plugin = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(plugin.title).toBe('$:/plugins/Gk0Wk/CPL-Server');
    });
  });

  describe('cache/plugins/ static-library output', () => {
    test(
      'Gk0Wk_CPL-Server/__meta__.json must exist ' +
        '(regression: legacy update check must return 200, not 404)',
      () => {
        if (skipCache) return;
        const metaPath = path.join(
          cachePluginsDir,
          'Gk0Wk_CPL-Server',
          '__meta__.json'
        );
        expect(fs.existsSync(metaPath)).toBe(true);
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        expect(meta.title).toBe('$:/plugins/Gk0Wk/CPL-Server');
        expect(typeof meta.latest).toBe('string');
        expect(meta.latest.length).toBeGreaterThan(0);
        expect(Array.isArray(meta.versions)).toBe(true);
      }
    );

    test('Gk0Wk_CPL-Repo/__meta__.json must exist with correct title', () => {
      if (skipCache) return;
      const metaPath = path.join(
        cachePluginsDir,
        'Gk0Wk_CPL-Repo',
        '__meta__.json'
      );
      expect(fs.existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      expect(meta.title).toBe('$:/plugins/Gk0Wk/CPL-Repo');
    });

    test(
      'update.json must contain entries for both CPL-Repo and CPL-Server ' +
        '(regression: both plugins must be discoverable by update checker)',
      () => {
        if (skipCache) return;
        const updatePath = path.join(cachePluginsDir, 'update.json');
        expect(fs.existsSync(updatePath)).toBe(true);
        const update = JSON.parse(fs.readFileSync(updatePath, 'utf8'));
        expect(update).toHaveProperty('$:/plugins/Gk0Wk/CPL-Repo');
        expect(update).toHaveProperty('$:/plugins/Gk0Wk/CPL-Server');
      }
    );
  });
});
