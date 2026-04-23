const { DataStore } = require('../../plugins/CPLServer/utils/data-store.js');
const { RateLimiter } = require('../../plugins/CPLServer/utils/rate-limiter.js');
const fs = require('fs');
const path = require('path');

// Mock data directory for tests
const TEST_DATA_DIR = path.resolve(__dirname, '../data-test');
const TEST_STATS_FILE = path.join(TEST_DATA_DIR, 'stats.json');
const TEST_RATINGS_FILE = path.join(TEST_DATA_DIR, 'ratings.json');

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

describe('DataStore', () => {
  beforeEach(() => {
    cleanup();
    // Override data directory path in DataStore
    // Note: In real implementation, you might need to make the paths configurable
  });

  afterEach(() => {
    cleanup();
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
    
    const stats = DataStore.getStats(pluginTitle);
    expect(stats.downloadCount).toBe(3);
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
