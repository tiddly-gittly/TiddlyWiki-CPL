/**
 * Mock Static Repo Server Helper
 *
 * Starts a minimal HTTP server that serves mock plugin data,
 * without depending on real cache/plugins/ files or external networks.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const MOCK_REPO_PORT = 8083;
const MOCK_REPO_HOST = '127.0.0.1';
const MOCK_REPO_URL = `http://${MOCK_REPO_HOST}:${MOCK_REPO_PORT}`;

let staticRepoServer = null;
let mockRepoDir = null;

const MOCK_PLUGIN_TITLE = '$:/plugins/test/e2e-mock-plugin';

function createMockRepoDir() {
  const tmpDir = path.join(
    require('os').tmpdir(),
    `cpl-e2e-mock-repo-${Date.now()}`,
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  // Create a plugin entry with two historical versions so the
  // version-selector dropdown renders in the detail modal.
  const pluginDir = path.join(tmpDir, 'test_e2e-mock-plugin');
  fs.mkdirSync(pluginDir, { recursive: true });

  const makePluginBundle = (version) => ({
    title: MOCK_PLUGIN_TITLE,
    description: 'E2E test mock plugin',
    version,
    author: 'test',
    'plugin-type': 'plugin',
    text: JSON.stringify({ tiddlers: {} }),
  });

  fs.writeFileSync(
    path.join(pluginDir, '__meta__.json'),
    JSON.stringify({
      title: MOCK_PLUGIN_TITLE,
      description: 'E2E test mock plugin',
      version: '2.0.0',
      latest: '2.0.0',
      author: 'test',
      versions: ['1.0.0', '2.0.0'],
    }),
  );

  fs.writeFileSync(
    path.join(pluginDir, 'latest.json'),
    JSON.stringify(makePluginBundle('2.0.0')),
  );
  fs.writeFileSync(
    path.join(pluginDir, '1.0.0.json'),
    JSON.stringify(makePluginBundle('1.0.0')),
  );
  fs.writeFileSync(
    path.join(pluginDir, '2.0.0.json'),
    JSON.stringify(makePluginBundle('2.0.0')),
  );

  // Create update.json
  fs.writeFileSync(
    path.join(tmpDir, 'update.json'),
    JSON.stringify({
      [MOCK_PLUGIN_TITLE]: { version: '2.0.0' },
    }),
  );

  // Create index.json — include the versions array so the client
  // plugin-detail modal can enumerate historical versions.
  fs.writeFileSync(
    path.join(tmpDir, 'index.json'),
    JSON.stringify([
      {
        title: MOCK_PLUGIN_TITLE,
        description: 'E2E test mock plugin',
        version: '2.0.0',
        category: 'Functional',
        versions: ['1.0.0', '2.0.0'],
      },
    ]),
  );

  return tmpDir;
}

function startMockRepoServer() {
  mockRepoDir = createMockRepoDir();

  return new Promise((resolve, reject) => {
    staticRepoServer = http.createServer((req, res) => {
      const safePath = (req.url || '/')
        .replace(/\?.*$/, '')
        .replace(/^\/+/, '');
      const filePath = path.join(mockRepoDir, safePath);

      if (!filePath.startsWith(mockRepoDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(data);
      });
    });

    staticRepoServer.listen(MOCK_REPO_PORT, MOCK_REPO_HOST, () => {
      console.log(`[Mock Repo Server] Serving on ${MOCK_REPO_URL}`);
      resolve();
    });

    staticRepoServer.on('error', reject);
  });
}

function stopMockRepoServer() {
  if (staticRepoServer) {
    staticRepoServer.close();
    staticRepoServer = null;
  }
  if (mockRepoDir) {
    try {
      fs.rmSync(mockRepoDir, { recursive: true, force: true });
    } catch {}
    mockRepoDir = null;
  }
  console.log('[Mock Repo Server] Stopped');
}

module.exports = {
  startMockRepoServer,
  stopMockRepoServer,
  MOCK_REPO_URL,
  MOCK_PLUGIN_TITLE,
};
