/**
 * Unit tests for static-mirror-fetch.ts
 *
 * Tests the priority order (netlify → github.io → fallback) and the
 * formatPluginTitle() transform used to build download URLs.
 */

const {
  fetchPluginFromStaticMirrors,
  formatPluginTitle,
  STATIC_MIRROR_BASES,
} = require('../../src/CPLPlugin/startup/core/static-mirror-fetch.ts');

// ---- helpers ----------------------------------------------------------------

const VALID_PLUGIN_JSON = JSON.stringify({
  title: '$:/plugins/test/example',
  'plugin-type': 'plugin',
  text: '{"tiddlers":{}}',
});

/**
 * Replace global fetch with a function that records calls and returns
 * configurable responses.
 */
function mockFetch(responseMap) {
  const calls = [];
  global.fetch = jest.fn(async url => {
    calls.push(url);
    const entry = responseMap[url];
    if (!entry) {
      return { ok: false, status: 404, text: async () => 'Not Found' };
    }
    if (entry.networkError) {
      throw new Error('Network error');
    }
    return {
      ok: entry.ok ?? true,
      status: entry.status ?? 200,
      text: async () => entry.body ?? VALID_PLUGIN_JSON,
    };
  });
  return calls;
}

afterEach(() => {
  jest.restoreAllMocks();
  delete global.fetch;
});

// ---- formatPluginTitle ------------------------------------------------------

describe('formatPluginTitle', () => {
  test('strips $:/plugins/ prefix', () => {
    expect(formatPluginTitle('$:/plugins/author/name')).toBe('author_name');
  });

  test('replaces $:/languages/ prefix with languages_', () => {
    const result = formatPluginTitle('$:/languages/zh-Hans');
    expect(result).toContain('languages_');
  });

  test('replaces $:/themes/ prefix with themes_', () => {
    const result = formatPluginTitle('$:/themes/tiddlywiki/vanilla');
    expect(result).toContain('themes_');
  });

  test('replaces special characters with underscore', () => {
    const result = formatPluginTitle('$:/plugins/author/name:test');
    // Colons should be replaced
    expect(decodeURIComponent(result)).not.toContain(':');
  });

  test('matches the expected format for a typical plugin title', () => {
    expect(formatPluginTitle('$:/plugins/Gk0Wk/CPL-Repo')).toBe('Gk0Wk_CPL-Repo');
  });
});

// ---- fetchPluginFromStaticMirrors -------------------------------------------

describe('fetchPluginFromStaticMirrors', () => {
  test('returns JSON from the first (netlify) mirror when it succeeds', async () => {
    const netlifyUrl = `${STATIC_MIRROR_BASES[0]}/plugins/Gk0Wk_CPL-Repo.json`;
    const githubUrl = `${STATIC_MIRROR_BASES[1]}/plugins/Gk0Wk_CPL-Repo.json`;

    const calls = mockFetch({
      [netlifyUrl]: { ok: true, body: VALID_PLUGIN_JSON },
    });

    const result = await fetchPluginFromStaticMirrors('$:/plugins/Gk0Wk/CPL-Repo');
    expect(result).toBe(VALID_PLUGIN_JSON);
    // Should have stopped after the first mirror
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(netlifyUrl);
  });

  test('falls through to the second (github.io) mirror when netlify fails', async () => {
    const netlifyUrl = `${STATIC_MIRROR_BASES[0]}/plugins/Gk0Wk_CPL-Repo.json`;
    const githubUrl = `${STATIC_MIRROR_BASES[1]}/plugins/Gk0Wk_CPL-Repo.json`;

    const calls = mockFetch({
      [netlifyUrl]: { ok: false, status: 503 },
      [githubUrl]: { ok: true, body: VALID_PLUGIN_JSON },
    });

    const result = await fetchPluginFromStaticMirrors('$:/plugins/Gk0Wk/CPL-Repo');
    expect(result).toBe(VALID_PLUGIN_JSON);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe(githubUrl);
  });

  test('rejects when all static mirrors fail', async () => {
    const netlifyUrl = `${STATIC_MIRROR_BASES[0]}/plugins/Gk0Wk_CPL-Repo.json`;
    const githubUrl = `${STATIC_MIRROR_BASES[1]}/plugins/Gk0Wk_CPL-Repo.json`;

    mockFetch({
      [netlifyUrl]: { ok: false, status: 404 },
      [githubUrl]: { ok: false, status: 404 },
    });

    await expect(
      fetchPluginFromStaticMirrors('$:/plugins/Gk0Wk/CPL-Repo'),
    ).rejects.toThrow('All static mirrors failed');
  });

  test('handles network-level errors and tries the next mirror', async () => {
    const netlifyUrl = `${STATIC_MIRROR_BASES[0]}/plugins/Gk0Wk_CPL-Repo.json`;
    const githubUrl = `${STATIC_MIRROR_BASES[1]}/plugins/Gk0Wk_CPL-Repo.json`;

    const calls = mockFetch({
      [netlifyUrl]: { networkError: true },
      [githubUrl]: { ok: true, body: VALID_PLUGIN_JSON },
    });

    const result = await fetchPluginFromStaticMirrors('$:/plugins/Gk0Wk/CPL-Repo');
    expect(result).toBe(VALID_PLUGIN_JSON);
    expect(calls).toHaveLength(2);
  });

  test('rejects when the response body is not JSON', async () => {
    const netlifyUrl = `${STATIC_MIRROR_BASES[0]}/plugins/Gk0Wk_CPL-Repo.json`;
    const githubUrl = `${STATIC_MIRROR_BASES[1]}/plugins/Gk0Wk_CPL-Repo.json`;

    mockFetch({
      [netlifyUrl]: { ok: true, body: '<html>not json</html>' },
      [githubUrl]: { ok: false, status: 404 },
    });

    await expect(
      fetchPluginFromStaticMirrors('$:/plugins/Gk0Wk/CPL-Repo'),
    ).rejects.toThrow('All static mirrors failed');
  });
});
