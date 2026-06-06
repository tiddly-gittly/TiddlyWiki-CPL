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
  BLANK_WIKI_URL,
} = require('./helpers/blank-wiki-server');
const {
  startMockRepoServer,
  stopMockRepoServer,
  MOCK_PLUGIN_TITLE,
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

    // Inject JWT as Authorization header on all authenticated API requests.
    // Production uses HttpOnly Secure cookies (HTTPS only); test server is HTTP,
    // so we route-intercept to attach the token. Server supports both methods.
    await page.route('**/cpl/rate/**', async (route) => {
      const headers = route.request().headers();
      headers['authorization'] = `Bearer ${userToken}`;
      await route.continue({ headers });
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

    // Click 3rd star
    const stars = ratingWidget.locator('button');
    await expect(stars).toHaveCount(5);
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
      /登录后即可审核评论和发表评论|Login to moderate and post comments/,
    );
    await expect(page.locator('.cpl-comments-center')).toContainText(
      /最新评论|Recent Comments/,
    );
  });

  // ── Comments Center (admin with pending) ───────────────────────────────

  test('comments center admin view with pending comments should render without filter errors', async ({
    page,
    request,
  }) => {
    const adminToken = createTestJwt({
      githubId: '42',
      username: 'admin-test',
    });

    // Submit a comment via API
    const resp = await request.post(
      `${BASE_URL}/cpl/comments/${encodeURIComponent(
        '$:/plugins/test/e2e-admin-comment',
      )}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'TiddlyWiki',
          Cookie: `cpl_jwt_token=${adminToken}`,
        },
        data: { content: 'Admin test comment for filter verification' },
      },
    );
    expect(resp.ok()).toBe(true);
    const commentData = await resp.json();
    expect(commentData.success).toBe(true);

    await waitForReady(page);

    // Inject admin auth state
    await page.evaluate(() => {
      $tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/user-status',
        text: 'authenticated',
      });
      $tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/is-admin',
        text: 'yes',
      });
      $tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/user',
        text: JSON.stringify({
          githubId: '42',
          username: 'admin-test',
          avatar: '',
        }),
        type: 'application/json',
      });
      $tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/github-client-id',
        text: 'fake-id',
      });
    });

    // Set cookie so browser fetch includes auth
    await page
      .context()
      .addCookies([
        { name: 'cpl_jwt_token', value: adminToken, url: BASE_URL },
      ]);

    // Inject pending comment data directly (avoids browser fetch timeout)
    const pendingData = {
      success: true,
      comments: [
        {
          pluginTitle: '$:/plugins/test/e2e-admin-comment',
          comment: {
            id: commentData.commentId,
            githubId: '42',
            username: 'admin-test',
            avatar: '',
            content: 'Admin test comment for filter verification',
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
        },
      ],
    };
    await page.evaluate(data => {
      $tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/pending-comments',
        text: JSON.stringify(data),
        type: 'application/json',
      });
    }, pendingData);

    // Wait for JS processor to create individual tiddlers
    await page.waitForFunction(
      () =>
        $tw.wiki.getTiddlerText(
          '$:/temp/CPL-Server/comment-items/pending/list',
          '',
        ) !== '',
      { timeout: 10000 },
    );

    // Navigate to comments center
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

    // No filter errors
    const text = await page.locator('.cpl-comments-center').textContent();
    expect(text).not.toContain('Filter error');
    expect(text).not.toContain('Missing [ in filter expression');

    // Admin sees pending section
    await expect(page.locator('.cpl-comments-center')).toContainText(
      /待审核评论|Pending Comments/,
    );

    // Comment content renders
    await expect(page.locator('.cpl-comments-center')).toContainText(
      'Admin test comment for filter verification',
    );
    await expect(page.locator('.cpl-comments-center')).toContainText(
      'admin-test',
    );

    // Moderation buttons visible
    await expect(
      page.locator('.cpl-moderation-approve-btn').first(),
    ).toBeVisible();

    // Cleanup
    await request
      .put(
        `${BASE_URL}/cpl/comments/${encodeURIComponent(
          '$:/plugins/test/e2e-admin-comment',
        )}/${encodeURIComponent(commentData.commentId)}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'TiddlyWiki',
            Cookie: `cpl_jwt_token=${adminToken}`,
          },
          data: { status: 'deleted' },
        },
      )
      .catch(() => {});
  });

  // ── API from Browser ──────────────────────────────────────────────────

  test('API should be accessible from browser via $tw.cpl', async ({
    page,
  }) => {
    await waitForReady(page);

    const result = await page.evaluate(() => {
      return new Promise(resolve => {
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
    await expect(staticNotice).toBeVisible();
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
    createTestPluginFile();
    await startBlankWiki({ loadCplClient: true });
  });

  test.afterAll(() => {
    stopBlankWiki();
    removeTestPluginFile();
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
    await page.goto(BLANK_WIKI_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForFunction(
      () => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined',
      { timeout: 30000 },
    );
    // CPL client should be loaded
    await page.waitForFunction(
      () => typeof $tw.cpl !== 'undefined',
      { timeout: 30000 },
    );
    // Verify plugin not installed
    const hasPlugin = await page.evaluate(
      t => Boolean($tw.wiki.getTiddler(t)),
      TEST_PLUGIN_TITLE,
    );
    expect(hasPlugin).toBe(false);
  });
});
