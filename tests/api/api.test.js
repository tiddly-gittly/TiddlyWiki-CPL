/**
 * API Integration Tests for CPL Server
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const TEST_PORT = 9876;
const TEST_HOST = 'localhost';

function makeRequest(method, requestPath, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: TEST_HOST,
      port: TEST_PORT,
      path: requestPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'TiddlyWiki'
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

    serverProcess = spawn('node', ['scripts/server.js'], {
      cwd: wikiPath,
      stdio: 'pipe',
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        HOST: TEST_HOST
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
});
