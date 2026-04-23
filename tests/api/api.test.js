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
        'Content-Type': 'application/json'
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

  beforeAll((done) => {
    const wikiPath = path.resolve(__dirname, '../..');
    
    serverProcess = spawn('npx', [
      'tiddlywiki',
      wikiPath,
      '--listen',
      `port=${TEST_PORT}`
    ], {
      cwd: wikiPath,
      stdio: 'pipe'
    });

    setTimeout(() => {
      done();
    }, 5000);
  }, 10000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  test('GET /cpl/api/stats/:pluginTitle should return stats', async () => {
    const response = await makeRequest('GET', '/cpl/api/stats/$:/plugins/test/plugin');
    
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
});
