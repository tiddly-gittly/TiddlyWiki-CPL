/**
 * API Integration Tests for CPL Server
 */

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const paths = require('../paths');

const TEST_HOST = '127.0.0.1';
const FETCHED_DIR = paths.pluginFetched;

function getAvailablePort(preferredPort = 9876, maxAttempts = 20) {
  return new Promise((resolve, reject) => {
    function tryPort(port, attempt) {
      if (attempt >= maxAttempts) {
        reject(new Error('Could not find an available port'));
        return;
      }
      const server = net.createServer();
      server.unref();
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          tryPort(port + 1, attempt + 1);
        } else {
          reject(err);
        }
      });
      server.listen(port, TEST_HOST, () => {
        const assigned = server.address().port;
        server.close(() => {
          // Brief cooldown to allow OS to release the port
          setTimeout(() => resolve(assigned), 50);
        });
      });
    }
    tryPort(preferredPort, 0);
  });
}
const TEST_FETCHED_PLUGIN_TITLE = '$:/plugins/test/fetched-preferred';
const TEST_FETCHED_PLUGIN_FILENAME = '$__plugins_test_fetched-preferred.json';
const TEST_FETCHED_PLUGIN_PATH = path.join(FETCHED_DIR, TEST_FETCHED_PLUGIN_FILENAME);
const TEST_COMPATIBILITY_DIR = paths.compatibility;
const RUNTIME_PLUGIN_CACHE_DIR = paths.cache.runtimePlugins;
const RUNTIME_PLUGIN_DIR_CACHE_DIR = paths.cache.runtimePluginDirs;
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
const blockedToken = createTestJwt({ githubId: '666', username: 'blocked-user' });

function authCookie(token) {
  return `cpl_jwt_token=${encodeURIComponent(token)}`;
}

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

function cleanupRuntimePluginCache() {
  for (const cacheDir of [RUNTIME_PLUGIN_CACHE_DIR, RUNTIME_PLUGIN_DIR_CACHE_DIR]) {
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  }
}

function createMakeRequest(port) {
  return function makeRequest(method, requestPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: TEST_HOST,
        port: port,
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
  };
}

