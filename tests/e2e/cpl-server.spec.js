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
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:8080';
const TEST_PLUGIN_TIDDLER = 'Plugin_202203245445241';
const TEST_PLUGIN_CPL_TITLE = '$:/plugins/sk/Links';

// Temporary test plugin for blank wiki E2E
const TEST_PLUGIN_TITLE = '$:/plugins/test/e2e-test-plugin';
const TEST_PLUGIN_SANITIZED = '$__plugins_test_e2e-test-plugin';
const TEST_PLUGIN_OFFLINE_PATH = path.resolve('wiki/files/plugin-offline', `${TEST_PLUGIN_SANITIZED}.json`);
const REAL_MIRROR_PLUGIN_TITLE = '$:/plugins/tiddlywiki/powered-by-tiddlywiki';
const NETLIFY_REPO = 'https://tw-cpl.netlify.app/repo';
const GITHUB_PAGES_REPO = 'https://tiddly-gittly.github.io/TiddlyWiki-CPL/repo';

function createTestPluginFile() {
  const testPlugin = {
    title: TEST_PLUGIN_TITLE,
    type: 'application/json',
    'plugin-type': 'plugin',
    text: JSON.stringify({
      tiddlers: {
        [`${TEST_PLUGIN_TITLE}/readme`]: {
          title: `${TEST_PLUGIN_TITLE}/readme`,
          text: 'This is an E2E test plugin readme. It verifies that plugins can be installed via the import dialog and their tiddlers are accessible.'
        }
      }
    })
  };
  fs.writeFileSync(TEST_PLUGIN_OFFLINE_PATH, JSON.stringify(testPlugin), 'utf-8');
  return testPlugin;
}

function removeTestPluginFile() {
  try {
    if (fs.existsSync(TEST_PLUGIN_OFFLINE_PATH)) {
      fs.unlinkSync(TEST_PLUGIN_OFFLINE_PATH);
    }
  } catch (e) {
    // ignore cleanup errors
  }
}

async function navigateToPlugin(page, tiddlerTitle) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined', { timeout: 30000 });
  await page.waitForFunction(() => typeof $tw.cpl !== 'undefined', { timeout: 30000 });

  await page.evaluate((title) => {
    $tw.wiki.addTiddler({ title: '$:/StoryList', list: title });
    $tw.wiki.addTiddler({ title: '$:/HistoryList', 'current-tiddler': title });
    $tw.rootWidget.refresh({ '$:/StoryList': { modified: true } });
  }, tiddlerTitle);

  // Wait for the page to render the plugin view
  await page.waitForSelector('.cpl-plugin-stats', { timeout: 5000 });
}

async function openPluginDatabase(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined', { timeout: 30000 });
  await page.evaluate(() => {
    $tw.wiki.addTiddler({ title: '$:/StoryList', list: '$:/plugins/Gk0Wk/CPL-Repo/panel' });
    $tw.wiki.addTiddler({ title: '$:/HistoryList', 'current-tiddler': '$:/plugins/Gk0Wk/CPL-Repo/panel' });
    $tw.rootWidget.refresh({ '$:/StoryList': { modified: true } });
  });
}

