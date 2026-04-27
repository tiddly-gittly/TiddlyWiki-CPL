const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const BLANK_WIKI_PORT = 8081;
const BLANK_WIKI_HOST = '127.0.0.1';

let blankWikiProcess = null;

function waitForBlankWiki(timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      const req = http.request(
        {
          hostname: BLANK_WIKI_HOST,
          port: BLANK_WIKI_PORT,
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
  const { loadCplClient = false } = options;
  const twEntry = require.resolve('tiddlywiki/tiddlywiki.js');
  const emptyEdition = path.join(
    path.dirname(twEntry),
    'editions',
    'empty'
  );

  const repoRoot = path.resolve(__dirname, '../../..');
  const args = [twEntry];
  if (loadCplClient) {
    args.push('++./src/CPLPlugin');
  }
  args.push(
    emptyEdition,
    '--listen',
    `port=${BLANK_WIKI_PORT}`,
    `host=${BLANK_WIKI_HOST}`
  );

  blankWikiProcess = spawn(process.execPath, args, {
    stdio: 'pipe',
    cwd: repoRoot
  });

  blankWikiProcess.on('error', (err) => {
    console.error('[Blank Wiki] Failed to start:', err.message);
  });

  await waitForBlankWiki();
  console.log(`[Blank Wiki] Started on http://${BLANK_WIKI_HOST}:${BLANK_WIKI_PORT}`);
}

function stopBlankWiki() {
  if (blankWikiProcess) {
    blankWikiProcess.kill();
    blankWikiProcess = null;
    console.log('[Blank Wiki] Stopped');
  }
}

module.exports = {
  startBlankWiki,
  stopBlankWiki,
  BLANK_WIKI_URL: `http://${BLANK_WIKI_HOST}:${BLANK_WIKI_PORT}`
};
