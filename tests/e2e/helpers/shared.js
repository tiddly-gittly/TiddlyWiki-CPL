/**
 * Shared E2E helpers — JWT utilities, page setup, and mock-plugin navigation.
 */
const crypto = require('crypto');
const { MOCK_PLUGIN_TITLE } = require('./mock-repo-server');

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

  await page.waitForSelector('.cpl-plugin-stats', { timeout: 30000 });
}

module.exports = {
  BASE_URL,
  createTestJwt,
  waitForReady,
  navigateToMockPlugin,
};
