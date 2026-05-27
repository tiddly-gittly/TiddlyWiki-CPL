const { DataStore } = require('../../src/CPLServer/lib/store/data.ts');
const { CompatibilityStore } = require('../../src/CPLServer/lib/store/compatibility.ts');
const { RateLimiter } = require('../../src/CPLServer/lib/security/rate-limit.ts');
const fs = require('fs');
const path = require('path');

// Mock data directory for tests
const TEST_DATA_DIR = path.resolve(__dirname, '../data-test');
const TEST_STATS_FILE = path.join(TEST_DATA_DIR, 'stats.json');
const TEST_RATINGS_FILE = path.join(TEST_DATA_DIR, 'ratings.json');
const COMPATIBILITY_DIR = path.resolve(process.cwd(), 'data', 'compatibility');

// Helper to clean up test data
function cleanup() {
  try {
    if (fs.existsSync(TEST_STATS_FILE)) fs.unlinkSync(TEST_STATS_FILE);
    if (fs.existsSync(TEST_RATINGS_FILE)) fs.unlinkSync(TEST_RATINGS_FILE);
    if (fs.existsSync(TEST_DATA_DIR)) fs.rmdirSync(TEST_DATA_DIR);
  } catch (e) {
    // ignore
  }
}

function cleanupCompatibilityTestFiles() {
  if (!fs.existsSync(COMPATIBILITY_DIR)) {
    return;
  }
  for (const fileName of fs.readdirSync(COMPATIBILITY_DIR)) {
    if (fileName.includes('unit-compat')) {
      fs.unlinkSync(path.join(COMPATIBILITY_DIR, fileName));
    }
  }
}

describe('DataStore', () => {
  beforeEach(() => {
    cleanup();
    DataStore._resetCache();
  });

  afterEach(() => {
    cleanup();
    DataStore._resetCache();
  });

  afterAll(() => {
    DataStore._resetCache();
  });

  test('should return default stats for new plugin', () => {
    const stats = DataStore.getStats('$:/plugins/test/plugin');
    expect(stats.downloadCount).toBe(0);
    expect(stats.lastUpdated).toBeNull();
    expect(stats.downloadsByIp).toEqual({});
  });

  test('should update download stats', () => {
    const pluginTitle = '$:/plugins/test/plugin';
    const ip = '192.168.1.1';
    
    const stats = DataStore.updateDownloadStats(pluginTitle, ip);
    
    expect(stats.downloadCount).toBe(1);
    expect(stats.downloadsByIp[ip]).toBeDefined();
  });

  test('should track multiple downloads', () => {
    const pluginTitle = '$:/plugins/test/plugin';
    
    DataStore.updateDownloadStats(pluginTitle, '192.168.1.1');
    DataStore.updateDownloadStats(pluginTitle, '192.168.1.2');
    DataStore.updateDownloadStats(pluginTitle, '192.168.1.1');
    
    // Flush to disk before reading (since getStats now aggregates from files)
    DataStore.flushSync();
    
    const stats = DataStore.getStats(pluginTitle);
    expect(stats.downloadCount).toBe(3);
  });

  test('should aggregate stats from multiple server files', () => {
    const pluginTitle = '$:/plugins/test/plugin';
    const DATA_DIR = path.resolve(process.cwd(), 'data');
    
    // Simulate multiple servers by creating multiple stats files
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Server 1 stats
    const stats1 = {
      [pluginTitle]: {
        downloadCount: 10,
        lastUpdated: '2024-01-01T00:00:00.000Z',
        downloadsByIp: {
          '192.168.1.1': '2024-01-01T00:00:00.000Z',
          '192.168.1.2': '2024-01-01T00:00:00.000Z'
        }
      }
    };
    fs.writeFileSync(path.join(DATA_DIR, 'stats.china.json'), JSON.stringify(stats1));
    
    // Server 2 stats
    const stats2 = {
      [pluginTitle]: {
        downloadCount: 5,
        lastUpdated: '2024-01-02T00:00:00.000Z',
        downloadsByIp: {
          '192.168.1.3': '2024-01-02T00:00:00.000Z'
        }
      }
    };
    fs.writeFileSync(path.join(DATA_DIR, 'stats.us.json'), JSON.stringify(stats2));
    
    // Get aggregated stats
    const aggregated = DataStore.getStats(pluginTitle);
    
    expect(aggregated.downloadCount).toBe(15); // 10 + 5
    expect(aggregated.lastUpdated).toBe('2024-01-02T00:00:00.000Z'); // Most recent
    expect(Object.keys(aggregated.downloadsByIp).length).toBe(3); // Merged IPs
    
    // Cleanup
    fs.unlinkSync(path.join(DATA_DIR, 'stats.china.json'));
    fs.unlinkSync(path.join(DATA_DIR, 'stats.us.json'));
  });

  test('should update ratings by GitHub user identity', () => {
    const pluginTitle = '$:/plugins/test/plugin';
    const user = {
      githubId: '1001',
      username: 'rating-user',
      avatar: 'https://example.com/avatar.png'
    };

    DataStore.addRating(pluginTitle, user, 5);
    const updated = DataStore.addRating(pluginTitle, user, 3);

    expect(updated.totalRatings).toBe(1);
    expect(updated.averageRating).toBe(3);
    expect(updated.ratings[0]).toMatchObject({
      githubId: '1001',
      username: 'rating-user',
      rating: 3
    });
  });
});

