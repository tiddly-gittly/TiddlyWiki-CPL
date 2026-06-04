import { tw, type CPLServerApi } from './types';

/**
 * Debounced batch stats fetcher.
 *
 * Wikitext views fire per-plugin `cpl-fetch-stats` messages, but we don't
 * want N HTTP requests for N plugins on a single page. This collects titles
 * over a short window and fires one batched request to /cpl/stats?titles=...
 */
const batchQueue = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_WINDOW_MS = 100;

const flushStatsBatch = (cplServerApi: CPLServerApi): void => {
  const titles = [...batchQueue];
  batchQueue.clear();
  batchTimer = null;

  if (titles.length === 0) {
    return;
  }

  cplServerApi.getStatsBatch(titles, (error, data) => {
    if (error || !data) {
      console.error('[CPL-Server] Batch stats fetch failed:', error);
      return;
    }

    const plugins = (data as Record<string, unknown>).plugins as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!plugins) {
      return;
    }

    const now = String(Date.now());
    for (const [pluginTitle, stats] of Object.entries(plugins)) {
      tw.wiki.addTiddler({
        title: `$:/temp/CPL-Server/plugin-stats/${pluginTitle}`,
        text: JSON.stringify(stats),
        type: 'application/json',
        'plugin-title': pluginTitle,
        timestamp: now,
      });
    }

    // For any requested title that was NOT in the response, write an
    // empty placeholder so the Wikitext UI shows a dash instead of
    // waiting forever for a tiddler that will never appear.
    for (const title of titles) {
      if (plugins[title] !== undefined) {
        continue;
      }
      tw.wiki.addTiddler({
        title: `$:/temp/CPL-Server/plugin-stats/${title}`,
        text: JSON.stringify({
          downloadCount: 0,
          averageRating: 0,
          totalRatings: 0,
        }),
        type: 'application/json',
        'plugin-title': title,
        timestamp: now,
      });
    }
  });
};

/**
 * Queue a plugin title for batch stats fetch.
 * Call this from the cpl-fetch-stats event handler.
 */
export const queuePluginStatsFetch = (
  cplServerApi: CPLServerApi,
  pluginTitle: string,
): void => {
  if (!pluginTitle) {
    return;
  }

  // Skip if we already have fresh stats (<60s old) for this plugin
  const tempTitle = `$:/temp/CPL-Server/plugin-stats/${pluginTitle}`;
  const existing = tw.wiki.getTiddler(tempTitle);
  if (existing) {
    const ts = Number(existing.fields.timestamp ?? 0);
    if (Date.now() - ts < 60_000) {
      return;
    }
  }

  batchQueue.add(pluginTitle);

  if (batchTimer) {
    clearTimeout(batchTimer);
  }
  batchTimer = setTimeout(() => flushStatsBatch(cplServerApi), BATCH_WINDOW_MS);
};

export const fetchPluginStats = (
  cplServerApi: CPLServerApi,
  pluginTitle: string,
): void => {
  if (!pluginTitle) {
    return;
  }

  const tempTitle = `$:/temp/CPL-Server/plugin-stats/${pluginTitle}`;
  cplServerApi.getStats(pluginTitle, (error, data) => {
    if (error || !data) {
      console.error(
        '[CPL-Server] Failed to fetch stats for',
        pluginTitle,
        error,
      );
      return;
    }

    tw.wiki.addTiddler({
      title: tempTitle,
      text: JSON.stringify(data),
      type: 'application/json',
      'plugin-title': pluginTitle,
      timestamp: String(Date.now()),
    });
  });
};

export const fetchPluginComments = (
  cplServerApi: CPLServerApi,
  pluginTitle: string,
): void => {
  if (!pluginTitle) {
    return;
  }

  const tempTitle = `$:/temp/CPL-Server/comments/${pluginTitle}`;
  cplServerApi.getComments(pluginTitle, (error, data) => {
    if (error || !data) {
      console.error(
        '[CPL-Server] Failed to fetch comments for',
        pluginTitle,
        error,
      );
      return;
    }

    tw.wiki.addTiddler({
      title: tempTitle,
      text: JSON.stringify(data),
      type: 'application/json',
      'plugin-title': pluginTitle,
      timestamp: String(Date.now()),
    });
  });
};

export const fetchPluginCompatibility = (
  cplServerApi: CPLServerApi,
  pluginTitle: string,
): void => {
  if (!pluginTitle) {
    return;
  }

  const tempTitle = `$:/temp/CPL-Server/compatibility/${pluginTitle}`;
  cplServerApi.getCompatibilityReports(pluginTitle, (error, data) => {
    if (error || !data) {
      console.warn(
        '[CPL-Server] Failed to fetch compatibility reports for',
        pluginTitle,
        error,
      );
      tw.wiki.addTiddler({
        title: tempTitle,
        text: JSON.stringify({
          success: false,
          pluginTitle,
          reports: [],
          message: error || 'No compatibility reports available',
        }),
        type: 'application/json',
        'plugin-title': pluginTitle,
        timestamp: String(Date.now()),
      });
      return;
    }

    tw.wiki.addTiddler({
      title: tempTitle,
      text: JSON.stringify(data),
      type: 'application/json',
      'plugin-title': pluginTitle,
      timestamp: String(Date.now()),
    });
  });
};
