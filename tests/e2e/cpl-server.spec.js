/**
 * Playwright E2E Tests for CPL Server
 *
 * These tests verify the full user flow through direct tiddler navigation:
 * 1. Open a TiddlyWiki with CPL Server
 * 2. Navigate to a plugin tiddler
 * 3. Check that stats are displayed
 * 4. Submit a rating and verify it updates
 * 5. Check changelog section
 * 6. Verify API accessibility from browser
 */

const { test, expect } = require('@playwright/test');
const { startBlankWiki, stopBlankWiki, BLANK_WIKI_URL } = require('./helpers/blank-wiki-server');

const BASE_URL = process.env.TEST_URL || 'http://localhost:8080';
const TEST_PLUGIN_TIDDLER = 'Plugin_202203245445241';
const TEST_PLUGIN_CPL_TITLE = '$:/plugins/sk/Links';

async function navigateToPlugin(page, tiddlerTitle) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined', { timeout: 30000 });
  await page.waitForFunction(() => typeof $tw.cplServerAPI !== 'undefined', { timeout: 30000 });

  await page.evaluate((title) => {
    $tw.wiki.addTiddler({ title: '$:/StoryList', list: title });
    $tw.wiki.addTiddler({ title: '$:/HistoryList', 'current-tiddler': title });
    $tw.rootWidget.refresh({ '$:/StoryList': { modified: true } });
  }, tiddlerTitle);

  // Wait for the page to render the plugin view
  await page.waitForSelector('.cpl-plugin-stats', { timeout: 5000 });
}

test.describe('CPL Server E2E', () => {
  // Collect browser console logs for debugging
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[Browser ${page.context().browser().browserType().name()}] ${msg.type()}: ${msg.text()}`);
      }
    });
    page.on('pageerror', err => {
      console.log(`[Browser ${page.context().browser().browserType().name()}] Page error: ${err.message}`);
    });
  });

  test('should display plugin statistics on plugin page', async ({ page }) => {
    await navigateToPlugin(page, TEST_PLUGIN_TIDDLER);

    const statsWidget = page.locator('.cpl-plugin-stats');
    await expect(statsWidget).toBeVisible();

    // Verify download count is displayed (should be a number or dash)
    const downloadCount = statsWidget.locator('.cpl-stat-item').first();
    await expect(downloadCount).toBeVisible();
  });

  test('should allow rating a plugin', async ({ page }) => {
    await navigateToPlugin(page, TEST_PLUGIN_TIDDLER);

    const ratingWidget = page.locator('.cpl-rating-widget');
    await expect(ratingWidget).toBeVisible();

    // Click the third star (rating = 3)
    const stars = ratingWidget.locator('button');
    await expect(stars).toHaveCount(5);
    await stars.nth(2).click();

    // Wait for the submission status to update
    await page.waitForFunction(
      (title) => {
        const tempTiddler = $tw.wiki.getTiddler('$:/temp/CPL-Server/rating-status/' + title);
        return tempTiddler && (tempTiddler.fields.text === 'success' || String(tempTiddler.fields.text).startsWith('error:'));
      },
      TEST_PLUGIN_CPL_TITLE,
      { timeout: 10000 }
    );

    // Verify it succeeded, not errored
    const ratingStatus = await page.evaluate((title) => {
      const tempTiddler = $tw.wiki.getTiddler('$:/temp/CPL-Server/rating-status/' + title);
      return tempTiddler ? tempTiddler.fields.text : null;
    }, TEST_PLUGIN_CPL_TITLE);

    expect(ratingStatus).toBe('success');
  });

  test('should display changelog when available', async ({ page }) => {
    await navigateToPlugin(page, TEST_PLUGIN_TIDDLER);

    const changelogSection = page.locator('.cpl-changelog-section');
    await expect(changelogSection).toBeVisible();
  });

  test('API should be accessible from browser via $tw.cplServerAPI', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof $tw.cplServerAPI !== 'undefined', { timeout: 30000 });

    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        $tw.cplServerAPI.getStats('$:/plugins/test/plugin', (err, stats) => {
          if (err) {
            resolve({ error: err.message || String(err) });
          } else {
            resolve({ success: true, stats });
          }
        });
      });
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.stats).toHaveProperty('downloadCount');
  });

  test('should create temp tiddlers for plugin stats', async ({ page }) => {
    await navigateToPlugin(page, TEST_PLUGIN_TIDDLER);

    // Wait a moment for async stats fetch
    await page.waitForTimeout(500);

    const hasTempTiddlers = await page.evaluate((title) => {
      const statsTiddler = $tw.wiki.getTiddler('$:/temp/CPL-Server/plugin-stats/' + title);
      return !!statsTiddler;
    }, TEST_PLUGIN_CPL_TITLE);

    expect(hasTempTiddlers).toBe(true);
  });

});

test.describe('CPL Client Installation E2E', () => {
  test.beforeAll(async () => {
    await startBlankWiki();
  });

  test.afterAll(() => {
    stopBlankWiki();
  });

  test('blank wiki can install CPL client and download plugin from server', async ({ page, context }) => {
    // Step 1: Open blank wiki and verify it's empty
    await page.goto(BLANK_WIKI_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined', { timeout: 30000 });

    // Verify no CPL plugin exists yet
    const hasCPLBefore = await page.evaluate(() => {
      return !!$tw.wiki.getTiddler('$:/plugins/Gk0Wk/CPL-Repo');
    });
    expect(hasCPLBefore).toBe(false);

    // Step 2: Install CPL client by fetching plugin JSON from server and importing it
    // In real world, user would drag-drop or click install link. We simulate the import.
    const pluginJson = await page.evaluate(async (serverUrl) => {
      const res = await fetch(`${serverUrl}/cpl/api/download-plugin/dullroar_sitemap`);
      return res.json();
    }, BASE_URL);

    expect(pluginJson).toHaveProperty('title');

    // Import the plugin into blank wiki via TW's standard mechanism
    await page.evaluate((pluginData) => {
      $tw.wiki.addTiddler(pluginData);
      $tw.wiki.readPluginInfo();
      $tw.wiki.registerPluginTiddlers('plugin');
      $tw.wiki.unpackPluginTiddlers();
    }, pluginJson);

    // Step 3: Verify plugin is installed
    const hasPluginAfter = await page.evaluate(() => {
      return !!$tw.wiki.getTiddler('$:/plugins/dullroar/sitemap');
    });
    expect(hasPluginAfter).toBe(true);

    // Step 4: Verify plugin functions are available (UI check)
    // The sitemap plugin should have added its tiddlers
    const pluginTiddlers = await page.evaluate(() => {
      const plugin = $tw.wiki.getTiddler('$:/plugins/dullroar/sitemap');
      return plugin ? Object.keys(JSON.parse(plugin.fields.text).tiddlers) : [];
    });
    expect(pluginTiddlers.length).toBeGreaterThan(0);
  });

  test('blank wiki can connect to CPL server via API', async ({ page }) => {
    await page.goto(BLANK_WIKI_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof $tw !== 'undefined', { timeout: 30000 });

    // Simulate a blank wiki page fetching stats from CPL server
    const stats = await page.evaluate(async (serverUrl) => {
      try {
        const res = await fetch(`${serverUrl}/cpl/api/stats/${encodeURIComponent('$:/plugins/test/plugin')}`);
        return res.json();
      } catch (e) {
        return { error: e.message };
      }
    }, BASE_URL);

    expect(stats.error).toBeUndefined();
    expect(stats).toHaveProperty('downloadCount');
    expect(stats).toHaveProperty('averageRating');
  });

});