describe('CompatibilityStore', () => {
  beforeEach(() => {
    cleanupCompatibilityTestFiles();
  });

  afterEach(() => {
    cleanupCompatibilityTestFiles();
  });

  test('should aggregate approved reports from multiple mirror files', () => {
    const pluginTitle = '$:/plugins/unit-compat/subject';

    if (!fs.existsSync(COMPATIBILITY_DIR)) {
      fs.mkdirSync(COMPATIBILITY_DIR, { recursive: true });
    }

    const baseReport = {
      pluginTitle,
      reporterGithubId: '1',
      reporterUsername: 'tester',
      twVersionMin: '5.3.0',
      twVersionMax: '5.4.0',
      conflictingPlugins: [],
      description: 'report',
      status: 'approved',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    };

    fs.writeFileSync(
      path.join(COMPATIBILITY_DIR, '$__plugins_unit-compat_subject.china.json'),
      JSON.stringify([{ ...baseReport, id: 'china-report' }], null, 2)
    );
    fs.writeFileSync(
      path.join(COMPATIBILITY_DIR, '$__plugins_unit-compat_subject.us.json'),
      JSON.stringify([{ ...baseReport, id: 'us-report', createdAt: '2024-01-02T00:00:00.000Z' }], null, 2)
    );

    const reports = CompatibilityStore.getReports(pluginTitle, 'approved');

    expect(reports.map(report => report.id)).toEqual(['us-report', 'china-report']);
  });

  test('should find related reports where plugin appears as conflict target', () => {
    const pluginTitle = '$:/plugins/unit-compat/subject';
    const conflictTitle = '$:/plugins/unit-compat/conflict';

    const report = {
      id: 'related-report',
      pluginTitle,
      reporterGithubId: '1',
      reporterUsername: 'tester',
      conflictingPlugins: [{
        pluginTitle: conflictTitle,
        versionMin: '1.0.0',
        severity: 'error',
        type: 'conflict',
        description: 'conflict edge'
      }],
      description: 'report',
      status: 'approved',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    };

    CompatibilityStore.addReport(pluginTitle, report);

    const related = CompatibilityStore.getRelatedReports(conflictTitle, 'approved');

    expect(related).toHaveLength(1);
    expect(related[0].role).toBe('conflicting-plugin');
    expect(related[0].report.id).toBe('related-report');
    expect(related[0].conflictingPlugin.pluginTitle).toBe(conflictTitle);
  });
});

describe('RateLimiter', () => {
  test('should allow first download', () => {
    const canDownload = RateLimiter.canDownload('plugin1', '192.168.1.1');
    expect(canDownload).toBe(true);
  });

  test('should block rapid downloads from same IP', () => {
    const pluginTitle = 'plugin1';
    const ip = '192.168.1.1';
    
    RateLimiter.recordDownload(pluginTitle, ip);
    
    const canDownload = RateLimiter.canDownload(pluginTitle, ip);
    expect(canDownload).toBe(false);
  });

  test('should allow downloads from different IPs', () => {
    const pluginTitle = 'plugin1';
    
    RateLimiter.recordDownload(pluginTitle, '192.168.1.1');
    
    const canDownload = RateLimiter.canDownload(pluginTitle, '192.168.1.2');
    expect(canDownload).toBe(true);
  });

  test('should extract client IP from request', () => {
    const mockRequest = {
      headers: {
        'x-forwarded-for': '203.0.113.1, 192.168.1.1'
      },
      connection: {
        remoteAddress: '192.168.1.100'
      }
    };
    
    const ip = RateLimiter.getClientIp(mockRequest);
    expect(ip).toBe('203.0.113.1');
  });

  test('should fall back to connection IP', () => {
    const mockRequest = {
      headers: {},
      connection: {
        remoteAddress: '192.168.1.100'
      }
    };
    
    const ip = RateLimiter.getClientIp(mockRequest);
    expect(ip).toBe('192.168.1.100');
  });
});
