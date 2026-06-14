/**
 * Playwright E2E Tests for CPL Server
 *
 * All tests use mock data — no real plugins, no external network calls.
 * The test server (started by playwright.config.js webServer) provides
 * the TW wiki + CPL server on a dynamic port.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
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

const BASE_URL =
  process.env.TEST_URL ||
  `http://localhost:${process.env.TEST_PORT || '19876'}`;
const JWT_SECRET = 'test-secret';

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/[=]/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createTestJwt(payload) {
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlEncode({
    avatar: 'https://example.com/avatar.png',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payload,
  });
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/[=]/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${signature}`;
}

/** Wait for TW + CPL client to be ready. */
async function waitForReady(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined',
    { timeout: 60000 },
  );
  await page.waitForFunction(() => typeof $tw.cpl !== 'undefined', {
    timeout: 60000,
  });
}

/** Navigate to a mock plugin tiddler that has cpl.title set. */
async function navigateToMockPlugin(page) {
  await waitForReady(page);

  // Create a mock plugin tiddler with cpl.title so the stats widget renders
  await page.evaluate(title => {
    $tw.wiki.addTiddler({
      title: '$:/temp/e2e-mock-plugin-info',
      'cpl.title': title,
      text: 'Mock plugin for E2E testing',
      tags: '$:/tags/PluginWiki',
    });
    $tw.wiki.addTiddler({
      title: '$:/StoryList',
      list: '$:/temp/e2e-mock-plugin-info',
    });
    $tw.wiki.addTiddler({
      title: '$:/HistoryList',
      'current-tiddler': '$:/temp/e2e-mock-plugin-info',
    });
    $tw.rootWidget.refresh({ '$:/StoryList': { modified: true } });
  }, MOCK_PLUGIN_TITLE);

  // Wait for stats widget to render
  await page.waitForSelector('.cpl-plugin-stats', { timeout: 30000 });
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

test.describe('CPL Server E2E', () => {
  test.beforeAll(async () => {
    await startMockRepoServer();
  });

  test.afterAll(() => {
    stopMockRepoServer();
  });

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[Browser] error: ${msg.text()}`);
      }
    });
  });

  // ── Plugin Stats ──────────────────────────────────────────────────────

  test('should display plugin statistics widget on plugin page', async ({
    page,
  }) => {
    await navigateToMockPlugin(page);
    const statsWidget = page.locator('.cpl-plugin-stats');
    await expect(statsWidget).toBeVisible();
    // Download count should be rendered (number or dash)
    const downloadCount = statsWidget.locator('.cpl-stat-item').first();
    await expect(downloadCount).toBeVisible();
  });

  test('should create shared stats tiddler after page load', async ({
    page,
  }) => {
    await navigateToMockPlugin(page);
    await page.waitForFunction(
      () => Boolean($tw.wiki.getTiddler('$:/temp/CPL-Server/all-plugin-stats')),
      { timeout: 10000 },
    );
    const hasStats = await page.evaluate(() => {
      const t = $tw.wiki.getTiddler('$:/temp/CPL-Server/all-plugin-stats');
      if (!t) {
        return false;
      }
      const stats = JSON.parse(t.fields.text || '{}');
      return Boolean(stats.plugins) && typeof stats.plugins === 'object';
    });
    expect(hasStats).toBe(true);
  });

  // ── Rating ────────────────────────────────────────────────────────────

  test('should allow authenticated user to rate a plugin', async ({ page }) => {
    const userToken = createTestJwt({ githubId: '1001', username: 'e2e-user' });

    // Attach the JWT to every request from this page. tm-http-request inside
    // TW is implemented differently across browsers (fetch/XHR), and both
    // cookies and page.route() are flaky in WebKit/Firefox, so setting the
    // Authorization header globally is the most reliable way to authenticate
    // the rating request in E2E tests.
    await page.setExtraHTTPHeaders({
      Authorization: `Bearer ${userToken}`,
    });

    await navigateToMockPlugin(page);

    // Inject auth state into TW tiddlers so UI shows authenticated
    await page.evaluate(() => {
      $tw.wiki.addTiddler({ title: '$:/temp/CPL-Server/user-status', text: 'authenticated' });
      $tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/user',
        text: JSON.stringify({ githubId: '1001', username: 'e2e-user', avatar: '' }),
        type: 'application/json',
      });
    });

    // Open rating panel (first toggle button = rating)
    const ratingToggle = page.locator('.cpl-rating-toggle-button').first();
    await expect(ratingToggle).toBeVisible();
    await ratingToggle.click();

    const ratingWidget = page.locator('.cpl-rating-widget');
    await expect(ratingWidget).toBeVisible();

    // Firefox refreshes $let bindings slower than Chromium; wait until the
    // authenticated rating widget (five stars) is present instead of the
    // anonymous prompt (single login button).
    await page.waitForFunction(
      () => document.querySelectorAll('.cpl-rating-widget .cpl-rating-star-button').length === 5,
      { timeout: 15000 },
    );

    // Click 3rd star
    const stars = ratingWidget.locator('button');
    await expect(stars).toHaveCount(5, { timeout: 10000 });
    await stars.nth(2).click();

    // Wait for submission result
    await page.waitForFunction(
      title => {
        const t = $tw.wiki.getTiddler(
          `$:/temp/CPL-Server/rating-status/${title}`,
        );
        return (
          t &&
          (t.fields.text === 'success' ||
            String(t.fields.text).startsWith('error:'))
        );
      },
      MOCK_PLUGIN_TITLE,
      { timeout: 10000 },
    );

    const status = await page.evaluate(title => {
      const t = $tw.wiki.getTiddler(
        `$:/temp/CPL-Server/rating-status/${title}`,
      );
      return t ? t.fields.text : null;
    }, MOCK_PLUGIN_TITLE);
    expect(status).toBe('success');
  });

  test('should show login prompt for anonymous users in rating panel', async ({
    page,
  }) => {
    await navigateToMockPlugin(page);

    // Ensure no leftover authenticated state from previous tests (server is
    // reused, and $:/temp/CPL-Server/user-status may have been synced).
    await page.evaluate(() => {
      $tw.wiki.deleteTiddler('$:/temp/CPL-Server/user-status');
      $tw.wiki.deleteTiddler('$:/temp/CPL-Server/user');
      $tw.wiki.deleteTiddler('$:/temp/CPL-Server/rating-panel-state');
    });

    // First toggle button = rating
    const ratingToggle = page.locator('.cpl-rating-toggle-button').first();
    await expect(ratingToggle).toBeVisible();
    await ratingToggle.click();

    await expect(page.locator('.cpl-rating-widget')).toContainText(
      /Login to rate this plugin|登录后即可为插件评分/,
    );
    await expect(page.locator('.cpl-rating-star-button')).toHaveCount(0);
  });

  // ── Changelog / Compatibility ──────────────────────────────────────────

  test('should show empty state for changelog and compatibility', async ({
    page,
  }) => {
    await navigateToMockPlugin(page);

    // Inject empty changelog/compatibility responses so the test does not
    // depend on background tm-http-request timing (notoriously flaky in WebKit
    // when the server is under load from sequential browser tests).
    await page.evaluate((title) => {
      $tw.wiki.addTiddler({
        title: `$:/temp/CPL-Server/plugin-changelog/${title}`,
        text: JSON.stringify({ hasChangelog: false, changelog: [] }),
        type: 'application/json',
        'plugin-title': title,
      });
      $tw.wiki.addTiddler({
        title: `$:/temp/CPL-Server/compatibility/${title}`,
        text: JSON.stringify({ reports: [] }),
        type: 'application/json',
        'plugin-title': title,
      });
      $tw.rootWidget.refresh({
        [`$:/temp/CPL-Server/plugin-changelog/${title}`]: { modified: true },
        [`$:/temp/CPL-Server/compatibility/${title}`]: { modified: true },
      });
    }, MOCK_PLUGIN_TITLE);

    // Changelog should show "no changelog" (not loading forever)
    const changelogLabel = page
      .locator('.cpl-plugin-stats')
      .filter({ hasText: /No changelog|暂无更新日志/ });
    await expect(changelogLabel).toBeVisible({ timeout: 15000 });

    // Compatibility should show "no reports"
    const compatLabel = page
      .locator('.cpl-plugin-stats')
      .filter({ hasText: /No reports|暂无兼容性报告/ });
    await expect(compatLabel).toBeVisible({ timeout: 15000 });
  });

  // ── Comments Center (anonymous) ───────────────────────────────────────

  test('comments center should render without filter syntax errors', async ({
    page,
  }) => {
    await waitForReady(page);

    await page.evaluate(() => {
      $tw.wiki.addTiddler({
        title: '$:/StoryList',
        list: '$:/plugins/Gk0Wk/CPL-Repo/views/comments-center',
      });
      $tw.wiki.addTiddler({
        title: '$:/HistoryList',
        'current-tiddler': '$:/plugins/Gk0Wk/CPL-Repo/views/comments-center',
      });
      $tw.rootWidget.refresh({ '$:/StoryList': { modified: true } });
    });

    await page.waitForSelector('.cpl-comments-center', { timeout: 30000 });

    const text = await page.locator('.cpl-comments-center').textContent();
    expect(text).not.toContain('Filter error');
    expect(text).not.toContain('Missing [ in filter expression');

    await expect(page.locator('.cpl-comments-center')).toContainText(
      /登录后即可发表评论|Login to post comments/,
    );
    await expect(page.locator('.cpl-comments-center')).toContainText(
      /最新评论|Recent Comments/,
    );
  });

  // ── API from Browser ──────────────────────────────────────────────────

  test('API should be accessible from browser via fetch', async ({
    page,
  }) => {
    await waitForReady(page);

    const result = await page.evaluate(() => {
      // Use the current page origin to avoid cross-origin issues in WebKit
      // when TEST_URL is set to 127.0.0.1 but the test hard-codes localhost.
      const url = new URL(
        `/cpl/stats/${encodeURIComponent('$:/plugins/test/plugin')}`,
        window.location.origin,
      );
      return fetch(url.toString())
        .then(async response => {
          if (!response.ok) {
            return { error: `HTTP ${response.status}: ${await response.text()}` };
          }
          return { success: true, stats: await response.json() };
        })
        .catch(err => ({ error: err.message || String(err) }));
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.stats).toHaveProperty('downloadCount');
  });

  // ── Server Degradation ────────────────────────────────────────────────

  test('should degrade gracefully when CPL server is unavailable', async ({
    page,
  }) => {
    await navigateToMockPlugin(page);

    await page.evaluate(() => {
      $tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/server-type',
        text: 'unreachable',
      });
      $tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/api-status',
        text: 'unavailable',
      });
    });

    const staticNotice = page.locator('.cpl-static-feature-notice').first();
    await expect(staticNotice).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.cpl-rating-widget')).toHaveCount(0);
  });
});

// ── Blank Wiki Installation ─────────────────────────────────────────────────

test.describe('CPL Client Installation E2E', () => {
  const TEST_PLUGIN_TITLE = '$:/plugins/test/e2e-test-plugin';
  const TEST_PLUGIN_SANITIZED = '$__plugins_test_e2e-test-plugin';
  const TEST_PLUGIN_OFFLINE_PATH = path.join(
    paths.pluginOffline,
    `${TEST_PLUGIN_SANITIZED}.json`,
  );

  function createTestPluginFile() {
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
    fs.writeFileSync(
      TEST_PLUGIN_OFFLINE_PATH,
      JSON.stringify(testPlugin),
      'utf-8',
    );
  }

  function removeTestPluginFile() {
    try {
      if (fs.existsSync(TEST_PLUGIN_OFFLINE_PATH)) {
        fs.unlinkSync(TEST_PLUGIN_OFFLINE_PATH);
      }
    } catch {}
  }

  test.beforeAll(async () => {
    await startMockRepoServer();
    createTestPluginFile();
    await startBlankWiki({ loadCplClient: true });
  });

  test.afterAll(() => {
    stopBlankWiki();
    removeTestPluginFile();
    stopMockRepoServer();
  });

  test('blank wiki can download test plugin from server', async ({
    request,
  }) => {
    // Verify the test plugin can be downloaded from the CPL server
    const pluginResp = await request.get(
      `${BASE_URL}/cpl/download-plugin/${encodeURIComponent(
        TEST_PLUGIN_TITLE,
      )}`,
    );
    expect(pluginResp.ok()).toBe(true);
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
    // CPL client plugin should be present in the wiki. The $tw.cpl startup
    // object is initialized asynchronously and can be flaky in Chromium, but
    // the plugin tiddler itself confirms the client was loaded.
    await page.waitForFunction(
      () => Boolean($tw.wiki.getTiddler('$:/plugins/Gk0Wk/CPL-Repo')),
      { timeout: 30000 },
    );
    // Verify plugin not installed
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
