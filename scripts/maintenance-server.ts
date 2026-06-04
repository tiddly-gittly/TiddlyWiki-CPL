/**
 * maintenance-server.ts
 *
 * A lightweight HTTP server that shows a "building" loading page during
 * the CPL startup phase (git sync + static library build). This prevents
 * 502 errors from the reverse proxy while the main TiddlyWiki server
 * hasn't started yet.
 *
 * Also exposes /cpl/build-status so the frontend can poll build progress.
 *
 * Usage:
 *   ts-node scripts/maintenance-server.ts [--port 8080] [--status-file /tmp/cpl-build-status.json]
 *
 * The server writes its PID to /tmp/cpl-maintenance-server.pid so the
 * entrypoint can kill it when the main server is ready.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex !== -1 ? args[portIndex + 1] : '8081';
const host = process.env.HOST ?? '0.0.0.0';

const STATUS_FILE = path.resolve('/tmp/cpl-build-status.json');
const PID_FILE = path.resolve('/tmp/cpl-maintenance-server.pid');

/** Write PID so entrypoint can kill us */
fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');

const readStatus = (): { phase: string; message: string; startedAt: string } => {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { phase: 'starting', message: 'Initializing...', startedAt: new Date().toISOString() };
};

const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="15">
<title>CPL - Loading</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    color: #fff;
  }
  .card {
    background: rgba(255,255,255,0.15); backdrop-filter: blur(10px);
    border-radius: 16px; padding: 48px; max-width: 520px; width: 90%;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2); text-align: center;
  }
  .logo { font-size: 48px; margin-bottom: 16px; }
  h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
  .subtitle { font-size: 14px; opacity: 0.85; margin-bottom: 32px; }
  .spinner {
    width: 40px; height: 40px; margin: 0 auto 24px;
    border: 3px solid rgba(255,255,255,0.3); border-top-color: #fff;
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .status {
    font-size: 15px; font-weight: 500; margin-bottom: 8px;
    min-height: 1.4em;
  }
  .detail { font-size: 13px; opacity: 0.7; }
  .badge {
    display: inline-block; padding: 4px 12px; border-radius: 12px;
    background: rgba(255,255,255,0.2); font-size: 12px; margin-top: 16px;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">📦</div>
  <h1>TiddlyWiki-CPL</h1>
  <p class="subtitle">太微插件聚合中心</p>
  <div class="spinner"></div>
  <div class="status" id="status">Starting...</div>
  <div class="detail" id="detail">Please wait while the server initializes</div>
  <div class="badge" id="badge">building</div>
</div>
<script>
(function() {
  var phaseLabels = {
    'starting': ['Starting...', '正在启动...'],
    'syncing': ['Syncing plugin metadata', '正在同步插件元数据'],
    'building': ['Building plugin library', '正在构建插件库'],
    'ready': ['Almost ready!', '即将就绪！']
  };
  var isZh = navigator.language.startsWith('zh');
  function update() {
    fetch('/cpl/build-status')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var labels = phaseLabels[d.phase] || phaseLabels['starting'];
        document.getElementById('status').textContent = labels[isZh ? 1 : 0];
        document.getElementById('badge').textContent = d.phase || 'building';
        if (d.message) document.getElementById('detail').textContent = d.message;
        if (d.phase === 'ready') {
          document.querySelector('.spinner').style.borderTopColor = '#4ade80';
          setTimeout(function() { location.reload(); }, 2000);
        }
      })
      .catch(function() {});
  }
  update();
  setInterval(update, 3000);
})();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const url = req.url?.split('?')[0] ?? '/';

  // Expose build status as JSON API
  if (url === '/cpl/build-status') {
    const status = readStatus();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(status));
    return;
  }

  // Health check
  if (url === '/health' || url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // Everything else gets the loading page
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(HTML_PAGE);
});

server.listen(Number(port), host, () => {
  console.log(`[maintenance] Loading page active on http://${host}:${port}`);
  console.log(`[maintenance] PID: ${process.pid}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[maintenance] Shutting down...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
