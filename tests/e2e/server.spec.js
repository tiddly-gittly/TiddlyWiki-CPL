/**
 * CPL Server E2E Tests — main server (playwright.config.js webServer).
 *
 * Covers stats, rating, changelog, compatibility, comments center, API
 * accessibility, and server-degradation UI.
 */
const { test, expect } = require('@playwright/test');
const {
  startMockRepoServer,
  stopMockRepoServer,
  MOCK_PLUGIN_TITLE,
} = require('./helpers/mock-repo-server');
const {
  createTestJwt,
  waitForReady,
  navigateToMockPlugin,
} = require('./helpers/shared');

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
    const downloadCount = statsWidget.locator('.cpl-stat-item').first();
    await expect(downloadCount).toBeVisible();
  });

  test('should create shared stats tiddler after page load', async ({
    page,
  }) => {
    await navigateToMockPlugin(page);
    await page.waitForFunction(
      () =>
        Boolean($tw.wiki.getTiddler('$:/temp/CPL-Server/all-plugin-stats')),
      { timeout: 10000 },
    );
    const hasStats = await page.evaluate(() => {
      const t = $tw.wiki.getTiddler('$:/temp/CPL-Server/all-plugin-stats');
      if (!t) return false;
      const stats = JSON.parse(t.fields.text || '{}');
      return Boolean(stats.plugins) && typeof stats.plugins === 'object';
    });
    expect(hasStats).toBe(true);
  });

  // ── Rating ────────────────────────────────────────────────────────────

  test('should allow authenticated user to rate a plugin', async ({ page }) => {
    const userToken = createTestJwt({ githubId: '1001', username: 'e2e-user' });

    await page.setExtraHTTPHeaders({
      Authorization: `Bearer ${userToken}`,
    });

    await navigateToMockPlugin(page);

    await page.evaluate(() => {
      $tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/user-status',
        text: 'authenticated',
      });
      $tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/user',
        text: JSON.stringify({
          githubId: '1001',
          username: 'e2e-user',
          avatar: '',
        }),
        type: 'application/json',
      });
    });

    const ratingToggle = page.locator('.cpl-rating-toggle-button').first();
    await expect(ratingToggle).toBeVisible();
    await ratingToggle.click();

    const ratingWidget = page.locator('.cpl-rating-widget');
    await expect(ratingWidget).toBeVisible();

    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '.cpl-rating-widget .cpl-rating-star-button',
        ).length === 5,
      { timeout: 15000 },
    );

    const stars = ratingWidget.locator('button');
    await expect(stars).toHaveCount(5, { timeout: 10000 });
    await stars.nth(2).click();

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

    await page.evaluate(() => {
      $tw.wiki.deleteTiddler('$:/temp/CPL-Server/user-status');
      $tw.wiki.deleteTiddler('$:/temp/CPL-Server/user');
      $tw.wiki.deleteTiddler('$:/temp/CPL-Server/rating-panel-state');
    });

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

    await page.evaluate(title => {
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

    const changelogLabel = page
      .locator('.cpl-plugin-stats')
      .filter({ hasText: /No changelog|暂无更新日志/ });
    await expect(changelogLabel).toBeVisible({ timeout: 15000 });

    const compatLabel = page
      .locator('.cpl-plugin-stats')
      .filter({ hasText: /No reports|暂无兼容性报告/ });
    await expect(compatLabel).toBeVisible({ timeout: 15000 });
  });

  // ── Comments Center ───────────────────────────────────────────────────

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
      const url = new URL(
        `/cpl/stats/${encodeURIComponent('$:/plugins/test/plugin')}`,
        window.location.origin,
      );
      return fetch(url.toString())
        .then(async response => {
          if (!response.ok) {
            return {
              error: `HTTP ${response.status}: ${await response.text()}`,
            };
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
