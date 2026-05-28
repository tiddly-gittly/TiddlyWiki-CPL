/**
 * Static Repo Server Helper
 *
 * Starts a minimal HTTP server that serves `cache/plugins/` under the root
 * path, mirroring the production layout where Netlify/GH Pages serves
 * `dist/repo/` (which equals `cache/plugins/` after `cp -r cache/plugins dist/repo`).
 *
 * This lets E2E tests exercise the exact URL shape a legacy CPL client uses
 * when checking for updates:
 *   GET /Gk0Wk_CPL-Server/__meta__.json
 *   GET /update.json
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const STATIC_REPO_PORT = 8083;
const STATIC_REPO_HOST = '127.0.0.1';

let staticRepoServer = null;

/**
 * Start a static file server that maps GET /<path> to cache/plugins/<path>.
 * @returns {Promise<void>}
 */
function startStaticRepoServer() {
  const cachePluginsDir = path.resolve(__dirname, '../../../cache/plugins');
  return new Promise((resolve, reject) => {
    staticRepoServer = http.createServer((req, res) => {
      // Sanitize the URL to prevent path traversal
      const safePath = path.normalize(req.url || '/').replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(cachePluginsDir, safePath);

      // Ensure the resolved path is inside cachePluginsDir
      if (!filePath.startsWith(cachePluginsDir + path.sep) && filePath !== cachePluginsDir) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found', path: safePath }));
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(data);
      });
    });

    staticRepoServer.listen(STATIC_REPO_PORT, STATIC_REPO_HOST, () => {
      console.log(
        `[Static Repo Server] Serving cache/plugins on http://${STATIC_REPO_HOST}:${STATIC_REPO_PORT}`
      );
      resolve();
    });

    staticRepoServer.on('error', reject);
  });
}

/**
 * Stop the static file server.
 */
function stopStaticRepoServer() {
  if (staticRepoServer) {
    staticRepoServer.close();
    staticRepoServer = null;
    console.log('[Static Repo Server] Stopped');
  }
}

module.exports = {
  startStaticRepoServer,
  stopStaticRepoServer,
  STATIC_REPO_URL: `http://${STATIC_REPO_HOST}:${STATIC_REPO_PORT}`,
};
