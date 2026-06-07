import * as fs from 'fs';
import * as pathModule from 'path';

import { Config } from '../config';
import type { DownloadStats } from '../types';

const getStatsDir = (): string => Config.downloadStatsTiddlersDir;

const TITLE_PREFIX = '$:/cpl/download-stats/';

const ensureDir = (): void => {
  const dir = getStatsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/**
 * Sanitize a plugin title into a safe filename segment.
 * Replaces $:/ -> $__ and / -> _
 */
const pluginTitleToFilename = (pluginTitle: string): string =>
  pluginTitle.replace(/^\$:\//, '$__').replace(/\//g, '_');

/**
 * Parse a download-stats .tid file into DownloadStats.
 *
 * Expected format:
 * title: $:/cpl/download-stats/$__plugins_Gk0Wk_CPL-Repo
 * type: application/json
 *
 * {"downloadCount":42,"lastUpdated":"...","downloadsByIp":{...}}
 */
const parseStatsTiddler = (raw: string): DownloadStats | null => {
  const lines = raw.split(/\r?\n/);
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') {
      bodyStart = i + 1;
      break;
    }
  }

  // Support both JSON body and old plaintext format
  const body = lines.slice(bodyStart).join('\n').trim();
  if (!body) {
    return null;
  }

  try {
    // Try JSON first
    const parsed = JSON.parse(body) as DownloadStats;
    if (typeof parsed.downloadCount === 'number') {
      parsed.downloadsByIp = parsed.downloadsByIp ?? {};
      return parsed;
    }
  } catch {
    // Not JSON, try old format
  }

  // Fallback: parse from body if it's just a number
  const count = Number.parseInt(body, 10);
  if (!Number.isNaN(count)) {
    return { downloadCount: count, lastUpdated: null, downloadsByIp: {} };
  }

  return null;
};

/**
 * Serialize DownloadStats to .tid string with JSON body.
 */
const serializeStatsTiddler = (
  pluginTitle: string,
  stats: DownloadStats,
): string => {
  const title = `${TITLE_PREFIX}${pluginTitleToFilename(pluginTitle)}`;
  return [
    `title: ${title}`,
    `plugin-title: ${pluginTitle}`,
    `type: application/json`,
    '',
    JSON.stringify(stats),
  ].join('\n');
};

/**
 * Read one plugin's download stats.
 */
const readStats = (pluginTitle: string): DownloadStats => {
  const dir = getStatsDir();
  const baseName = pluginTitleToFilename(pluginTitle);

  // Try suffixed version first (multi-server), then unsuffixed
  const suffix = Config.getServerSuffix();
  const candidates = suffix
    ? [`${baseName}${suffix}.tid`, `${baseName}.tid`]
    : [`${baseName}.tid`];

  for (const filename of candidates) {
    const filePath = pathModule.join(dir, filename);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseStatsTiddler(content);
      if (parsed) {
        return parsed;
      }
    } catch {
      // try next candidate
    }
  }

  return { downloadCount: 0, lastUpdated: null, downloadsByIp: {} };
};

/**
 * Write download stats for a plugin.
 */
const writeStats = (pluginTitle: string, stats: DownloadStats): void => {
  ensureDir();
  const dir = getStatsDir();
  const filename = `${pluginTitleToFilename(
    pluginTitle,
  )}${Config.getServerSuffix()}.tid`;
  const filePath = pathModule.join(dir, filename);
  const tid = serializeStatsTiddler(pluginTitle, stats);
  fs.writeFileSync(filePath, tid, 'utf-8');
};

/**
 * Initialize the directory on module load.
 */
ensureDir();

// ═══ In-memory download-count cache ═══
// Built once on cold start from persisted .tid files.
// Incremented on each download — no re-aggregation on API calls.
let _downloadCountCache: Record<string, number> | null = null;

