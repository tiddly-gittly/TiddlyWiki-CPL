const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  mergeDownloadStats,
  parseStatsTiddler,
  overlayServerTiddlers,
  laterTimestamp,
} = require('../../scripts/sync-data.ts');

const tid = stats =>
  [
    'title: $:/cpl/download-stats/plugin',
    'plugin-title: $:/plugins/example',
    'type: application/json',
    '',
    JSON.stringify(stats),
  ].join('\n');

describe('download stats merge', () => {
  test('keeps the higher count and the newer lastUpdated', () => {
    const merged = mergeDownloadStats(
      {
        downloadCount: 5,
        lastUpdated: '2026-08-01T00:00:00.000Z',
        downloadsByIp: { '1.1.1.1': '2026-08-01T00:00:00.000Z' },
      },
      {
        downloadCount: 3,
        lastUpdated: '2026-08-22T00:00:00.000Z',
        downloadsByIp: {
          '1.1.1.1': '2026-08-01T00:00:00.000Z',
          '8.8.8.8': '2026-08-22T00:00:00.000Z',
        },
      },
    );

    expect(merged.downloadCount).toBe(5);
    expect(merged.lastUpdated).toBe('2026-08-22T00:00:00.000Z');
    expect(merged.downloadsByIp).toEqual({
      '1.1.1.1': '2026-08-01T00:00:00.000Z',
      '8.8.8.8': '2026-08-22T00:00:00.000Z',
    });
  });

  test('unions IPs and never rewinds an IP timestamp', () => {
    const merged = mergeDownloadStats(
      {
        downloadCount: 2,
        lastUpdated: '2026-08-25T00:00:00.000Z',
        downloadsByIp: { '9.9.9.9': '2026-08-25T00:00:00.000Z' },
      },
      {
        downloadCount: 4,
        lastUpdated: '2026-08-20T00:00:00.000Z',
        downloadsByIp: { '8.8.8.8': '2026-08-20T00:00:00.000Z' },
      },
    );

    expect(merged.downloadCount).toBe(4);
    expect(merged.lastUpdated).toBe('2026-08-25T00:00:00.000Z');
    expect(merged.downloadsByIp).toEqual({
      '8.8.8.8': '2026-08-20T00:00:00.000Z',
      '9.9.9.9': '2026-08-25T00:00:00.000Z',
    });
  });

  test('laterTimestamp prefers the ISO-later value', () => {
    expect(
      laterTimestamp('2026-08-01T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
    ).toBe('2026-08-22T00:00:00.000Z');
  });

  test('parseStatsTiddler reads JSON bodies', () => {
    expect(
      parseStatsTiddler(
        tid({
          downloadCount: 3,
          lastUpdated: '2026-08-13T19:32:53.748Z',
          downloadsByIp: { '1.1.1.1': '2026-08-13T19:32:53.748Z' },
        }),
      ),
    ).toEqual({
      downloadCount: 3,
      lastUpdated: '2026-08-13T19:32:53.748Z',
      downloadsByIp: { '1.1.1.1': '2026-08-13T19:32:53.748Z' },
    });
  });
});

describe('overlayServerTiddlers', () => {
  test('merges this server stats and leaves the other mirror alone', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cpl-overlay-'));
    const source = path.join(root, 'source');
    const destination = path.join(root, 'destination');
    const statsDir = 'wiki/tiddlers/download-stats';

    try {
      fs.mkdirSync(path.join(source, statsDir), { recursive: true });
      fs.mkdirSync(path.join(destination, statsDir), { recursive: true });

      fs.writeFileSync(
        path.join(source, statsDir, 'plugin.china.tid'),
        tid({
          downloadCount: 5,
          lastUpdated: '2026-08-01T00:00:00.000Z',
          downloadsByIp: { '1.1.1.1': '2026-08-01T00:00:00.000Z' },
        }),
      );
      fs.writeFileSync(
        path.join(source, statsDir, 'plugin.us.tid'),
        tid({
          downloadCount: 1,
          lastUpdated: '2026-08-02T00:00:00.000Z',
          downloadsByIp: { '9.9.9.9': '2026-08-02T00:00:00.000Z' },
        }),
      );
      fs.writeFileSync(
        path.join(destination, statsDir, 'plugin.china.tid'),
        tid({
          downloadCount: 3,
          lastUpdated: '2026-08-22T00:00:00.000Z',
          downloadsByIp: {
            '1.1.1.1': '2026-08-01T00:00:00.000Z',
            '8.8.8.8': '2026-08-22T00:00:00.000Z',
          },
        }),
      );
      fs.writeFileSync(
        path.join(destination, statsDir, 'plugin.us.tid'),
        tid({
          downloadCount: 9,
          lastUpdated: '2026-08-22T00:00:00.000Z',
          downloadsByIp: { '8.8.8.8': '2026-08-22T00:00:00.000Z' },
        }),
      );

      overlayServerTiddlers({
        sourceRoot: source,
        destinationRoot: destination,
        serverId: 'china',
      });

      expect(
        parseStatsTiddler(
          fs.readFileSync(
            path.join(destination, statsDir, 'plugin.china.tid'),
            'utf8',
          ),
        ),
      ).toEqual({
        downloadCount: 5,
        lastUpdated: '2026-08-22T00:00:00.000Z',
        downloadsByIp: {
          '1.1.1.1': '2026-08-01T00:00:00.000Z',
          '8.8.8.8': '2026-08-22T00:00:00.000Z',
        },
      });
      expect(
        parseStatsTiddler(
          fs.readFileSync(
            path.join(destination, statsDir, 'plugin.us.tid'),
            'utf8',
          ),
        ),
      ).toEqual({
        downloadCount: 9,
        lastUpdated: '2026-08-22T00:00:00.000Z',
        downloadsByIp: { '8.8.8.8': '2026-08-22T00:00:00.000Z' },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('overlayServerTiddlers corrupt-file guards', () => {
  const setup = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cpl-overlay-'));
    const source = path.join(root, 'source');
    const destination = path.join(root, 'destination');
    const statsDir = 'wiki/tiddlers/download-stats';
    const commentsDir = 'wiki/tiddlers/comments';
    fs.mkdirSync(path.join(source, statsDir), { recursive: true });
    fs.mkdirSync(path.join(destination, statsDir), { recursive: true });
    return { root, source, destination, statsDir, commentsDir };
  };

  const validRemote = tid({
    downloadCount: 3,
    lastUpdated: '2026-08-22T00:00:00.000Z',
    downloadsByIp: { '8.8.8.8': '2026-08-22T00:00:00.000Z' },
  });

  const quarantinedFiles = source => {
    const dir = path.join(source, '.cpl-corrupt');
    return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  };

  test('empty local stats file never empties remote data (CPL#283)', () => {
    const { root, source, destination, statsDir } = setup();
    try {
      fs.writeFileSync(path.join(source, statsDir, 'plugin.us.tid'), '');
      fs.writeFileSync(
        path.join(destination, statsDir, 'plugin.us.tid'),
        validRemote,
      );

      overlayServerTiddlers({
        sourceRoot: source,
        destinationRoot: destination,
        serverId: 'us',
      });

      expect(
        fs.readFileSync(
          path.join(destination, statsDir, 'plugin.us.tid'),
          'utf8',
        ),
      ).toBe(validRemote);
      expect(fs.existsSync(path.join(source, statsDir, 'plugin.us.tid'))).toBe(
        false,
      );
      expect(quarantinedFiles(source)).toHaveLength(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('unparseable local stats file keeps remote data and is quarantined', () => {
    const { root, source, destination, statsDir } = setup();
    try {
      fs.writeFileSync(
        path.join(source, statsDir, 'plugin.us.tid'),
        'not-a-stats-file',
      );
      fs.writeFileSync(
        path.join(destination, statsDir, 'plugin.us.tid'),
        validRemote,
      );

      overlayServerTiddlers({
        sourceRoot: source,
        destinationRoot: destination,
        serverId: 'us',
      });

      expect(
        fs.readFileSync(
          path.join(destination, statsDir, 'plugin.us.tid'),
          'utf8',
        ),
      ).toBe(validRemote);
      expect(quarantinedFiles(source)).toHaveLength(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('empty local stats file is not added when remote has no copy', () => {
    const { root, source, destination, statsDir } = setup();
    try {
      fs.writeFileSync(path.join(source, statsDir, 'new-plugin.us.tid'), '');

      overlayServerTiddlers({
        sourceRoot: source,
        destinationRoot: destination,
        serverId: 'us',
      });

      expect(
        fs.existsSync(path.join(destination, statsDir, 'new-plugin.us.tid')),
      ).toBe(false);
      expect(quarantinedFiles(source)).toHaveLength(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('zero-byte comments tiddler keeps remote data and is quarantined', () => {
    const { root, source, destination, commentsDir } = setup();
    try {
      fs.mkdirSync(path.join(source, commentsDir), { recursive: true });
      fs.mkdirSync(path.join(destination, commentsDir), { recursive: true });
      fs.writeFileSync(path.join(source, commentsDir, 'note.us.tid'), '');
      fs.writeFileSync(
        path.join(destination, commentsDir, 'note.us.tid'),
        'title: note\n\nhello',
      );

      overlayServerTiddlers({
        sourceRoot: source,
        destinationRoot: destination,
        serverId: 'us',
      });

      expect(
        fs.readFileSync(
          path.join(destination, commentsDir, 'note.us.tid'),
          'utf8',
        ),
      ).toBe('title: note\n\nhello');
      expect(fs.existsSync(path.join(source, commentsDir, 'note.us.tid'))).toBe(
        false,
      );
      expect(quarantinedFiles(source)).toHaveLength(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
