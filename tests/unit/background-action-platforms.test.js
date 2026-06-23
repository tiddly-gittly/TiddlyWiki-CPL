/**
 * Unit tests for BackgroundAction browser-only execution, decoupled
 * mirror/server detection, and tightened auto-load triggers.
 *
 * Verifies:
 * 1. All CPL BackgroundAction tiddlers have platforms: browser
 * 2. Mirror type and server type are tracked independently
 * 3. auto-fetch-plugin-index triggers only in CPL layout (auto-load-trigger + layout match)
 * 4. auto-fetch-all-stats only runs after the server is confirmed available
 * 5. auto-fetch-plugin-activity only fires on plugin navigation, not every history change
 * 6. server-init.ts does not create regular config tiddlers
 */
const fs = require('fs');
const path = require('path');
const paths = require('../paths');

const BG_DIR = path.join(
  paths.projectRoot,
  'src',
  'CPLPlugin',
  'background-actions',
);

function readTid(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseTidFields(content) {
  const fields = {};
  const lines = content.split('\n');
  let inBody = false;
  for (const line of lines) {
    if (inBody) continue;
    if (line === '') {
      inBody = true;
      continue;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();
      fields[key] = value;
    }
  }
  return { fields, body: content.split('\n\n').slice(1).join('\n\n') };
}

const BG_FILES = fs.readdirSync(BG_DIR).filter(f => f.endsWith('.tid'));

describe('BackgroundAction platform enforcement', () => {
  test('all CPL BackgroundActions must have platforms: browser', () => {
    for (const file of BG_FILES) {
      const content = readTid(path.join(BG_DIR, file));
      const { fields } = parseTidFields(content);

      expect(fields.tags).toBe('$:/tags/BackgroundAction');
      expect(fields.platforms).toBe('browser');
    }
  });

  test('BackgroundAction count matches expected (10 total after 2026.06-23 fix)', () => {
    // 1. auto-sync-mirror-type      (decoupled mirror type)
    // 2. auto-sync-server-repo      (server-only, split from combined)
    // 3. auto-fetch-plugin-index    (auto-load-database)
    // 4. auto-probe-server
    // 5. auto-fetch-update-json
    // 6. auto-fetch-comments
    // 7. auto-fetch-all-stats
    // 8. auto-fetch-plugin-activity
    // 9. auto-fetch-auth-state
    // 10. auto-record-download
    expect(BG_FILES.length).toBe(10);
  });
});

describe('Mirror-type and server-type decoupling', () => {
  test('auto-sync-mirror-type only tracks current-static-repo', () => {
    const content = readTid(path.join(BG_DIR, 'auto-sync-mirror-type.tid'));
    const { fields } = parseTidFields(content);

    // Should only track static repo changes
    expect(fields['track-filter']).toContain('current-static-repo');
    expect(fields['track-filter']).not.toContain('current-server-repo');

    // Should only set mirror-type, not server-type, api-base, etc.
    expect(content).toContain('mirror-type');
    expect(content).not.toContain('server-type');
    expect(content).not.toContain('api-base');
    expect(content).not.toContain('probe-refresh-token');
  });

  test('auto-sync-server-repo only tracks current-server-repo', () => {
    const content = readTid(path.join(BG_DIR, 'auto-sync-server-repo.tid'));
    const { fields } = parseTidFields(content);

    // Should only track server repo changes, NOT static repo
    expect(fields['track-filter']).toContain('current-server-repo');
    expect(fields['track-filter']).not.toContain('current-static-repo');
  });

  test('auto-sync-server-repo sets api-base from server repo', () => {
    const content = readTid(path.join(BG_DIR, 'auto-sync-server-repo.tid'));
    expect(content).toContain('api-base');
    expect(content).toContain('trim[]removesuffix[/repo]');
  });

  test('auto-probe-server tracks probe-refresh-token and api-base independently', () => {
    const content = readTid(path.join(BG_DIR, 'auto-probe-server.tid'));
    const { fields } = parseTidFields(content);

    // Should track the probe refresh token and api-base, not mirror stuff
    expect(fields['track-filter']).toContain('probe-refresh-token');
    expect(fields['track-filter']).toContain('api-base');
    expect(fields['track-filter']).not.toContain('mirror-type');
    expect(fields['track-filter']).not.toContain('static-repo');
  });
});

describe('Auto-load database trigger mechanism', () => {
  test('auto-fetch-plugin-index tracks CPL layout match and auto-load-trigger', () => {
    const content = readTid(path.join(BG_DIR, 'auto-fetch-plugin-index.tid'));
    const { fields } = parseTidFields(content);

    // Should only fire when in CPL layout or the startup trigger is set
    expect(fields['track-filter']).toContain('auto-load-trigger');
    expect(fields['track-filter']).toContain('layout/layout');
  });

  test('auto-fetch-plugin-index only fetches in CPL layout with auto-load enabled and no existing index', () => {
    const content = readTid(path.join(BG_DIR, 'auto-fetch-plugin-index.tid'));

    expect(content).toContain('layout/layout');
    expect(content).toContain('auto-load-database-in-cpl-layout');
    expect(content).toContain('plugins-index');
  });

  test('server-init.ts sets auto-load-trigger only in CPL layout and does not create config tiddlers', () => {
    const serverInit = fs.readFileSync(
      path.join(
        paths.projectRoot,
        'src',
        'CPLPlugin',
        'startup',
        'server-init.ts',
      ),
      'utf8',
    );

    // Must set the startup trigger for the wikitext BackgroundAction
    expect(serverInit).toContain('auto-load-trigger');
    expect(serverInit).toContain('auto-load-database-in-cpl-layout');
    expect(serverInit).toContain('CPL_LAYOUT_TITLE');
    expect(serverInit).toContain('platforms');
    expect(serverInit).toContain("'browser'");

    // Must NOT create regular user tiddlers for the config shadows
    expect(serverInit).not.toContain('tw.wiki.addTiddler({\n    title: STATIC_REPO_TITLE');
    expect(serverInit).not.toContain('tw.wiki.addTiddler({\n    title: SERVER_REPO_TITLE');
    expect(serverInit).not.toContain('getDefaultConfigField');
    expect(serverInit).not.toContain('CONFIG_MULTIDICT_TITLE');
  });
});

describe('Tightened background action triggers', () => {
  test('auto-fetch-all-stats only runs after server is confirmed available', () => {
    const content = readTid(path.join(BG_DIR, 'auto-fetch-all-stats.tid'));
    const { fields } = parseTidFields(content);

    expect(fields['track-filter']).toContain('api-status');
    expect(fields['track-filter']).toContain('available');
    expect(fields['track-filter']).not.toContain('server-type');
    // Body must also guard on api-status so it doesn't fetch when leaving 'available'
    expect(content).toContain('[[$:/temp/CPL-Repo/api-status]get[text]match[available]]');
  });

  test('auto-fetch-plugin-activity does not track raw current-tiddler', () => {
    const content = readTid(path.join(BG_DIR, 'auto-fetch-plugin-activity.tid'));
    const { fields } = parseTidFields(content);

    // Should fire when the plugin title or server config changes, not on every navigation
    expect(fields['track-filter']).toContain('cpl.title');
    expect(fields['track-filter']).toContain('PluginWiki');
    expect(fields['track-filter']).not.toContain('[[$:/HistoryList]get[current-tiddler]] ');
  });
});