describe('CPL Server API', () => {
  let serverProcess;
  let serverExitedEarly = false;
  let TEST_PORT;
  let makeRequest;

  function waitForServer(timeoutMs = 300000) {
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
    TEST_PORT = await getAvailablePort();
    makeRequest = createMakeRequest(TEST_PORT);
    createFetchedPluginFile();
    cleanupCompatibilityFiles();
    cleanupRuntimePluginCache();

    serverProcess = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', 'scripts/server.ts', '--prod'], {
      cwd: paths.projectRoot,
      stdio: 'pipe',
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        HOST: TEST_HOST,
        CPL_TEST_MODE: 'true',
        CPL_FORCE_RUNTIME_REBUILD: 'true',
        CPL_JWT_SECRET: JWT_SECRET,
        CPL_ADMIN_GITHUB_IDS: '42',
        CPL_BLOCKED_GITHUB_IDS: '666'
      }
    });

    let serverOutput = '';
    serverProcess.stdout.on('data', (data) => {
      serverOutput += data.toString();
    });
    serverProcess.stderr.on('data', (data) => {
      serverOutput += data.toString();
    });

    serverProcess.once('exit', (code) => {
      serverExitedEarly = true;
      if (serverOutput) {
        console.log(`[Server exited with code ${code}]\n`, serverOutput);
      }
    });

    try {
      await waitForServer();
    } catch (error) {
      if (serverOutput) {
        console.log('[Server Output at failure]\n', serverOutput);
      }
      throw error;
    }

    // Print captured output for debugging
    if (serverOutput) {
      console.log('[Server Output]\n', serverOutput);
    }
  }, 300000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.removeAllListeners('exit');
      serverProcess.kill();
    }
    cleanupFetchedPluginFile();
    cleanupCompatibilityFiles();
  });

  test('GET /cpl/stats/:pluginTitle should return stats', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/test/plugin');
    const response = await makeRequest('GET', `/cpl/stats/${pluginTitle}`);
    
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('downloadCount');
    expect(response.body).toHaveProperty('averageRating');
    expect(response.body).toHaveProperty('totalRatings');
  });

  test('native TiddlyWiki tiddler writes should be rejected in production mode', async () => {
    const response = await makeRequest('PUT', '/recipes/default/tiddlers/ReadonlyCheck', {
      title: 'ReadonlyCheck',
      text: 'This should not be writable through native tiddlyweb routes'
    });

    expect([401, 403]).toContain(response.statusCode);
  });

  test('POST /cpl/download/:pluginTitle should record download', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/test/plugin');
    const response = await makeRequest('POST', `/cpl/download/${pluginTitle}`);
    
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body).toHaveProperty('downloadCount');
  });

  test('POST /cpl/rate/:pluginTitle should require authentication', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/test/plugin');
    const response = await makeRequest('POST', `/cpl/rate/${pluginTitle}`, {
      rating: 5
    });

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test('POST /cpl/rate/:pluginTitle should record rating from auth cookie', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/test/plugin');
    const response = await makeRequest('POST', `/cpl/rate/${pluginTitle}`, {
      rating: 5
    }, {
      Cookie: authCookie(userToken)
    });
    
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body).toHaveProperty('averageRating');
  });

  test('POST /cpl/rate/:pluginTitle should reject blocked GitHub users', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/test/plugin');
    const response = await makeRequest('POST', `/cpl/rate/${pluginTitle}`, {
      rating: 4
    }, {
      Cookie: authCookie(blockedToken)
    });

    expect(response.statusCode).toBe(403);
    expect(response.body.success).toBe(false);
  });

  test('GET /cpl/changelog/:pluginTitle should return empty changelog payload when absent', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/test/plugin');
    const response = await makeRequest('GET', `/cpl/changelog/${pluginTitle}`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('hasChangelog', false);
    expect(response.body).toHaveProperty('changelog', null);
  });

  test('GET /cpl/download-plugin/:pluginTitle should serve plugin file', async () => {
    // Use an offline plugin that exists
    const pluginTitle = encodeURIComponent('dullroar_sitemap');
    const response = await makeRequest('GET', `/cpl/download-plugin/${pluginTitle}`);
    
    expect(response.statusCode).toBe(200);
    // Should be valid JSON plugin file (already parsed by makeRequest)
    expect(response.body).toHaveProperty('title');
    expect(response.body).toHaveProperty('plugin-type', 'plugin');
  });

  test('GET /cpl/download-plugin/:pluginTitle should return 404 for missing plugin', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/nonexistent/plugin');
    const response = await makeRequest('GET', `/cpl/download-plugin/${pluginTitle}`);
    
    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test('GET /cpl/download-plugin/:pluginTitle should prefer plugin-fetched over plugin-offline', async () => {
    const pluginTitle = encodeURIComponent(TEST_FETCHED_PLUGIN_TITLE);
    const response = await makeRequest('GET', `/cpl/download-plugin/${pluginTitle}`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('title', TEST_FETCHED_PLUGIN_TITLE);
    expect(response.body).toHaveProperty('plugin-type', 'plugin');
  });

  test('GET /cpl/download-plugin/:pluginTitle should reject unsafe version paths', async () => {
    const pluginTitle = encodeURIComponent(TEST_FETCHED_PLUGIN_TITLE);
    const unsafeVersion = encodeURIComponent(
      `../../plugin-fetched/${TEST_FETCHED_PLUGIN_FILENAME.replace(/\.json$/, '')}`
    );
    const response = await makeRequest(
      'GET',
      `/cpl/download-plugin/${pluginTitle}?version=${unsafeVersion}`
    );

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid plugin version');
  });

  test('POST /cpl/comments/:pluginTitle should require authentication', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/comment-test/no-auth');
    const response = await makeRequest('POST', `/cpl/comments/${pluginTitle}`, {
      content: 'Should be rejected'
    });

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test('comments should support submit, list, moderation, and all-recent flow', async () => {
    const pluginTitle = '$:/plugins/comment-test/subject';
    const encodedPluginTitle = encodeURIComponent(pluginTitle);

    // 1. Submit a comment as authenticated user
    const submitResponse = await makeRequest(
      'POST',
      `/cpl/comments/${encodedPluginTitle}`,
      { content: 'This is a test comment for E2E validation' },
      { Cookie: authCookie(userToken) }
    );

    expect(submitResponse.statusCode).toBe(201);
    expect(submitResponse.body.success).toBe(true);
    expect(submitResponse.body.comment.status).toBe('approved');
    expect(submitResponse.body.comment.content).toBe('This is a test comment for E2E validation');
    expect(submitResponse.body.comment).toHaveProperty('id');
    expect(submitResponse.body.comment).toHaveProperty('username');

    const commentId = submitResponse.body.comment.id;

    // 2. Public list should show auto-approved comments immediately
    const publicListResponse = await makeRequest(
      'GET',
      `/cpl/comments/${encodedPluginTitle}`
    );

    expect(publicListResponse.statusCode).toBe(200);
    expect(publicListResponse.body.comments).toHaveLength(1);
    expect(publicListResponse.body.comments[0].id).toBe(commentId);
    expect(publicListResponse.body.comments[0].status).toBe('approved');

    // 3. Pending queue is empty under block-only moderation
    const pendingResponse = await makeRequest(
      'GET',
      '/cpl/comments/pending',
      null,
      { Cookie: authCookie(adminToken) }
    );

    expect(pendingResponse.statusCode).toBe(200);
    expect(
      pendingResponse.body.comments.some(c => c.comment.id === commentId)
    ).toBe(false);

    // 4. all-recent should show the approved comment
    const allRecentAnonymous = await makeRequest('GET', '/cpl/comments/all-recent');
    expect(allRecentAnonymous.statusCode).toBe(200);
    expect(allRecentAnonymous.body.comments.some(c => c.id === commentId)).toBe(true);

    // 5. Approve is idempotent for already-approved comments
    const approveResponse = await makeRequest(
      'PUT',
      `/cpl/comments/${encodedPluginTitle}/${encodeURIComponent(commentId)}`,
      { status: 'approved' },
      { Cookie: authCookie(adminToken) }
    );

    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.body.success).toBe(true);

    // 6. Public list still shows the approved comment
    const publicListAfterApproval = await makeRequest(
      'GET',
      `/cpl/comments/${encodedPluginTitle}`
    );

    expect(publicListAfterApproval.statusCode).toBe(200);
    expect(publicListAfterApproval.body.comments).toHaveLength(1);
    expect(publicListAfterApproval.body.comments[0].id).toBe(commentId);
    expect(publicListAfterApproval.body.comments[0].status).toBe('approved');

    // 7. all-recent still shows the approved comment
    const allRecentAfterApproval = await makeRequest('GET', '/cpl/comments/all-recent');
    expect(allRecentAfterApproval.statusCode).toBe(200);
    expect(allRecentAfterApproval.body.comments.some(c => c.id === commentId)).toBe(true);

    // 8. Non-admin cannot access pending endpoint
    const pendingAsUser = await makeRequest(
      'GET',
      '/cpl/comments/pending',
      null,
      { Cookie: authCookie(userToken) }
    );
    expect([401, 403]).toContain(pendingAsUser.statusCode);

    // 9. Reject another comment
    const rejectSubmitResponse = await makeRequest(
      'POST',
      `/cpl/comments/${encodedPluginTitle}`,
      { content: 'This comment will be rejected' },
      { Cookie: authCookie(userToken) }
    );
    expect(rejectSubmitResponse.statusCode).toBe(201);

    const rejectCommentId = rejectSubmitResponse.body.comment.id;
    const rejectResponse = await makeRequest(
      'PUT',
      `/cpl/comments/${encodedPluginTitle}/${encodeURIComponent(rejectCommentId)}`,
      { status: 'rejected' },
      { Cookie: authCookie(adminToken) }
    );
    expect(rejectResponse.statusCode).toBe(200);

    // Rejected comments should not appear in public list
    const publicListAfterReject = await makeRequest(
      'GET',
      `/cpl/comments/${encodedPluginTitle}`
    );
    expect(publicListAfterReject.body.comments).toHaveLength(1); // Only the approved one

    // 10. Delete comment
    const deleteResponse = await makeRequest(
      'PUT',
      `/cpl/comments/${encodedPluginTitle}/${encodeURIComponent(commentId)}`,
      { status: 'deleted' },
      { Cookie: authCookie(adminToken) }
    );
    expect(deleteResponse.statusCode).toBe(200);

    const publicListAfterDelete = await makeRequest(
      'GET',
      `/cpl/comments/${encodedPluginTitle}`
    );
    expect(publicListAfterDelete.body.comments).toHaveLength(0);
  });

  test('compatibility reports should require authentication for submission', async () => {
    const pluginTitle = encodeURIComponent('$:/plugins/compat-test/no-auth');
    const response = await makeRequest('POST', `/cpl/compatibility/${pluginTitle}`, {
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
      `/cpl/compatibility/${encodedPluginTitle}`,
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
    expect(submitResponse.body.report.status).toBe('approved');
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
      '/cpl/compatibility/pending',
      null,
      { Authorization: `Bearer ${adminToken}` }
    );

    expect(pendingResponse.statusCode).toBe(200);
    expect(
      pendingResponse.body.reports.some(
        report => report.comment.id === submitResponse.body.report.id
      )
    ).toBe(false);

    const publicBeforeModeration = await makeRequest(
      'GET',
      `/cpl/compatibility/${encodedPluginTitle}`
    );

    expect(publicBeforeModeration.statusCode).toBe(200);
    expect(publicBeforeModeration.body.reports).toHaveLength(1);
    expect(publicBeforeModeration.body.reports[0].id).toBe(submitResponse.body.report.id);

    const moderateResponse = await makeRequest(
      'PUT',
      `/cpl/compatibility/${encodedPluginTitle}/${encodeURIComponent(submitResponse.body.report.id)}`,
      { status: 'approved' },
      { Authorization: `Bearer ${adminToken}` }
    );

    expect(moderateResponse.statusCode).toBe(200);
    expect(moderateResponse.body.report.status).toBe('approved');

    const publicAfterModeration = await makeRequest(
      'GET',
      `/cpl/compatibility/${encodedPluginTitle}`
    );

    expect(publicAfterModeration.statusCode).toBe(200);
    expect(publicAfterModeration.body.reports).toHaveLength(1);
    expect(publicAfterModeration.body.reports[0].id).toBe(submitResponse.body.report.id);

    const relatedResponse = await makeRequest(
      'GET',
      `/cpl/compatibility-related/${encodedConflictingTitle}`
    );

    expect(relatedResponse.statusCode).toBe(200);
    expect(relatedResponse.body.reports).toHaveLength(1);
    expect(relatedResponse.body.reports[0].role).toBe('conflicting-plugin');
    expect(relatedResponse.body.reports[0].conflictingPlugin.pluginTitle).toBe(conflictingTitle);
  });
});
