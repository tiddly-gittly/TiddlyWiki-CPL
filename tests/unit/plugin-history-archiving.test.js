const fs = require('fs');
const path = require('path');
const os = require('os');
const paths = require('../paths');

// Import the archive helper from fetch-plugins via the same ts transpile path
// that jest uses.
const {
  archiveOldPluginVersion,
} = require('../../scripts/fetch-plugins.ts');
const { sanitizePluginFileName } = require('../../src/CPLServer/lib/files.ts');

describe('plugin history archiving', () => {
  let tmpDir;
  let fetchedDir;
  let historyDir;

  const PLUGIN_TITLE = '$:/plugins/test/archive-test';
  const SANITIZED = sanitizePluginFileName(PLUGIN_TITLE);

  const makePluginJson = (version) =>
    JSON.stringify({
      title: PLUGIN_TITLE,
      version,
      'plugin-type': 'plugin',
      text: JSON.stringify({ tiddlers: {} }),
    });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpl-archive-test-'));
    fetchedDir = path.join(tmpDir, 'plugin-fetched');
    historyDir = path.join(tmpDir, 'plugin-fetched-history');
    fs.mkdirSync(fetchedDir, { recursive: true });
    fs.mkdirSync(historyDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('should archive old version when new version differs', () => {
    const oldContent = makePluginJson('1.0.0');

    const archived = archiveOldPluginVersion(
      oldContent,
      '1.0.0',
      '2.0.0',
      PLUGIN_TITLE,
      historyDir,
    );

    expect(archived).toBe(true);
    const historyFile = path.join(
      historyDir,
      SANITIZED,
      '1.0.0.json',
    );
    expect(fs.existsSync(historyFile)).toBe(true);
    const archivedContent = fs.readFileSync(historyFile, 'utf-8');
    expect(archivedContent).toBe(oldContent);
  });

  test('should NOT archive when versions are the same', () => {
    const archived = archiveOldPluginVersion(
      makePluginJson('1.0.0'),
      '1.0.0',
      '1.0.0',
      PLUGIN_TITLE,
      historyDir,
    );

    expect(archived).toBe(false);
    expect(
      fs.existsSync(path.join(historyDir, SANITIZED)),
    ).toBe(false);
  });

  test('should NOT archive when old content is missing', () => {
    const archived = archiveOldPluginVersion(
      undefined,
      '1.0.0',
      '2.0.0',
      PLUGIN_TITLE,
      historyDir,
    );

    expect(archived).toBe(false);
  });

  test('should NOT archive unsafe version names', () => {
    const archived = archiveOldPluginVersion(
      makePluginJson('../attack'),
      '../attack',
      '2.0.0',
      PLUGIN_TITLE,
      historyDir,
    );

    expect(archived).toBe(false);
  });

  test('should not overwrite an already-archived version', () => {
    const oldContent = makePluginJson('1.0.0');

    // First archive succeeds.
    const first = archiveOldPluginVersion(
      oldContent,
      '1.0.0',
      '2.0.0',
      PLUGIN_TITLE,
      historyDir,
    );
    expect(first).toBe(true);

    // Second attempt with the same version should be a no-op.
    const second = archiveOldPluginVersion(
      'different content',
      '1.0.0',
      '3.0.0',
      PLUGIN_TITLE,
      historyDir,
    );
    expect(second).toBe(false);

    // The file still contains the original content.
    const historyFile = path.join(
      historyDir,
      SANITIZED,
      '1.0.0.json',
    );
    expect(fs.readFileSync(historyFile, 'utf-8')).toBe(oldContent);
  });

  test('full simulated flow: fetch new version, archive old', () => {
    // 1. Put an "old" plugin into the fetched directory.
    const fetchedFile = path.join(fetchedDir, `${SANITIZED}.json`);
    const oldContent = makePluginJson('1.0.0');
    fs.writeFileSync(fetchedFile, oldContent, 'utf-8');

    // 2. Read old version, delete old file, write new file (simulating download).
    const readOld = fs.readFileSync(fetchedFile, 'utf-8');
    const oldVersion = JSON.parse(readOld).version;
    fs.unlinkSync(fetchedFile);
    const newContent = makePluginJson('2.0.0');
    fs.writeFileSync(fetchedFile, newContent, 'utf-8');

    // 3. Archive the old version.
    const archived = archiveOldPluginVersion(
      readOld,
      oldVersion,
      '2.0.0',
      PLUGIN_TITLE,
      historyDir,
    );
    expect(archived).toBe(true);

    // 4. Assert both directories have the correct files.
    expect(fs.readFileSync(fetchedFile, 'utf-8')).toBe(newContent);
    const historyFile = path.join(
      historyDir,
      SANITIZED,
      '1.0.0.json',
    );
    expect(fs.existsSync(historyFile)).toBe(true);
    expect(fs.readFileSync(historyFile, 'utf-8')).toBe(oldContent);
  });
});
