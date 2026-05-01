#!/usr/bin/env node
/**
 * Fetch plugins from their source URLs into wiki/files/plugin-fetched/
 *
 * Reads plugin metadata from wiki/tiddlers/Plugin_*.json files,
 * extracts cpl.uri, and downloads the plugin JSON files.
 *
 * Should NOT run in test/development environments (exits early if NODE_ENV=test or CI=true).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const WIKI_TIDDLERS_DIR = path.resolve('wiki', 'tiddlers');
const OUTPUT_DIR = path.resolve('wiki', 'files', 'plugin-fetched');

// Same sanitization as get-download-plugin.js
function sanitizeFilename(title) {
  return title.replace(/[\\\/:*?"<>|]/g, '_').replace(/\.+$/g, '');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirects
        return resolve(downloadFile(res.headers.location, destPath));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function main() {
  // Guard: do not run in test/CI environments
  if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
    console.log('[fetch-plugins] Skipping: should not run in test/CI environments.');
    process.exit(0);
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  ensureDir(OUTPUT_DIR);

  const files = fs.readdirSync(WIKI_TIDDLERS_DIR).filter(f => f.startsWith('Plugin_') && f.endsWith('.json'));
  console.log(`[fetch-plugins] Found ${files.length} plugin metadata files.`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(WIKI_TIDDLERS_DIR, file);
    let metadata;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      metadata = Array.isArray(parsed) ? parsed[0] : parsed;
    } catch (e) {
      console.error(`[fetch-plugins] Failed to parse ${file}: ${e.message}`);
      failed++;
      continue;
    }

    const pluginTitle = metadata['cpl.title'];
    const uri = metadata['cpl.uri'];

    if (!pluginTitle) {
      console.warn(`[fetch-plugins] ${file}: missing cpl.title, skipping.`);
      skipped++;
      continue;
    }

    if (!uri) {
      console.warn(`[fetch-plugins] ${pluginTitle}: missing cpl.uri, skipping.`);
      skipped++;
      continue;
    }

    const destFileName = sanitizeFilename(pluginTitle) + '.json';
    const destPath = path.join(OUTPUT_DIR, destFileName);

    if (!force && fs.existsSync(destPath)) {
      console.log(`[fetch-plugins] ${pluginTitle}: already exists (${destFileName}), skipping.`);
      skipped++;
      continue;
    }

    console.log(`[fetch-plugins] ${pluginTitle}: downloading from ${uri} ...`);

    if (dryRun) {
      console.log(`[fetch-plugins] ${pluginTitle}: dry-run, would save to ${destPath}`);
      downloaded++;
      continue;
    }

    try {
      await downloadFile(uri, destPath);
      console.log(`[fetch-plugins] ${pluginTitle}: saved to ${destPath}`);
      downloaded++;
    } catch (err) {
      console.error(`[fetch-plugins] ${pluginTitle}: download failed - ${err.message}`);
      failed++;
    }
  }

  console.log(`\n[fetch-plugins] Done. Downloaded: ${downloaded}, Skipped: ${skipped}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[fetch-plugins] Fatal error:', err);
  process.exit(1);
});
