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
const { URL } = require('url');

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

function encodePluginTitleForLibraryRecipe(pluginTitle) {
  return encodeURIComponent(encodeURIComponent(pluginTitle));
}

function normalizePluginSourceUrl(uri, pluginTitle) {
  if (!uri) {
    return uri;
  }

  try {
    const parsed = new URL(uri);
    const normalizedPath = parsed.pathname.replace(/\/+/g, '/');
    if (normalizedPath.endsWith('/index.html')) {
      const recipePath = normalizedPath.replace(/\/index\.html$/, '/recipes/library/tiddlers/');
      parsed.pathname = `${recipePath}${encodePluginTitleForLibraryRecipe(pluginTitle)}.json`;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    }
  } catch {
    // keep original URI if parsing fails
  }

  return uri;
}

function isLikelyValidPluginPayload(content, pluginTitle) {
  const trimmed = content.trimStart();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.some(item => item && item.title === pluginTitle);
      }

      if (!parsed || typeof parsed !== 'object') {
        return false;
      }

      if (parsed.title === pluginTitle) {
        if (typeof parsed.text !== 'string') {
          return true;
        }

        try {
          JSON.parse(parsed.text);
          return true;
        } catch {
          return false;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
    const looksLikePluginLibraryIndex =
      trimmed.includes('var assetList') && trimmed.includes('<title>Plugin Library</title>');
    if (looksLikePluginLibraryIndex) {
      return false;
    }

    const looksLikeTiddlyWikiDocument =
      trimmed.includes('<!--~~ This is a Tiddlywiki file.') ||
      trimmed.includes('data-tiddler-title=') ||
      trimmed.includes('<div id="storeArea">') ||
      trimmed.includes("<div id='storeArea'>");

    return looksLikeTiddlyWikiDocument && trimmed.includes(pluginTitle);
  }

  return false;
}

function shouldReuseExistingFile(destPath, pluginTitle) {
  if (!fs.existsSync(destPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(destPath, 'utf-8');
    return isLikelyValidPluginPayload(content, pluginTitle);
  } catch {
    return false;
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
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const allowCi = args.includes('--allow-ci');
  const bestEffort = args.includes('--best-effort');

  // Guard: do not run in test/CI environments unless explicitly allowed
  if (!allowCi && (process.env.NODE_ENV === 'test' || process.env.CI === 'true')) {
    console.log('[fetch-plugins] Skipping: should not run in test/CI environments.');
    process.exit(0);
  }

  ensureDir(OUTPUT_DIR);

  const files = fs.readdirSync(WIKI_TIDDLERS_DIR).filter(f => f.endsWith('.json'));
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

      if (!force && shouldReuseExistingFile(destPath, pluginTitle)) {
        console.log(`[fetch-plugins] ${pluginTitle}: already exists and looks valid (${destFileName}), skipping.`);
        skipped++;
        continue;
      }

      if (!force && fs.existsSync(destPath)) {
        console.warn(`[fetch-plugins] ${pluginTitle}: existing file looks invalid, re-downloading (${destFileName}).`);
      }

      const normalizedUri = normalizePluginSourceUrl(uri, pluginTitle);
      console.log(`[fetch-plugins] ${pluginTitle}: downloading from ${normalizedUri} ...`);

    if (dryRun) {
      console.log(`[fetch-plugins] ${pluginTitle}: dry-run, would save to ${destPath}`);
      downloaded++;
      continue;
    }

      try {
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        await downloadFile(normalizedUri, destPath);
        const downloadedContent = fs.readFileSync(destPath, 'utf-8');
        if (!isLikelyValidPluginPayload(downloadedContent, pluginTitle)) {
          fs.unlinkSync(destPath);
          throw new Error('Downloaded content is not a valid payload for requested plugin');
        }
        console.log(`[fetch-plugins] ${pluginTitle}: saved to ${destPath}`);
        downloaded++;
      } catch (err) {
      console.error(`[fetch-plugins] ${pluginTitle}: download failed - ${err.message}`);
      failed++;
    }
  }

  console.log(`\n[fetch-plugins] Done. Downloaded: ${downloaded}, Skipped: ${skipped}, Failed: ${failed}`);
  process.exit(failed > 0 && !bestEffort ? 1 : 0);
}

main().catch(err => {
  console.error('[fetch-plugins] Fatal error:', err);
  process.exit(1);
});