const ensureDownloadCache = (): void => {
  if (_downloadCountCache !== null) {
    return;
  }

  _downloadCountCache = {};
  const dir = getStatsDir();
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith('.tid')) {
      continue;
    }
    const filePath = pathModule.join(dir, fileName);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseStatsTiddler(content);
      if (!parsed || typeof parsed.downloadCount !== 'number') {
        continue;
      }
      // Read plugin-title field (the canonical plugin title)
      const pluginTitleLine = content
        .split(/\r?\n/)
        .find(l => l.toLowerCase().startsWith('plugin-title:'));
      const pluginTitle = pluginTitleLine
        ? pluginTitleLine.substring(pluginTitleLine.indexOf(':') + 1).trim()
        : '';
      // Fallback: derive from title field
      const resolvedTitle = pluginTitle || (() => {
        const titleLine = content
          .split(/\r?\n/)
          .find(l => l.toLowerCase().startsWith('title:'));
        const fullTitle = titleLine
          ? titleLine.substring(titleLine.indexOf(':') + 1).trim()
          : '';
        return fullTitle.startsWith(TITLE_PREFIX)
          ? fullTitle.slice(TITLE_PREFIX.length)
          : fullTitle;
      })();

      if (resolvedTitle) {
        _downloadCountCache[resolvedTitle] = parsed.downloadCount;
      }
    } catch {
      // skip
    }
  }
};

// Build cache immediately on import
ensureDownloadCache();

// Public API to get top-N download counts from cache (no file I/O)
const getTopDownloadCountsInternal = (
  topN?: number,
): Record<string, number> => {
  ensureDownloadCache();
  const entries = Object.entries(_downloadCountCache!);
  entries.sort((a, b) => b[1] - a[1]);
  const sliced = topN ? entries.slice(0, topN) : entries;
  return Object.fromEntries(sliced);
};

// Public API to get specific download counts from cache
const getDownloadCountsForInternal = (
  titles: string[],
): Record<string, number> => {
  ensureDownloadCache();
  const result: Record<string, number> = {};
  for (const t of titles) {
    result[t] = _downloadCountCache![t] ?? 0;
  }
  return result;
};

export const DownloadStatsTiddlerStore = {
  /**
   * Get download stats for a single plugin.
   */
  getStats(pluginTitle: string): DownloadStats {
    return readStats(pluginTitle);
  },

  /**
   * Update download stats for a plugin (record a new download from an IP).
   * Increments both in-memory cache and persisted file.
   * Returns the updated stats.
   */
  updateDownloadStats(pluginTitle: string, ip: string): DownloadStats {
    ensureDownloadCache();
    // Increment in-memory cache immediately
    _downloadCountCache![pluginTitle] =
      (_downloadCountCache![pluginTitle] || 0) + 1;

    const stats = readStats(pluginTitle);
    const now = new Date().toISOString();

    stats.downloadCount = _downloadCountCache![pluginTitle];
    stats.lastUpdated = now;
    stats.downloadsByIp = stats.downloadsByIp ?? {};
    stats.downloadsByIp[ip] = now;

    writeStats(pluginTitle, stats);
    return stats;
  },

  /**
   * Get download counts for all plugins from in-memory cache.
   * No file I/O — only rebuilds on cold start.
   */
  getAllDownloadCounts(): Record<string, number> {
    return getTopDownloadCountsInternal();
  },

  /**
   * Get top-N plugins by download count from in-memory cache.
   */
  getTopDownloadCounts(topN: number): Record<string, number> {
    return getTopDownloadCountsInternal(topN);
  },

  /**
   * Get download counts for specific plugin titles from cache.
   */
  getDownloadCountsFor(titles: string[]): Record<string, number> {
    return getDownloadCountsForInternal(titles);
  },

  /**
   * Get aggregated stats for all plugins from in-memory cache.
   * No file I/O — only rebuilds on cold start.
   */
  getAllStats(): Record<string, DownloadStats> {
    ensureDownloadCache();
    const result: Record<string, DownloadStats> = {};
    for (const [title, count] of Object.entries(_downloadCountCache!)) {
      result[title] = {
        downloadCount: count,
        lastUpdated: null,
        downloadsByIp: {},
      };
    }
    return result;
  },
};
