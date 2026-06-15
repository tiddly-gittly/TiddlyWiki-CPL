const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const paths = require('../../paths');
require('ts-node/register/transpile-only');
const { ensureRuntimePluginsBuilt } = require('../../../scripts/runtime-plugins.ts');

const BLANK_WIKI_PORT_START = 8081;
const BLANK_WIKI_PORT_END = 8095;
const BLANK_WIKI_HOST = '127.0.0.1';

let blankWikiProcess = null;
let blankWikiPath = null;
let blankWikiPort = BLANK_WIKI_PORT_START;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, BLANK_WIKI_HOST);
  });
}

async function findAvailablePort() {
  for (let port = BLANK_WIKI_PORT_START; port <= BLANK_WIKI_PORT_END; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(
    `No available port found for blank wiki in range ${BLANK_WIKI_PORT_START}-${BLANK_WIKI_PORT_END}`,
  );
}

function waitForBlankWiki(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      const req = http.request(
        {
          hostname: BLANK_WIKI_HOST,
          port,
          path: '/',
          method: 'GET',
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            // Wait until the server has finished booting and serves the wiki
            // page (not the "Upgrade Required" interim page).
            if (
              res.statusCode === 200 &&
              (body.includes('GettingStarted') || body.includes('My TiddlyWiki'))
            ) {
              resolve();
              return;
            }
            if (Date.now() - start > timeoutMs) {
              reject(
                new Error(
                  `Timed out waiting for blank wiki readiness (status ${res.statusCode})`,
                ),
              );
              return;
            }
            setTimeout(tryConnect, 250);
          });
        },
      );
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Timed out waiting for blank wiki readiness'));
          return;
        }
        setTimeout(tryConnect, 250);
      });
      req.end();
    }
    tryConnect();
  });
}

async function startBlankWiki(options = {}) {
  const { loadCplClient = false, loadCplServer = false } = options;
  const twEntry = require.resolve('tiddlywiki/tiddlywiki.js');
  // Use the server edition instead of the empty edition. The empty edition
  // only contains tiddlywiki.info and can render an "Upgrade Required" page
  // when booted as a server. The server edition includes filesystem/tiddlyweb
  // plugins and the required system tiddlers for a functional client-server
  // wiki, which is what CPL client installation tests need.
  const baseEdition = path.join(
    path.dirname(twEntry),
    'editions',
    'server'
  );
  blankWikiPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cpl-blank-wiki-'));
  // fs.cpSync copies the source directory *into* the destination, which would
  // create a nested "server" folder and leave the wiki path without a
  // tiddlywiki.info at its root. Copy each top-level entry instead.
  fs.mkdirSync(blankWikiPath, { recursive: true });
  for (const entry of fs.readdirSync(baseEdition)) {
    fs.cpSync(
      path.join(baseEdition, entry),
      path.join(blankWikiPath, entry),
      { recursive: true },
    );
  }

  blankWikiPort = await findAvailablePort();

  const toBootPluginArg = (filePath) => `++${path.relative(paths.projectRoot, filePath).replace(/\\/g, '/')}`;
  const args = [
    twEntry,
    '+plugins/tiddlywiki/filesystem',
    '+plugins/tiddlywiki/tiddlyweb',
  ];
  if (loadCplClient) {
    const { repoPluginPath, serverPluginPath } = ensureRuntimePluginsBuilt();
    args.push(toBootPluginArg(repoPluginPath));
    if (loadCplServer) {
      args.push(toBootPluginArg(serverPluginPath));
    }
  }
  args.push(
    blankWikiPath,
    '--listen',
    `port=${blankWikiPort}`,
    `host=${BLANK_WIKI_HOST}`
  );

  blankWikiProcess = spawn(process.execPath, args, {
    stdio: 'pipe',
    cwd: paths.projectRoot
  });

  blankWikiProcess.on('error', (err) => {
    console.error('[Blank Wiki] Failed to start:', err.message);
  });

  await waitForBlankWiki(blankWikiPort);
  console.log(`[Blank Wiki] Started on http://${BLANK_WIKI_HOST}:${blankWikiPort}`);
}

function stopBlankWiki() {
  if (blankWikiProcess) {
    blankWikiProcess.kill();
    blankWikiProcess = null;
    console.log('[Blank Wiki] Stopped');
  }

  if (blankWikiPath && fs.existsSync(blankWikiPath)) {
    try {
      fs.rmSync(blankWikiPath, { recursive: true, force: true });
    } catch (e) {
      console.warn('[Blank Wiki] Failed to clean up temp directory:', e.message);
    }
    blankWikiPath = null;
  }
}

function getBlankWikiUrl() {
  return `http://${BLANK_WIKI_HOST}:${blankWikiPort}`;
}

function getBlankWikiPath() {
  return blankWikiPath;
}

module.exports = {
  startBlankWiki,
  stopBlankWiki,
  getBlankWikiUrl,
  // Kept for backwards compatibility, but resolves at import time only.
  // Prefer getBlankWikiUrl() after startBlankWiki() has been called.
  get BLANK_WIKI_URL() {
    return getBlankWikiUrl();
  },
};
