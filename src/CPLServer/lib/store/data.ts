import * as fs from 'fs';
import * as path from 'path';

import { Config } from '../config';
import { getRuntimeState } from '../runtime-state';
import type { DownloadStats, RatingRecord, RatingStats } from '../types';

const runtimeState = getRuntimeState().dataStore;
const DATA_DIR = Config.dataDir;
const STATS_FILE = path.join(
  DATA_DIR,
  `stats${Config.getServerSuffix()}.json`,
);
const RATINGS_FILE = path.join(
  DATA_DIR,
  `ratings${Config.getServerSuffix()}.json`,
);

const createDefaultStats = (): DownloadStats => ({
  downloadCount: 0,
  lastUpdated: null,
  downloadsByIp: {},
});

const createDefaultRatings = (): RatingStats => ({
  ratings: [],
  averageRating: 0,
  totalRatings: 0,
});

const ensureDataDir = (): void => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const loadFromDisk = <T extends Record<string, unknown>>(
  filePath: string,
): T => {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[CPL-Server] Error reading ${filePath}:`, message);
  }

  return {} as T;
};

const aggregateStats = (): Record<string, DownloadStats> => {
  if (!fs.existsSync(DATA_DIR)) {
    return {};
  }

  const aggregated: Record<string, DownloadStats> = {};
  const files = fs
    .readdirSync(DATA_DIR)
    .filter(fileName => /^stats(\.[^.]+)?\.json$/.test(fileName));

  files.forEach(fileName => {
    const filePath = path.join(DATA_DIR, fileName);
    const data = loadFromDisk<Record<string, DownloadStats>>(filePath);

    Object.entries(data).forEach(([pluginTitle, stats]) => {
      const nextStats = aggregated[pluginTitle] ?? createDefaultStats();
      nextStats.downloadCount += stats.downloadCount ?? 0;

      if (stats.downloadsByIp) {
        Object.assign(nextStats.downloadsByIp, stats.downloadsByIp);
      }

      if (
        stats.lastUpdated
        && (!nextStats.lastUpdated || stats.lastUpdated > nextStats.lastUpdated)
      ) {
        nextStats.lastUpdated = stats.lastUpdated;
      }

      aggregated[pluginTitle] = nextStats;
    });
  });

  return aggregated;
};

const aggregateRatings = (): Record<string, RatingStats> => {
  if (!fs.existsSync(DATA_DIR)) {
    return {};
  }

  const aggregated: Record<string, RatingStats> = {};
  const files = fs
    .readdirSync(DATA_DIR)
    .filter(fileName => /^ratings(\.[^.]+)?\.json$/.test(fileName));

  files.forEach(fileName => {
    const filePath = path.join(DATA_DIR, fileName);
    const data = loadFromDisk<Record<string, RatingStats>>(filePath);

    Object.entries(data).forEach(([pluginTitle, ratingStats]) => {
      const nextRatings = aggregated[pluginTitle] ?? createDefaultRatings();

      ratingStats.ratings?.forEach(rating => {
        const existingIndex = nextRatings.ratings.findIndex(
          candidate => candidate.ip === rating.ip,
        );

        if (existingIndex >= 0) {
          if (rating.timestamp > nextRatings.ratings[existingIndex].timestamp) {
            nextRatings.ratings[existingIndex] = rating;
          }
          return;
        }

        nextRatings.ratings.push(rating);
      });

      aggregated[pluginTitle] = nextRatings;
    });
  });

  Object.values(aggregated).forEach(ratingStats => {
    if (ratingStats.ratings.length === 0) {
      return;
    }

    const total = ratingStats.ratings.reduce(
      (sum, rating) => sum + rating.rating,
      0,
    );
    ratingStats.averageRating = Math.round(
      (total / ratingStats.ratings.length) * 10,
    ) / 10;
    ratingStats.totalRatings = ratingStats.ratings.length;
  });

  return aggregated;
};

const ensureStatsLoaded = (): void => {
  if (runtimeState.statsCache === null) {
    runtimeState.statsCache = loadFromDisk<Record<string, DownloadStats>>(
      STATS_FILE,
    );
  }
};

const ensureRatingsLoaded = (): void => {
  if (runtimeState.ratingsCache === null) {
    runtimeState.ratingsCache = loadFromDisk<Record<string, RatingStats>>(
      RATINGS_FILE,
    );
  }
};

const flushSync = (): void => {
  try {
    ensureDataDir();

    if (runtimeState.statsCache !== null) {
      fs.writeFileSync(
        STATS_FILE,
        JSON.stringify(runtimeState.statsCache, null, 2),
        'utf-8',
      );
    }

    if (runtimeState.ratingsCache !== null) {
      fs.writeFileSync(
        RATINGS_FILE,
        JSON.stringify(runtimeState.ratingsCache, null, 2),
        'utf-8',
      );
    }

    runtimeState.pendingFlush = false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CPL-Server] Error flushing data to disk:', message);
  }
};

const flushAsync = (): void => {
  if (runtimeState.flushTimer) {
    clearTimeout(runtimeState.flushTimer);
  }

  runtimeState.pendingFlush = true;
  runtimeState.flushTimer = setTimeout(() => {
    flushSync();
  }, 5000);
};

const registerProcessHandlers = (): void => {
  if (runtimeState.handlersRegistered) {
    return;
  }

  process.on('exit', flushSync);
  process.on('SIGINT', () => {
    flushSync();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    flushSync();
    process.exit(0);
  });

  runtimeState.handlersRegistered = true;
};

registerProcessHandlers();

export const DataStore = {
  getStats(pluginTitle: string): DownloadStats {
    return aggregateStats()[pluginTitle] ?? createDefaultStats();
  },

  updateDownloadStats(pluginTitle: string, ip: string): DownloadStats {
    ensureStatsLoaded();

    if (!runtimeState.statsCache) {
      runtimeState.statsCache = {};
    }

    const pluginStats = runtimeState.statsCache[pluginTitle] ?? createDefaultStats();
    pluginStats.downloadCount += 1;
    pluginStats.lastUpdated = new Date().toISOString();
    pluginStats.downloadsByIp[ip] = pluginStats.lastUpdated;

    runtimeState.statsCache[pluginTitle] = pluginStats;
    flushAsync();

    return pluginStats;
  },

  getRatings(pluginTitle: string): RatingStats {
    return aggregateRatings()[pluginTitle] ?? createDefaultRatings();
  },

  addRating(pluginTitle: string, ip: string, rating: number): RatingStats {
    ensureRatingsLoaded();

    if (!runtimeState.ratingsCache) {
      runtimeState.ratingsCache = {};
    }

    const pluginRatings =
      runtimeState.ratingsCache[pluginTitle] ?? createDefaultRatings();
    const timestamp = new Date().toISOString();
    const nextRating: RatingRecord = { ip, rating, timestamp };
    const existingIndex = pluginRatings.ratings.findIndex(
      candidate => candidate.ip === ip,
    );

    if (existingIndex >= 0) {
      pluginRatings.ratings[existingIndex] = nextRating;
    } else {
      pluginRatings.ratings.push(nextRating);
    }

    const total = pluginRatings.ratings.reduce(
      (sum, candidate) => sum + candidate.rating,
      0,
    );
    pluginRatings.averageRating = Math.round(
      (total / pluginRatings.ratings.length) * 10,
    ) / 10;
    pluginRatings.totalRatings = pluginRatings.ratings.length;

    runtimeState.ratingsCache[pluginTitle] = pluginRatings;
    flushAsync();

    return pluginRatings;
  },

  hasRated(pluginTitle: string, ip: string): boolean {
    const pluginRatings = aggregateRatings()[pluginTitle];
    if (!pluginRatings) {
      return false;
    }

    return pluginRatings.ratings.some(candidate => candidate.ip === ip);
  },

  getAllStats(): Record<string, DownloadStats> {
    return JSON.parse(JSON.stringify(aggregateStats())) as Record<
      string,
      DownloadStats
    >;
  },

  getAllRatings(): Record<string, RatingStats> {
    return JSON.parse(JSON.stringify(aggregateRatings())) as Record<
      string,
      RatingStats
    >;
  },

  flushSync,

  _resetCache(): void {
    runtimeState.statsCache = null;
    runtimeState.ratingsCache = null;

    if (runtimeState.flushTimer) {
      clearTimeout(runtimeState.flushTimer);
      runtimeState.flushTimer = null;
    }

    runtimeState.pendingFlush = false;
  },
};