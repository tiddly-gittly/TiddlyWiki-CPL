import { sendInternalError, sendJson } from '../../lib/http';
import { DownloadStatsTiddlerStore } from '../../lib/store/download-stats-tiddlers';
import { RatingTiddlerStore } from '../../lib/store/rating-tiddlers';
import type { RouteHandler } from '../../lib/types';

interface StatEntry {
  downloadCount: number;
  averageRating: number;
  totalRatings: number;
}

export const method = 'GET';
export const path = /^\/cpl\/stats$/;

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const titlesParam = url.searchParams.get('titles');
    const topParam = url.searchParams.get('top');

    // ── Build download-count map from in-memory cache ──
    let downloadCounts: Record<string, number>;

    if (titlesParam) {
      // Specific titles requested
      const requestedTitles = titlesParam
        .split(',')
        .map(decodeURIComponent)
        .filter(Boolean);
      downloadCounts =
        DownloadStatsTiddlerStore.getDownloadCountsFor(requestedTitles);
    } else if (topParam) {
      // Top-N by download count
      const topN = parseInt(topParam, 10);
      downloadCounts = DownloadStatsTiddlerStore.getTopDownloadCounts(
        Number.isNaN(topN) || topN <= 0 ? 50 : topN,
      );
    } else {
      // All plugins (from cache, no file I/O)
      downloadCounts = DownloadStatsTiddlerStore.getAllDownloadCounts();
    }

    // ── Build result ──
    const result: Record<string, StatEntry> = {};

    Object.entries(downloadCounts).forEach(([pluginTitle, count]) => {
      result[pluginTitle] = {
        downloadCount: count,
        averageRating: 0,
        totalRatings: 0,
      };
    });

    // ── Merge rating data (also from cache if available) ──
    // Only fetch ratings for the plugins we're already returning
    const allRatings = RatingTiddlerStore.getAllStats();
    Object.entries(allRatings).forEach(([pluginTitle, ratings]) => {
      if (result[pluginTitle]) {
        result[pluginTitle].averageRating = ratings.averageRating || 0;
        result[pluginTitle].totalRatings = ratings.totalRatings || 0;
      }
    });

    sendJson(
      context,
      200,
      {
        count: Object.keys(result).length,
        plugins: result,
      },
      {
        'Cache-Control': 'public, max-age=60',
      },
    );
  } catch (error) {
    sendInternalError(context, 'all-stats handler', error);
  }
};
