/**
 * CPL Client Installation E2E Tests — blank wiki with only CPL-Repo plugin.
 *
 * Covers plugin download, client load, layout switch, database load,
 * Install button rendering, and plugin-card detail modal.
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

// The webServer in playwright.config.js runs with CPL_TEST_MODE=true,
// so plugin-offline files are read from tmp/test-wiki/.  Align the
// test process so paths.pluginOffline resolves to the same directory.
process.env.CPL_TEST_MODE = 'true';

const paths = require('../paths');
const {
  startBlankWiki,
  stopBlankWiki,
  getBlankWikiUrl,
} = require('./helpers/blank-wiki-server');
const {
  startMockRepoServer,
  stopMockRepoServer,
  MOCK_PLUGIN_TITLE,
  MOCK_REPO_URL,
} = require('./helpers/mock-repo-server');
const { BASE_URL } = require('./helpers/shared');

const TEST_PLUGIN_TITLE = '$:/plugins/test/e2e-test-plugin';
const TEST_PLUGIN_SANITIZED = '$__plugins_test_e2e-test-plugin';
const TEST_PLUGIN_OFFLINE_PATH = path.join(
  paths.pluginOffline,
  `${TEST_PLUGIN_SANITIZED}.json`,
);

function createTestPluginFile() {
  fs.mkdirSync(path.dirname(TEST_PLUGIN_OFFLINE_PATH), { recursive: true });
  const testPlugin = {
    title: TEST_PLUGIN_TITLE,
    type: 'application/json',
    'plugin-type': 'plugin',
    text: JSON.stringify({
      tiddlers: {
        [`${TEST_PLUGIN_TITLE}/readme`]: {
          title: `${TEST_PLUGIN_TITLE}/readme`,
          text: 'E2E test plugin readme.',
        },
      },
    }),
  };
  fs.writeFileSync(TEST_PLUGIN_OFFLINE_PATH, JSON.stringify(testPlugin), 'utf-8');
}

function removeTestPluginFile() {
  try {
    if (fs.existsSync(TEST_PLUGIN_OFFLINE_PATH)) {
      fs.unlinkSync(TEST_PLUGIN_OFFLINE_PATH);
    }
  } catch {
    /* ok */
  }
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

test.describe('CPL Client Installation E2E', () => {
  test.beforeAll(async () => {
    await startMockRepoServer();
    await startBlankWiki({ loadCplClient: true });
    createTestPluginFile();
  });

  test.afterAll(() => {
    removeTestPluginFile();
    stopBlankWiki();
    stopMockRepoServer();
  });

  test('blank wiki can download test plugin from server', async ({
    request,
  }) => {
    const pluginUrl = `${BASE_URL}/cpl/download-plugin/${encodeURIComponent(
      TEST_PLUGIN_TITLE,
    )}`;
    const pluginResp = await request.get(pluginUrl);
    if (!pluginResp.ok()) {
      const body = await pluginResp.text().catch(() => '<unreadable>');
      throw new Error(
        `Download ${pluginUrl} failed with ${pluginResp.status()}: ${body}`,
      );
    }
    const pluginJson = await pluginResp.json();
    expect(pluginJson).toHaveProperty('title', TEST_PLUGIN_TITLE);
    expect(pluginJson).toHaveProperty('text');
  });

  test('blank wiki loads CPL client successfully', async ({ page }) => {
    await page.goto(getBlankWikiUrl(), {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForFunction(
      () => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined',
      { timeout: 30000 },
    );
    await page.waitForFunction(
      () => Boolean($tw.wiki.getTiddler('$:/plugins/Gk0Wk/CPL-Repo')),
      { timeout: 30000 },
    );
    const hasPlugin = await page.evaluate(
      t => Boolean($tw.wiki.getTiddler(t)),
      TEST_PLUGIN_TITLE,
    );
    expect(hasPlugin).toBe(false);
  });

  test('CPL layout can load database and render clean Install buttons', async ({
    page,
  }) => {
    await page.goto(getBlankWikiUrl(), {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForFunction(
      () => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined',
      { timeout: 30000 },
    );
    await page.waitForFunction(
      () => Boolean($tw.wiki.getTiddler('$:/plugins/Gk0Wk/CPL-Repo')),
      { timeout: 30000 },
    );

    // Switch to CPL layout.
    await page.evaluate(() => {
      $tw.wiki.addTiddler({
        title: '$:/layout',
        text: '$:/plugins/Gk0Wk/CPL-Repo/layout/layout',
      });
      $tw.rootWidget.refresh({ tiddler: '$:/layout' });
    });

    // Wait for the CPL layout to render.
    await page.waitForSelector('button:has-text("Load Database")', {
      timeout: 10000,
    });

    // Configure the blank wiki to use the mock static repo.
    await page.evaluate(mockRepoUrl => {
      $tw.wiki.addTiddler({
        title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo',
        text: mockRepoUrl,
      });
      $tw.wiki.addTiddler({
        title: '$:/plugins/Gk0Wk/CPL-Repo/config/static-repos',
        text: mockRepoUrl,
      });
      $tw.rootWidget.refresh({
        '$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo': {
          modified: true,
        },
        '$:/plugins/Gk0Wk/CPL-Repo/config/static-repos': { modified: true },
      });
    }, MOCK_REPO_URL);

    // Load the plugin database.
    await page.click('button:has-text("Load Database")');

    // After loading, the Home/Categories/Tags/Updates tabs should appear.
    await page.waitForSelector('text=Categories', { timeout: 15000 });
    await page.waitForSelector('text=Tags', { timeout: 10000 });
    await page.waitForSelector('text=Updates', { timeout: 10000 });

    // Switch to Categories and wait for the plugin card.
    await page.click('text=Categories');
    await page.waitForSelector('.cpl-plugin-card', { timeout: 15000 });

    // Install/Update/etc buttons must not contain stray ">>" text.
    const buttons = page.locator('.cpl-plugin-card-actions button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const text = await buttons.nth(i).textContent();
      expect(text).not.toMatch(/>>/);
    }

    // At least one plugin card should render with a readable title.
    const cards = page.locator('.cpl-plugin-card');
    await expect(cards.first()).toBeVisible();
    const firstCardText = await cards.first().textContent();
    expect(firstCardText?.length ?? 0).toBeGreaterThan(0);

    // Clicking the card opens a metadata modal instead of navigating to a
    // plugin tiddler that may not exist in the wiki yet.
    await cards.first().locator('.cpl-plugin-card-open-button').click();

    const detailModal = page.locator('.tc-modal').filter({
      hasText: /E2E test mock plugin/,
    });
    await expect(detailModal).toBeVisible({ timeout: 10000 });
    await expect(detailModal).toContainText(MOCK_PLUGIN_TITLE);

    const selectedDetailTitle = await page.evaluate(() =>
      $tw.wiki.getTiddlerText('$:/temp/CPL-Repo/plugin-detail-title', ''),
    );
    expect(selectedDetailTitle).toBe(MOCK_PLUGIN_TITLE);

    const currentTiddler = await page.evaluate(() => {
      const history = $tw.wiki.getTiddler('$:/HistoryList');
      return history?.fields['current-tiddler'] || '';
    });
    expect(currentTiddler).not.toBe(MOCK_PLUGIN_TITLE);
  });
});