async function installFromMirrorInBlankWiki(page, mirrorUrl, pluginTitle) {
  await page.goto(BLANK_WIKI_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined', { timeout: 30000 });

  await page.waitForFunction(() => typeof globalThis.__tiddlywiki_cpl__ === 'function', { timeout: 30000 });

  await page.evaluate(({ mirrorUrl }) => {
    $tw.wiki.addTiddler({
      title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-repo',
      text: mirrorUrl
    });
  }, { mirrorUrl });

  const queryResult = await page.evaluate(async ({ pluginTitle }) => {
    try {
      const text = await globalThis.__tiddlywiki_cpl__('Query', { plugin: pluginTitle });
      const data = JSON.parse(text);
      return { ok: true, title: data.title, latest: data.latest };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }, { pluginTitle });

  expect(queryResult.ok).toBe(true);
  expect(queryResult.title).toBe(pluginTitle);

  await page.evaluate(({ pluginTitle }) => {
    $tw.rootWidget.dispatchEvent({
      type: 'cpl-install-plugin-request',
      paramObject: { title: pluginTitle },
      widget: $tw.rootWidget
    });
  }, { pluginTitle });

  const confirmButton = page.locator('button').filter({ hasText: /Confirm to Install|确认安装/ }).last();
  await expect(confirmButton).toBeVisible({ timeout: 30000 });
  await confirmButton.click();

  await page.waitForFunction(
    (pluginTitle) => !!$tw.wiki.getTiddler(pluginTitle),
    pluginTitle,
    { timeout: 60000 }
  );
}

test.describe('CPL Server E2E', () => {
  // Collect browser console logs for debugging
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Suppress expected 404s from plugins without changelogs
        if (text.includes('Failed to fetch changelog') && text.includes('XMLHttpRequest error code: 404')) {
          return;
        }
        console.log(`[Browser ${page.context().browser().browserType().name()}] ${msg.type()}: ${text}`);
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

  test('API should be accessible from browser via $tw.cpl', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof $tw.cpl !== 'undefined', { timeout: 30000 });

    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        $tw.cpl.getStats('$:/plugins/test/plugin', (err, stats) => {
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

  test('should allow switching mirror sources and keep legacy repo loading working', async ({ page }) => {
    await openPluginDatabase(page);

    const mirrorSelect = page.locator('.cpl-mirror-select');
    await expect(mirrorSelect).toBeVisible();

    const currentValue = await mirrorSelect.inputValue();
    const options = await mirrorSelect.locator('option').evaluateAll(nodes => nodes.map(node => node.value));
    expect(options.length).toBeGreaterThan(1);

    const alternateValue = options.find(value => value !== currentValue);
    expect(alternateValue).toBeTruthy();

    await mirrorSelect.selectOption(alternateValue);

    await page.waitForFunction(
      () => {
        const switchStatus = $tw.wiki.getTiddler('$:/temp/CPL-Repo/mirror-switch-status');
        return switchStatus && switchStatus.fields.text === 'success';
      },
      { timeout: 20000 }
    );

    await page.waitForFunction(
      () => {
        const pluginsIndex = $tw.wiki.getTiddler('$:/temp/CPL-Repo/plugins-index');
        return !!pluginsIndex;
      },
      { timeout: 20000 }
    );

    const mirrorState = await page.evaluate(() => ({
      currentRepo: $tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/config/current-repo'),
      mirrorType: $tw.wiki.getTiddlerText('$:/temp/CPL-Repo/mirror-type', 'unknown'),
      hasPluginsIndex: !!$tw.wiki.getTiddler('$:/temp/CPL-Repo/plugins-index')
    }));

    expect(mirrorState.currentRepo).toBe(alternateValue);
    expect(mirrorState.hasPluginsIndex).toBe(true);
    expect(['server', 'static']).toContain(mirrorState.mirrorType);
  });

  test('should degrade gracefully for static mirror capabilities while preserving mirror selector', async ({ page }) => {
    await navigateToPlugin(page, TEST_PLUGIN_TIDDLER);

    await page.evaluate(() => {
      $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/mirror-type', text: 'static' });
      $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/api-status', text: 'unavailable' });
    });

    const staticNotice = page.locator('.cpl-static-feature-notice').first();
    await expect(staticNotice).toBeVisible();
    await expect(page.locator('.cpl-rating-widget')).toHaveCount(0);
  });

});

test.describe('CPL Client Installation E2E', () => {
  test.beforeAll(async () => {
    createTestPluginFile();
    await startBlankWiki({ loadCplClient: true });
  });

  test.afterAll(() => {
    stopBlankWiki();
    removeTestPluginFile();
  });

  test('blank wiki can install test plugin via TW import dialog and open its readme', async ({ page, request }) => {
    // Step 1: Download test plugin JSON from server using Playwright request API
    const pluginResponse = await request.get(`${BASE_URL}/cpl/api/download-plugin/${encodeURIComponent(TEST_PLUGIN_TITLE)}`);
    expect(pluginResponse.ok()).toBe(true);
    const pluginJson = await pluginResponse.json();
    expect(pluginJson).toHaveProperty('title');

    // Step 2: Open blank wiki and verify plugin is not yet installed
    await page.goto(BLANK_WIKI_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined', { timeout: 30000 });

    const hasPluginBefore = await page.evaluate((title) => {
      return !!$tw.wiki.getTiddler(title);
    }, TEST_PLUGIN_TITLE);
    expect(hasPluginBefore).toBe(false);

    // Step 3: Prepare $:/Import tiddler data and navigate to it via UI
    await page.evaluate((pluginData) => {
      const importData = { tiddlers: {} };
      importData.tiddlers[pluginData.title] = pluginData;
      $tw.wiki.addTiddler({
        title: '$:/Import',
        type: 'application/json',
        'plugin-type': 'import',
        status: 'pending',
        text: JSON.stringify(importData)
      });
    }, pluginJson);

    // Navigate to $:/Import via page URL (UI navigation)
    await page.goto(`${BLANK_WIKI_URL}#%24%3A%2FImport`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof $tw !== 'undefined', { timeout: 30000 });

    // Step 4: Wait for import preview and confirm via UI click
    const importButton = page.locator('button').filter({ hasText: /^Import$/i }).first();
    await expect(importButton).toBeVisible({ timeout: 10000 });
    await importButton.click();

    // Wait for import to complete
    await page.waitForTimeout(500);

    // Step 5: Verify plugin is installed
    const hasPluginAfter = await page.evaluate((title) => {
      return !!$tw.wiki.getTiddler(title);
    }, TEST_PLUGIN_TITLE);
    expect(hasPluginAfter).toBe(true);

    // Step 6: Open the readme tiddler via UI navigation and verify content
    const readmeTitle = `${TEST_PLUGIN_TITLE}/readme`;
    await page.goto(`${BLANK_WIKI_URL}#${encodeURIComponent(readmeTitle)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof $tw !== 'undefined', { timeout: 30000 });

    // Use tiddler-frame specific selector to avoid matching multiple open tiddlers
    const readmeFrame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${readmeTitle}"]`);
    const readmeBody = readmeFrame.locator('.tc-tiddler-body');
    await expect(readmeBody).toBeVisible();
    await expect(readmeBody).toContainText('E2E test plugin readme');
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

  test('blank wiki can install powered-by-tiddlywiki from Netlify mirror', async ({ page }) => {
    await installFromMirrorInBlankWiki(page, NETLIFY_REPO, REAL_MIRROR_PLUGIN_TITLE);

    const installState = await page.evaluate(({ pluginTitle }) => ({
      hasPlugin: !!$tw.wiki.getTiddler(pluginTitle),
      pluginType: $tw.wiki.getTiddler(pluginTitle)?.fields?.['plugin-type'] || null,
      version: $tw.wiki.getTiddler(pluginTitle)?.fields?.version || null
    }), { pluginTitle: REAL_MIRROR_PLUGIN_TITLE });

    expect(installState.hasPlugin).toBe(true);
    expect(installState.pluginType).toBe('plugin');
    expect(installState.version).toBeTruthy();
  });

  test('blank wiki can install powered-by-tiddlywiki from GitHub Pages mirror', async ({ page }) => {
    await installFromMirrorInBlankWiki(page, GITHUB_PAGES_REPO, REAL_MIRROR_PLUGIN_TITLE);

    const installState = await page.evaluate(({ pluginTitle }) => ({
      hasPlugin: !!$tw.wiki.getTiddler(pluginTitle),
      pluginType: $tw.wiki.getTiddler(pluginTitle)?.fields?.['plugin-type'] || null,
      version: $tw.wiki.getTiddler(pluginTitle)?.fields?.version || null
    }), { pluginTitle: REAL_MIRROR_PLUGIN_TITLE });

    expect(installState.hasPlugin).toBe(true);
    expect(installState.pluginType).toBe('plugin');
    expect(installState.version).toBeTruthy();
  });

});
