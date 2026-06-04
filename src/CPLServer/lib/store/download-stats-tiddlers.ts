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
  pluginTitle
    .replace(/^\$:\//, '$__')
    .replace(/\//g, '_');

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
  let isJson = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') {
      bodyStart = i + 1;
      break;
    }

    if (trimmed.toLowerCase().startsWith('type:') && trimmed.includes('application/json')) {
      isJson = true;
    }
  }

  // Support both JSON body and old plaintext format
  const body = lines.slice(bodyStart).join('\n').trim();
  if (!body) return null;

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
  const filename = `${pluginTitleToFilename(pluginTitle)}.tid`;
  const filePath = pathModule.join(dir, filename);

  if (!fs.existsSync(filePath)) {
    return { downloadCount: 0, lastUpdated: null, downloadsByIp: {} };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseStatsTiddler(content);
    return parsed ?? { downloadCount: 0, lastUpdated: null, downloadsByIp: {} };
  } catch {
    return { downloadCount: 0, lastUpdated: null, downloadsByIp: {} };
  }
};

/**
 * Write download stats for a plugin.
 */
const writeStats = (pluginTitle: string, stats: DownloadStats): void => {
  ensureDir();
  const dir = getStatsDir();
  const filename = `${pluginTitleToFilename(pluginTitle)}.tid`;
  const filePath = pathModule.join(dir, filename);
  const tid = serializeStatsTiddler(pluginTitle, stats);
  fs.writeFileSync(filePath, tid, 'utf-8');
};

/**
 * Initialize the directory on module load.
 */
ensureDir();

export const DownloadStatsTiddlerStore = {
  /**
   * Get download stats for a single plugin.
   */
  getStats(pluginTitle: string): DownloadStats {
    return readStats(pluginTitle);
  },

  /**
   * Update download stats for a plugin (record a new download from an IP).
   * Returns the updated stats.
   */
  updateDownloadStats(pluginTitle: string, ip: string): DownloadStats {
    const stats = readStats(pluginTitle);
    const now = new Date().toISOString();

    stats.downloadCount += 1;
    stats.lastUpdated = now;
    stats.downloadsByIp = stats.downloadsByIp ?? {};
    stats.downloadsByIp[ip] = now;

    writeStats(pluginTitle, stats);
    return stats;
  },

  /**
   * Get aggregated stats for all plugins.
   */
  getAllStats(): Record<string, DownloadStats> {
    const dir = getStatsDir();
    if (!fs.existsSync(dir)) return {};

    const result: Record<string, DownloadStats> = {};

    for (const fileName of fs.readdirSync(dir)) {
      if (!fileName.endsWith('.tid')) continue;

      const filePath = pathModule.join(dir, fileName);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseStatsTiddler(content);
        if (!parsed) continue;

        // Extract plugin title from the title field
        const titleLine = content.split(/\r?\n/).find(
          l => l.toLowerCase().startsWith('title:'),
        );
        const fullTitle = titleLine
          ? titleLine.substring(titleLine.indexOf(':') + 1).trim()
          : '';
        const pluginTitle = fullTitle.startsWith(TITLE_PREFIX)
          ? fullTitle.slice(TITLE_PREFIX.length)
          : fullTitle;

        if (pluginTitle) {
          result[pluginTitle] = parsed;
        }
      } catch {
        // skip
      }
    }

    return result;
  },
};
