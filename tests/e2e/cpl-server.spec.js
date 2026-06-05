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
const { startStaticRepoServer, stopStaticRepoServer, STATIC_REPO_URL } = require('./helpers/static-repo-server');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:8080';
const TEST_PLUGIN_TIDDLER = 'dullroar/sitemap';
const TEST_PLUGIN_CPL_TITLE = '$:/plugins/dullroar/sitemap';

// Temporary test plugin for blank wiki E2E
const TEST_PLUGIN_TITLE = '$:/plugins/test/e2e-test-plugin';
const TEST_PLUGIN_SANITIZED = '$__plugins_test_e2e-test-plugin';
const TEST_PLUGIN_OFFLINE_PATH = path.resolve('wiki/files/plugin-offline', `${TEST_PLUGIN_SANITIZED}.json`);
const REAL_MIRROR_PLUGIN_TITLE = '$:/plugins/tiddlywiki/powered-by-tiddlywiki';
const NETLIFY_REPO = 'https://tw-cpl.netlify.app/repo';
const GITHUB_PAGES_REPO = 'https://tiddly-gittly.github.io/TiddlyWiki-CPL/repo';
const JWT_SECRET = 'test-secret';

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createTestJwt(payload) {
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlEncode({
    avatar: 'https://example.com/avatar.png',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payload
  });
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${signature}`;
}

async function authenticateTestUser(page) {
  await page.context().addCookies([
    {
      name: 'cpl_jwt_token',
      value: createTestJwt({ githubId: '1001', username: 'e2e-user' }),
      url: BASE_URL,
      httpOnly: true,
      sameSite: 'Lax'
    }
  ]);
}

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

  // Point CPL API to the local test server. The server-side --load injection
  // should already do this; this keeps the helper robust for reused servers.
  await page.evaluate(() => {
    $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-server', text: window.location.origin });
    $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-server-repo', text: `${window.location.origin}/repo` });
    $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo', text: `${window.location.origin}/repo` });
  });

  await page.waitForFunction(() => {
    return $tw.wiki.getTiddlerText('$:/temp/CPL-Repo/server-type', '') === 'server';
  }, { timeout: 30000 });

  await page.evaluate((title) => {
    $tw.wiki.addTiddler({ title: '$:/StoryList', list: title });
    $tw.wiki.addTiddler({ title: '$:/HistoryList', 'current-tiddler': title });
    $tw.rootWidget.refresh({ '$:/StoryList': { modified: true } });
  }, tiddlerTitle);

  // Wait for the page to render the plugin view
  await page.waitForSelector('.cpl-plugin-stats', { timeout: 60000 });
}

async function openPluginDatabase(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined', { timeout: 30000 });
  await page.waitForFunction(() => typeof $tw.cpl !== 'undefined', { timeout: 30000 });

  // Use only local mirrors in E2E so switching does not depend on external
  // Netlify/GitHub Pages availability or CORS behavior.
  await page.evaluate(({ staticRepoUrl }) => {
    const localServerUrl = window.location.origin;
    const localServerRepoUrl = `${localServerUrl}/repo`;
    const alternateStaticRepoUrl = staticRepoUrl.endsWith('/') ? staticRepoUrl.slice(0, -1) : `${staticRepoUrl}/`;
    $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-server', text: localServerUrl });
    $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-server-repo', text: localServerRepoUrl });
    $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/servers', text: localServerUrl });
    $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-repo', text: staticRepoUrl });
    $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo', text: staticRepoUrl });
    $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/repos', text: `${staticRepoUrl} ${alternateStaticRepoUrl}` });
    $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/static-repos', text: `${staticRepoUrl} ${alternateStaticRepoUrl}` });
    $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/server-repos', text: localServerRepoUrl });
  }, { staticRepoUrl: STATIC_REPO_URL });

  await page.waitForFunction(() => {
    return $tw.wiki.getTiddlerText('$:/temp/CPL-Repo/server-type', '') === 'server';
  }, { timeout: 30000 });

  await page.evaluate(() => {
    $tw.wiki.addTiddler({ title: '$:/StoryList', list: '$:/plugins/Gk0Wk/CPL-Repo/layout/panel' });
    $tw.wiki.addTiddler({ title: '$:/HistoryList', 'current-tiddler': '$:/plugins/Gk0Wk/CPL-Repo/layout/panel' });
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
    $tw.wiki.addTiddler({
      title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo',
      text: mirrorUrl
    });
    $tw.wiki.addTiddler({
      title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-server',
      text: window.location.origin
    });
    $tw.wiki.addTiddler({
      title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-server-repo',
      text: `${window.location.origin}/repo`
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
  test.beforeAll(async () => {
    // Start local static repo server so mirror-switching tests
    // do not depend on external network.
    if (fs.existsSync(path.resolve(__dirname, '../../cache/plugins'))) {
      await startStaticRepoServer();
    }
  });

  test.afterAll(() => {
    stopStaticRepoServer();
  });

  // Collect browser console logs for debugging
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
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
    await authenticateTestUser(page);
    await navigateToPlugin(page, TEST_PLUGIN_TIDDLER);
    await page.waitForFunction(() => {
      return $tw.wiki.getTiddlerText('$:/temp/CPL-Server/user-status', '') === 'authenticated';
    }, { timeout: 30000 });

    const ratingWidget = page.locator('.cpl-rating-widget');
    await expect(ratingWidget).toHaveCount(0);

    const ratingToggle = page.locator('.cpl-rating-toggle-button');
    await expect(ratingToggle).toBeVisible();
    await ratingToggle.click();
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

  test('should hide rating and compatibility submission forms until login', async ({ page }) => {
    await navigateToPlugin(page, TEST_PLUGIN_TIDDLER);

    const ratingToggle = page.locator('.cpl-rating-toggle-button');
    await expect(ratingToggle).toBeVisible();
    await expect(page.locator('.cpl-rating-widget')).toHaveCount(0);

    await ratingToggle.click();
    await expect(page.locator('.cpl-rating-widget')).toContainText(/Login to rate this plugin|登录后即可为插件评分/);
    // Rating stars should not be clickable when anonymous
    await expect(page.locator('.cpl-rating-star-button')).toHaveCount(0);

    // Compatibility submission form is inside a collapsible panel and should not be visible by default
    await expect(
      page.locator('.cpl-form-section').filter({ hasText: /Submit a Compatibility Report|提交兼容性报告/ })
    ).toHaveCount(0);
    // The collapsed panel shows a summary label instead of the anonymous prompt
    await expect(page.locator('.cpl-compatibility-section')).toContainText(/No compatibility reports yet|暂无兼容性报告/);
  });

  test('should render empty changelog and compatibility reports without staying in loading state', async ({ page }) => {
    await navigateToPlugin(page, 'tiddly-gittly/heti');

    const changelogSection = page.locator('.cpl-changelog-section');
    await expect(changelogSection).toBeVisible();
    await expect(changelogSection).toContainText(/No changelog available|暂无更新日志/);
    await expect(changelogSection).not.toContainText(/Loading changelog|正在加载更新日志/);

    const compatibilitySection = page.locator('.cpl-compatibility-section');
    await expect(compatibilitySection).toBeVisible();
    await expect(compatibilitySection).toContainText(/No compatibility reports yet|暂无兼容性报告/);
    await expect(compatibilitySection).not.toContainText(/Loading compatibility reports|正在加载兼容性报告/);
  });

  test('should show compatibility submission form after login', async ({ page }) => {
    await authenticateTestUser(page);
    await navigateToPlugin(page, TEST_PLUGIN_TIDDLER);
    await page.waitForFunction(() => {
      return $tw.wiki.getTiddlerText('$:/temp/CPL-Server/user-status', '') === 'authenticated';
    }, { timeout: 30000 });

    // Expand the compatibility panel first (it is collapsed by default)
    const compatibilityToggle = page.locator('.cpl-compatibility-section .cpl-section-toggle-button');
    await expect(compatibilityToggle).toBeVisible();
    await compatibilityToggle.click();

    await expect(
      page.locator('.cpl-form-section').filter({ hasText: /Submit a Compatibility Report|提交兼容性报告/ })
    ).toBeVisible();
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

  test('should create a shared temp tiddler for plugin stats', async ({ page }) => {
    await navigateToPlugin(page, TEST_PLUGIN_TIDDLER);

    // Wait a moment for async stats fetch
    await page.waitForFunction(() => {
      const statsTiddler = $tw.wiki.getTiddler('$:/temp/CPL-Server/all-plugin-stats');
      return !!statsTiddler;
    }, { timeout: 10000 });

    const hasSharedStatsTiddler = await page.evaluate(() => {
      const statsTiddler = $tw.wiki.getTiddler('$:/temp/CPL-Server/all-plugin-stats');
      if (!statsTiddler) {
        return false;
      }
      const stats = JSON.parse(statsTiddler.fields.text || '{}');
      return !!stats.plugins && typeof stats.plugins === 'object';
    });

    expect(hasSharedStatsTiddler).toBe(true);
  });

  test('should allow switching mirror sources and keep legacy repo loading working', async ({ page }) => {
    await openPluginDatabase(page);

    const mirrorSelect = page.locator('select.cpl-mirror-select').first();
    await expect(mirrorSelect).toBeVisible();

    const currentValue = await mirrorSelect.inputValue();
    const options = await mirrorSelect.locator('option').evaluateAll(nodes => nodes.map(node => node.value));
    expect(options.length).toBeGreaterThan(1);

    const alternateValue = options.find(value => value !== currentValue);
    expect(alternateValue).toBeTruthy();

    await mirrorSelect.selectOption(alternateValue);

    await page.waitForFunction(
      (expectedRepo) => {
        const currentRepo = $tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo');
        const pluginsIndex = $tw.wiki.getTiddler('$:/temp/CPL-Repo/plugins-index');
        return currentRepo === expectedRepo && !!pluginsIndex;
      },
      alternateValue,
      { timeout: 20000 }
    );

    const mirrorState = await page.evaluate(() => ({
      currentRepo: $tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo'),
      mirrorType: $tw.wiki.getTiddlerText('$:/temp/CPL-Repo/mirror-type', 'unknown'),
      hasPluginsIndex: !!$tw.wiki.getTiddler('$:/temp/CPL-Repo/plugins-index')
    }));

    expect(mirrorState.currentRepo).toBe(alternateValue);
    expect(mirrorState.hasPluginsIndex).toBe(true);
    expect(['server', 'static']).toContain(mirrorState.mirrorType);
  });

  test('should load plugin index from the CPL server mirror root URL', async ({ page, request }) => {
    const serverRoot = new URL(BASE_URL).origin;
    const repoResponse = await request.get(`${serverRoot}/repo/index.json`);
    expect(repoResponse.status()).toBe(200);
    const repoIndex = await repoResponse.json();
    expect(Array.isArray(repoIndex)).toBe(true);
    expect(repoIndex.length).toBeGreaterThan(0);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined', { timeout: 30000 });
    await page.waitForFunction(() => typeof $tw.cpl !== 'undefined', { timeout: 30000 });

    await page.evaluate(() => {
      const serverRoot = window.location.origin;
      $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-server', text: serverRoot });
      $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-server-repo', text: `${serverRoot}/repo` });
      $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/servers', text: serverRoot });
      $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-repo', text: serverRoot });
      $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo', text: serverRoot });
      $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/repos', text: `${serverRoot} ${serverRoot}/repo` });
      $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/static-repos', text: '' });
      $tw.wiki.addTiddler({ title: '$:/plugins/Gk0Wk/CPL-Repo/config/server-repos', text: `${serverRoot} ${serverRoot}/repo` });
    });

    await page.waitForFunction(() => {
      return $tw.wiki.getTiddlerText('$:/temp/CPL-Repo/mirror-type', '') === 'server' &&
        $tw.wiki.getTiddlerText('$:/temp/CPL-Repo/server-type', '') === 'server';
    }, { timeout: 30000 });

    await page.evaluate(() => {
      $tw.wiki.deleteTiddler('$:/temp/CPL-Repo/plugins-index');
      $tw.rootWidget.dispatchEvent({
        type: 'cpl-get-plugins-index',
        paramObject: {},
        widget: $tw.rootWidget
      });
    });

    await page.waitForFunction(() => {
      const errorTiddler = $tw.wiki.getTiddler('$:/temp/CPL-Repo/getting-plugins-index');
      const pluginsIndex = $tw.wiki.getTiddler('$:/temp/CPL-Repo/plugins-index');
      return !errorTiddler && !!pluginsIndex;
    }, { timeout: 30000 });

    const mirrorState = await page.evaluate(() => ({
      currentRepo: $tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo'),
      mirrorType: $tw.wiki.getTiddlerText('$:/temp/CPL-Repo/mirror-type', 'unknown'),
      hasPluginsIndex: !!$tw.wiki.getTiddler('$:/temp/CPL-Repo/plugins-index')
    }));

    expect(mirrorState.currentRepo).toBe(serverRoot);
    expect(mirrorState.mirrorType).toBe('server');
    expect(mirrorState.hasPluginsIndex).toBe(true);
  });

  test('should degrade gracefully when CPL server is unavailable while preserving mirror selector', async ({ page }) => {
    await navigateToPlugin(page, TEST_PLUGIN_TIDDLER);

    await page.evaluate(() => {
      $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/server-type', text: 'unreachable' });
      $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/api-status', text: 'unavailable' });
    });

    const staticNotice = page.locator('.cpl-static-feature-notice').first();
    await expect(staticNotice).toBeVisible();
    await expect(page.locator('.cpl-rating-widget')).toHaveCount(0);
  });

  test('comments center should render without filter syntax errors', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined', { timeout: 30000 });
    await page.waitForFunction(() => typeof $tw.cpl !== 'undefined', { timeout: 30000 });

    // Navigate to comments center
    await page.evaluate(() => {
      $tw.wiki.addTiddler({ title: '$:/StoryList', list: '$:/plugins/Gk0Wk/CPL-Repo/views/comments-center' });
      $tw.wiki.addTiddler({ title: '$:/HistoryList', 'current-tiddler': '$:/plugins/Gk0Wk/CPL-Repo/views/comments-center' });
      $tw.rootWidget.refresh({ '$:/StoryList': { modified: true } });
    });

    // Wait for the comments center to render
    await page.waitForSelector('.cpl-comments-center', { timeout: 30000 });

    // Check that there are no "Filter error" messages on the page
    const pageText = await page.locator('body').textContent();
    expect(pageText).not.toContain('Filter error');
    expect(pageText).not.toContain('Missing [ in filter expression');

    // Check that the login prompt is shown for anonymous users
    await expect(page.locator('.cpl-comments-center')).toContainText(/登录后即可审核评论和发表评论|Login to moderate and post comments/);

    // Check that recent comments section is visible
    await expect(page.locator('.cpl-comments-center')).toContainText(/最新评论|Recent Comments/);
  });

  test('comments center should show comment form after login', async ({ page }) => {
    await authenticateTestUser(page);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined', { timeout: 30000 });
    await page.waitForFunction(() => typeof $tw.cpl !== 'undefined', { timeout: 30000 });

    // Wait for auth status to be set
    await page.waitForFunction(() => {
      return $tw.wiki.getTiddlerText('$:/temp/CPL-Server/user-status', '') === 'authenticated';
    }, { timeout: 30000 });

    // Navigate to a plugin page with comments
    await navigateToPlugin(page, TEST_PLUGIN_TIDDLER);

    // Check that comment section is visible (not just the toggle)
    const commentsSection = page.locator('.cpl-comments-section');
    await expect(commentsSection).toBeVisible();

    // Check that there are no filter errors
    const pageText = await page.locator('body').textContent();
    expect(pageText).not.toContain('Filter error');
    expect(pageText).not.toContain('Missing [ in filter expression');
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
    const pluginResponse = await request.get(`${BASE_URL}/cpl/download-plugin/${encodeURIComponent(TEST_PLUGIN_TITLE)}`);
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
        const res = await fetch(`${serverUrl}/cpl/stats/${encodeURIComponent('$:/plugins/test/plugin')}`);
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
    test.skip(!!process.env.CI, 'Requires external network access to Netlify');

    await page.goto(BLANK_WIKI_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof $tw !== 'undefined', { timeout: 30000 });

    // Browser-side health check: use the same CPL Query path the install
    // will use, so CORS/proxy issues are caught early.
    const netlifyReachable = await page.evaluate(async (pluginTitle) => {
      try {
        await globalThis.__tiddlywiki_cpl__('Query', { plugin: pluginTitle });
        return true;
      } catch {
        return false;
      }
    }, REAL_MIRROR_PLUGIN_TITLE);
    if (!netlifyReachable) {
      test.skip(true, 'Netlify mirror unreachable from browser (CORS or network)');
    }

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
    test.skip(!!process.env.CI, 'Requires external network access to GitHub Pages');

    await page.goto(BLANK_WIKI_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof $tw !== 'undefined', { timeout: 30000 });

    const ghReachable = await page.evaluate(async (pluginTitle) => {
      try {
        await globalThis.__tiddlywiki_cpl__('Query', { plugin: pluginTitle });
        return true;
      } catch {
        return false;
      }
    }, REAL_MIRROR_PLUGIN_TITLE);
    if (!ghReachable) {
      test.skip(true, 'GitHub Pages mirror unreachable from browser (CORS or network)');
    }

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

  test(
    'CPL-Repo installed in blank wiki must not have CPL-Server as a dependent ' +
      '(regression: client plugin must be independent of server plugin)',
    async ({ page }) => {
      await page.goto(BLANK_WIKI_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(
        () => typeof $tw !== 'undefined' && typeof $tw.wiki !== 'undefined',
        { timeout: 30000 }
      );

      // CPL-Server must NOT be auto-installed just because CPL-Repo is present
      const serverInstalled = await page.evaluate(() =>
        !!$tw.wiki.getTiddler('$:/plugins/Gk0Wk/CPL-Server')
      );
      expect(serverInstalled).toBe(false);

      // The installed CPL-Repo plugin must carry an empty dependents field
      const repoDependents = await page.evaluate(
        () =>
          $tw.wiki.getTiddler('$:/plugins/Gk0Wk/CPL-Repo')?.fields?.dependents ?? ''
      );
      expect(repoDependents).toBe('');
    }
  );

});

// ---------------------------------------------------------------------------
// Static Library Update Regression
// Serves cache/plugins locally and simulates the exact HTTP requests a legacy
// CPL client makes when checking for updates via the static repo.
// ---------------------------------------------------------------------------

test.describe('CPL Static Library Update Regression', () => {
  test.beforeAll(async () => {
    await startStaticRepoServer();
  });

  test.afterAll(() => {
    stopStaticRepoServer();
  });

  test(
    'GET /Gk0Wk_CPL-Server/__meta__.json should return 200 with correct metadata ' +
      '(regression: legacy CPL update was failing with 404 for CPL-Server)',
    async ({ request }) => {
      const res = await request.get(`${STATIC_REPO_URL}/Gk0Wk_CPL-Server/__meta__.json`);
      expect(res.status()).toBe(200);
      const meta = await res.json();
      expect(meta.title).toBe('$:/plugins/Gk0Wk/CPL-Server');
      expect(typeof meta.latest).toBe('string');
      expect(meta.latest.length).toBeGreaterThan(0);
      expect(Array.isArray(meta.versions)).toBe(true);
    }
  );

  test(
    'GET /Gk0Wk_CPL-Repo/__meta__.json should return 200 with correct metadata',
    async ({ request }) => {
      const res = await request.get(`${STATIC_REPO_URL}/Gk0Wk_CPL-Repo/__meta__.json`);
      expect(res.status()).toBe(200);
      const meta = await res.json();
      expect(meta.title).toBe('$:/plugins/Gk0Wk/CPL-Repo');
    }
  );

  test(
    'GET /update.json should list both CPL-Repo and CPL-Server ' +
      '(regression: both built plugins must be discoverable by the update checker)',
    async ({ request }) => {
      const res = await request.get(`${STATIC_REPO_URL}/update.json`);
      expect(res.status()).toBe(200);
      const update = await res.json();
      expect(update).toHaveProperty('$:/plugins/Gk0Wk/CPL-Repo');
      expect(update).toHaveProperty('$:/plugins/Gk0Wk/CPL-Server');
    }
  );

  test(
    'GET /Gk0Wk_CPL-Server/latest.json should return the server plugin JSON',
    async ({ request }) => {
      const res = await request.get(`${STATIC_REPO_URL}/Gk0Wk_CPL-Server/latest.json`);
      expect(res.status()).toBe(200);
      const plugin = await res.json();
      expect(plugin.title).toBe('$:/plugins/Gk0Wk/CPL-Server');
      expect(plugin['plugin-type']).toBe('plugin');
    }
  );
});
