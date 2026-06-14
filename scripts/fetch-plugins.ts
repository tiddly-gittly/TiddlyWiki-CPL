import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { URL } from 'url';
import {
  isSafePluginVersionFileName,
  sanitizePluginFileName,
} from '../src/CPLServer/lib/files';
import { paths } from '../src/CPLServer/lib/paths';

interface PluginMetadata {
  'cpl.title'?: string;
  'cpl.uri'?: string;
  [key: string]: unknown;
}

const WIKI_TIDDLERS_DIR = path.join(paths.wiki, 'tiddlers');
const PLUGIN_METADATA_DIR = path.join(WIKI_TIDDLERS_DIR, 'plugin-metadata');
const OUTPUT_DIR = paths.pluginFetched;
const HISTORY_DIR = paths.pluginFetchedHistory;
const SUPPORTED_METADATA_EXTENSIONS = new Set(['.json', '.tid']);

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function walkMetadataFiles(rootDir: string): string[] {
  const filePaths: string[] = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...walkMetadataFiles(fullPath));
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (
      !SUPPORTED_METADATA_EXTENSIONS.has(extension) ||
      entry.name.endsWith('.json.meta')
    ) {
      continue;
    }

    filePaths.push(fullPath);
  }

  return filePaths;
}

function collectPluginMetadataFilePaths(): string[] {
  const filePaths = new Set<string>();

  if (fs.existsSync(PLUGIN_METADATA_DIR)) {
    for (const filePath of walkMetadataFiles(PLUGIN_METADATA_DIR)) {
      filePaths.add(filePath);
    }
  }

  if (fs.existsSync(WIKI_TIDDLERS_DIR)) {
    for (const entry of fs.readdirSync(WIKI_TIDDLERS_DIR, {
      withFileTypes: true,
    })) {
      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (
        !SUPPORTED_METADATA_EXTENSIONS.has(extension) ||
        entry.name.endsWith('.json.meta')
      ) {
        continue;
      }

      filePaths.add(path.join(WIKI_TIDDLERS_DIR, entry.name));
    }
  }

  return Array.from(filePaths);
}

function parseTidMetadata(content: string): PluginMetadata {
  const lines = content.split(/\r?\n/);
  const fields: PluginMetadata = {};
  let index = 0;

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') {
      index += 1;
      break;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trimStart();
    fields[key] = value;
  }

  if (index < lines.length) {
    fields.text = lines.slice(index).join('\n');
  }

  return fields;
}

function parsePluginMetadataFile(filePath: string): PluginMetadata {
  const content = fs.readFileSync(filePath, 'utf-8');
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.tid') {
    return parseTidMetadata(content);
  }

  const parsed = JSON.parse(content) as PluginMetadata | PluginMetadata[];
  return Array.isArray(parsed) ? parsed[0] ?? {} : parsed;
}

function encodePluginTitleForLibraryRecipe(pluginTitle: string): string {
  return encodeURIComponent(encodeURIComponent(pluginTitle));
}

function normalizePluginSourceUrl(
  uri: string | undefined,
  pluginTitle: string,
): string | undefined {
  if (!uri) {
    return uri;
  }

  try {
    const parsed = new URL(uri);
    const normalizedPath = parsed.pathname.replace(/\/+/g, '/');
    if (normalizedPath.endsWith('/index.html')) {
      const recipePath = normalizedPath.replace(
        /\/index\.html$/,
        '/recipes/library/tiddlers/',
      );
      parsed.pathname = `${recipePath}${encodePluginTitleForLibraryRecipe(
        pluginTitle,
      )}.json`;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    }
  } catch {
    return uri;
  }

  return uri;
}

function isLikelyValidPluginPayload(
  content: string,
  pluginTitle: string,
): boolean {
  const trimmed = content.trimStart();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.some(
          item =>
            typeof item === 'object' &&
            item !== null &&
            'title' in item &&
            item.title === pluginTitle,
        );
      }

      if (!parsed || typeof parsed !== 'object') {
        return false;
      }

      if ('title' in parsed && parsed.title === pluginTitle) {
        if (!('text' in parsed) || typeof parsed.text !== 'string') {
          return true;
        }

        try {
          JSON.parse(parsed.text);
          return true;
        } catch {
          return false;
        }
      }
    } catch {
      return false;
    }

    return false;
  }

  if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
    const looksLikePluginLibraryIndex =
      trimmed.includes('var assetList') &&
      trimmed.includes('<title>Plugin Library</title>');
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

