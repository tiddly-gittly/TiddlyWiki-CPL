/**
 * API Integration Tests for CPL Server
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TEST_PORT = 9876;
const TEST_HOST = 'localhost';
const FETCHED_DIR = path.resolve(__dirname, '../../wiki/files/plugin-fetched');
const TEST_FETCHED_PLUGIN_TITLE = '$:/plugins/test/fetched-preferred';
const TEST_FETCHED_PLUGIN_FILENAME = '$__plugins_test_fetched-preferred.json';
const TEST_FETCHED_PLUGIN_PATH = path.join(FETCHED_DIR, TEST_FETCHED_PLUGIN_FILENAME);
const TEST_DATA_DIR = path.resolve(__dirname, '../../data');
const TEST_COMPATIBILITY_DIR = path.join(TEST_DATA_DIR, 'compatibility');
const JWT_SECRET = 'test-secret';

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createTestJwt(payload) {
  const crypto = require('crypto');
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

const userToken = createTestJwt({ githubId: '1001', username: 'compat-user' });
const adminToken = createTestJwt({ githubId: '42', username: 'compat-admin' });

function createFetchedPluginFile() {
  if (!fs.existsSync(FETCHED_DIR)) {
    fs.mkdirSync(FETCHED_DIR, { recursive: true });
  }
  fs.writeFileSync(TEST_FETCHED_PLUGIN_PATH, JSON.stringify({
    title: TEST_FETCHED_PLUGIN_TITLE,
    'plugin-type': 'plugin',
    text: JSON.stringify({
      tiddlers: {
        [`${TEST_FETCHED_PLUGIN_TITLE}/readme`]: {
          title: `${TEST_FETCHED_PLUGIN_TITLE}/readme`,
          text: 'Fetched plugin variant'
        }
      }
    })
  }), 'utf-8');
}

function cleanupFetchedPluginFile() {
  if (fs.existsSync(TEST_FETCHED_PLUGIN_PATH)) {
    fs.unlinkSync(TEST_FETCHED_PLUGIN_PATH);
  }
}

function cleanupCompatibilityFiles() {
  if (!fs.existsSync(TEST_COMPATIBILITY_DIR)) {
    return;
  }
  for (const fileName of fs.readdirSync(TEST_COMPATIBILITY_DIR)) {
    if (fileName.includes('compat-test')) {
      fs.unlinkSync(path.join(TEST_COMPATIBILITY_DIR, fileName));
    }
  }
}

function makeRequest(method, requestPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: TEST_HOST,
      port: TEST_PORT,
      path: requestPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'TiddlyWiki',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

describe('CPL Server API', () => {
  let serverProcess;
  let serverExitedEarly = false;

  function waitForServer(timeoutMs = 15000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      function tryConnect() {
        if (serverExitedEarly) {
          reject(new Error('Server process exited before becoming ready'));
          return;
        }
        const req = http.request(
          {
            hostname: TEST_HOST,
            port: TEST_PORT,
            path: '/',
            method: 'GET'
          },
          (res) => {
            res.resume();
            resolve();
          }
        );
        req.on('error', () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error('Timed out waiting for server readiness'));
            return;
          }
          setTimeout(tryConnect, 250);
        });
        req.end();
      }
      tryConnect();
    });
  }

  beforeAll(async () => {
    const wikiPath = path.resolve(__dirname, '../..');
    createFetchedPluginFile();
    cleanupCompatibilityFiles();

    serverProcess = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', 'scripts/server.ts'], {
      cwd: wikiPath,
      stdio: 'pipe',
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        HOST: TEST_HOST,
        CPL_TEST_MODE: 'true',
        CPL_JWT_SECRET: JWT_SECRET,
        CPL_ADMIN_GITHUB_IDS: '42'
      }
    });

    let serverOutput = '';
    serverProcess.stdout.on('data', (data) => {
      serverOutput += data.toString();
    });
    serverProcess.stderr.on('data', (data) => {
      serverOutput += data.toString();
    });

    serverProcess.once('exit', () => {
      serverExitedEarly = true;
    });

    await waitForServer();

    // Print captured output for debugging
    if (serverOutput) {
      console.log('[Server Output]\n', serverOutput);
    }
  }, 30000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
    cleanupFetchedPluginFile();
    cleanupCompatibilityFiles();
  });

  test('GET /cpl/api/stats/:pluginTitle should return stats', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/test/plugin');
    const response = await makeRequest('GET', `/cpl/api/stats/${pluginTitle}`);
    
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('downloadCount');
    expect(response.body).toHaveProperty('averageRating');
    expect(response.body).toHaveProperty('totalRatings');
  });

  test('POST /cpl/api/download/:pluginTitle should record download', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/test/plugin');
    const response = await makeRequest('POST', `/cpl/api/download/${pluginTitle}`);
    
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body).toHaveProperty('downloadCount');
  });

  test('POST /cpl/api/rate/:pluginTitle should record rating', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/test/plugin');
    const response = await makeRequest('POST', `/cpl/api/rate/${pluginTitle}`, {
      rating: 5
    });
    
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body).toHaveProperty('averageRating');
  });

  test('GET /cpl/api/changelog/:pluginTitle should return changelog or 404', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/test/plugin');
    const response = await makeRequest('GET', `/cpl/api/changelog/${pluginTitle}`);
    
    expect([200, 404]).toContain(response.statusCode);
  });

  test('GET /cpl/api/download-plugin/:pluginTitle should serve plugin file', async () => {
    // Use an offline plugin that exists
    const pluginTitle = encodeURIComponent('dullroar_sitemap');
    const response = await makeRequest('GET', `/cpl/api/download-plugin/${pluginTitle}`);
    
    expect(response.statusCode).toBe(200);
    // Should be valid JSON plugin file (already parsed by makeRequest)
    expect(response.body).toHaveProperty('title');
    expect(response.body).toHaveProperty('plugin-type', 'plugin');
  });

  test('GET /cpl/api/download-plugin/:pluginTitle should return 404 for missing plugin', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/nonexistent/plugin');
    const response = await makeRequest('GET', `/cpl/api/download-plugin/${pluginTitle}`);
    
    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test('GET /cpl/api/download-plugin/:pluginTitle should prefer plugin-fetched over plugin-offline', async () => {
    const pluginTitle = encodeURIComponent(TEST_FETCHED_PLUGIN_TITLE);
    const response = await makeRequest('GET', `/cpl/api/download-plugin/${pluginTitle}`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('title', TEST_FETCHED_PLUGIN_TITLE);
    expect(response.body).toHaveProperty('plugin-type', 'plugin');
  });

  test('compatibility reports should require authentication for submission', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/compat-test/no-auth');
    const response = await makeRequest('POST', `/cpl/api/compatibility/${pluginTitle}`, {
      description: 'Should be rejected'
    });

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test('compatibility reports should support structured submit, moderation, list, and reverse lookup', async () => {
    const pluginTitle = '$:/plugins/compat-test/subject';
    const conflictingTitle = '$:/plugins/compat-test/conflict';
    const encodedPluginTitle = encodeURIComponent(pluginTitle);
    const encodedConflictingTitle = encodeURIComponent(conflictingTitle);

    const submitResponse = await makeRequest(
      'POST',
      `/cpl/api/compatibility/${encodedPluginTitle}`,
      {
        twVersionMin: '5.3.0',
        twVersionMax: '5.4.0',
        conflictingPlugins: [
          {
            pluginTitle: conflictingTitle,
            versionMin: '1.0.0',
            versionMax: '2.0.0',
            severity: 'warning',
            type: 'breaks',
            description: 'Breaks widget rendering'
          }
        ],
        description: 'Structured compatibility report'
      },
      { Authorization: `Bearer ${userToken}` }
    );

    expect(submitResponse.statusCode).toBe(201);
    expect(submitResponse.body.report.status).toBe('pending');
    expect(submitResponse.body.report.twVersionMin).toBe('5.3.0');
    expect(submitResponse.body.report.conflictingPlugins[0]).toMatchObject({
      pluginTitle: conflictingTitle,
      versionMin: '1.0.0',
      versionMax: '2.0.0',
      severity: 'warning',
      type: 'breaks'
    });

    const pendingResponse = await makeRequest(
      'GET',
      '/cpl/api/compatibility/pending',
      null,
      { Authorization: `Bearer ${adminToken}` }
    );

    expect(pendingResponse.statusCode).toBe(200);
    expect(pendingResponse.body.reports.some(report => report.id === submitResponse.body.report.id)).toBe(true);

    const publicBeforeModeration = await makeRequest(
      'GET',
      `/cpl/api/compatibility/${encodedPluginTitle}`
    );

    expect(publicBeforeModeration.statusCode).toBe(200);
    expect(publicBeforeModeration.body.reports).toEqual([]);

    const moderateResponse = await makeRequest(
      'PUT',
      `/cpl/api/compatibility/${encodedPluginTitle}/${encodeURIComponent(submitResponse.body.report.id)}`,
      { status: 'approved' },
      { Authorization: `Bearer ${adminToken}` }
    );

    expect(moderateResponse.statusCode).toBe(200);
    expect(moderateResponse.body.report.status).toBe('approved');

    const publicAfterModeration = await makeRequest(
      'GET',
      `/cpl/api/compatibility/${encodedPluginTitle}`
    );

    expect(publicAfterModeration.statusCode).toBe(200);
    expect(publicAfterModeration.body.reports).toHaveLength(1);
    expect(publicAfterModeration.body.reports[0].id).toBe(submitResponse.body.report.id);

    const relatedResponse = await makeRequest(
      'GET',
      `/cpl/api/compatibility-related/${encodedConflictingTitle}`
    );

    expect(relatedResponse.statusCode).toBe(200);
    expect(relatedResponse.body.reports).toHaveLength(1);
    expect(relatedResponse.body.reports[0].role).toBe('conflicting-plugin');
    expect(relatedResponse.body.reports[0].conflictingPlugin.pluginTitle).toBe(conflictingTitle);
  });
});