function shouldReuseExistingFile(
  destPath: string,
  pluginTitle: string,
): boolean {
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

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, response => {
      const { statusCode, headers } = response;
      if (
        statusCode &&
        statusCode >= 300 &&
        statusCode < 400 &&
        headers.location
      ) {
        response.resume();
        const redirectUrl = new URL(headers.location, url).toString();
        resolve(downloadFile(redirectUrl, destPath));
        return;
      }

      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${statusCode ?? 'unknown'}`));
        return;
      }

      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close(closeError => {
          if (closeError) {
            reject(closeError);
            return;
          }
          resolve();
        });
      });
      file.on('error', error => {
        fs.unlink(destPath, () => undefined);
        reject(error);
      });
    });

    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy(new Error('Request timeout'));
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const allowCi = args.includes('--allow-ci');
  const bestEffort = args.includes('--best-effort');

  if (
    !allowCi &&
    (process.env.NODE_ENV === 'test' || process.env.CI === 'true')
  ) {
    console.log(
      '[fetch-plugins] Skipping: should not run in test/CI environments.',
    );
    process.exit(0);
  }

  ensureDir(OUTPUT_DIR);
  ensureDir(HISTORY_DIR);

  const files = collectPluginMetadataFilePaths();
  console.log(`[fetch-plugins] Found ${files.length} plugin metadata files.`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of files) {
    const fileName = path
      .relative(WIKI_TIDDLERS_DIR, filePath)
      .replace(/\\/g, '/');
    let metadata: PluginMetadata;

    try {
      metadata = parsePluginMetadataFile(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[fetch-plugins] Failed to parse ${fileName}: ${message}`);
      failed += 1;
      continue;
    }

    if (!metadata['cpl.title'] && !metadata['cpl.uri']) {
      skipped += 1;
      continue;
    }

    const pluginTitle = metadata['cpl.title'];
    const uri = metadata['cpl.uri'];

    if (!pluginTitle) {
      console.warn(`[fetch-plugins] ${fileName}: missing cpl.title, skipping.`);
      skipped += 1;
      continue;
    }

    if (!uri) {
      console.warn(
        `[fetch-plugins] ${pluginTitle}: missing cpl.uri, skipping.`,
      );
      skipped += 1;
      continue;
    }

    const destFileName = `${sanitizePluginFileName(pluginTitle)}.json`;
    const destPath = path.join(OUTPUT_DIR, destFileName);

    if (!force && shouldReuseExistingFile(destPath, pluginTitle)) {
      console.log(
        `[fetch-plugins] ${pluginTitle}: already exists and looks valid (${destFileName}), skipping.`,
      );
      skipped += 1;
      continue;
    }

    if (!force && fs.existsSync(destPath)) {
      console.warn(
        `[fetch-plugins] ${pluginTitle}: existing file looks invalid, re-downloading (${destFileName}).`,
      );
    }

    const normalizedUri = normalizePluginSourceUrl(uri, pluginTitle) ?? uri;
    console.log(
      `[fetch-plugins] ${pluginTitle}: downloading from ${normalizedUri} ...`,
    );

    if (dryRun) {
      console.log(
        `[fetch-plugins] ${pluginTitle}: dry-run, would save to ${destPath}`,
      );
      downloaded += 1;
      continue;
    }

    try {
      // Read old version *before* overwriting so we can archive it when
      // the downloaded plugin has a different version.
      let oldVersion: string | undefined;
      let oldContent: string | undefined;
      if (fs.existsSync(destPath)) {
        try {
          oldContent = fs.readFileSync(destPath, 'utf-8');
          const oldParsed = JSON.parse(oldContent) as Record<string, unknown>;
          oldVersion =
            typeof oldParsed.version === 'string'
              ? oldParsed.version
              : undefined;
        } catch {
          /* corrupt old file; treat as absent */
        }
        fs.unlinkSync(destPath);
      }
      await downloadFile(normalizedUri, destPath);
      const downloadedContent = fs.readFileSync(destPath, 'utf-8');
      if (!isLikelyValidPluginPayload(downloadedContent, pluginTitle)) {
        fs.unlinkSync(destPath);
        throw new Error(
          'Downloaded content is not a valid payload for requested plugin',
        );
      }
      console.log(`[fetch-plugins] ${pluginTitle}: saved to ${destPath}`);
      downloaded += 1;

      // Archive the *previous* version into plugin-fetched-history only when
      // the newly downloaded version differs. This keeps history/ as a
      // genuine archive of old versions rather than a duplicate of
      // plugin-fetched/.
      try {
        const newParsed = JSON.parse(downloadedContent) as Record<
          string,
          unknown
        >;
        const newVersion =
          typeof newParsed.version === 'string' ? newParsed.version : undefined;
        const versionToArchive =
          oldVersion && newVersion && oldVersion !== newVersion
            ? oldVersion
            : undefined;
        if (
          versionToArchive &&
          oldContent &&
          isSafePluginVersionFileName(versionToArchive)
        ) {
          const historyPluginDir = path.join(
            HISTORY_DIR,
            sanitizePluginFileName(pluginTitle),
          );
          ensureDir(historyPluginDir);
          const historyPath = path.join(
            historyPluginDir,
            `${versionToArchive}.json`,
          );
          if (!fs.existsSync(historyPath)) {
            fs.writeFileSync(historyPath, oldContent, 'utf-8');
            console.log(
              `[fetch-plugins] ${pluginTitle}: archived old version ${versionToArchive} to history`,
            );
          }
        }
      } catch {
        // Non-fatal: history archiving failure should not affect the main fetch.
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[fetch-plugins] ${pluginTitle}: download failed - ${message}`,
      );
      failed += 1;
    }
  }

  console.log(
    `\n[fetch-plugins] Done. Downloaded: ${downloaded}, Skipped: ${skipped}, Failed: ${failed}`,
  );
  process.exit(failed > 0 && !bestEffort ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error('[fetch-plugins] Fatal error:', error);
  process.exit(1);
});
