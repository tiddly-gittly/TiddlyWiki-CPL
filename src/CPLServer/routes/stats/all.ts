import { sendInternalError, sendJson } from '../../lib/http';
import { DownloadStatsTiddlerStore } from '../../lib/store/download-stats-tiddlers';
import { RatingTiddlerStore } from '../../lib/store/rating-tiddlers';
import type { RouteHandler } from '../../lib/types';
import { URL } from 'url';

interface CombinedStats {
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
    const requestedTitles = titlesParam
      ? titlesParam.split(',').map(decodeURIComponent).filter(Boolean)
      : null;

    const allStats = DownloadStatsTiddlerStore.getAllStats();
    const allRatings = RatingTiddlerStore.getAllStats();

    // If titles filter is provided, only include those plugins
    const statsToUse = requestedTitles
      ? Object.fromEntries(
          Object.entries(allStats).filter(([title]) =>
            requestedTitles.includes(title),
          ),
        )
      : allStats;

    const ratingsToUse = requestedTitles
      ? Object.fromEntries(
          Object.entries(allRatings).filter(([title]) =>
            requestedTitles.includes(title),
          ),
        )
      : allRatings;

    const result: Record<string, CombinedStats> = {};

    Object.entries(statsToUse).forEach(([pluginTitle, stats]) => {
      result[pluginTitle] = {
        downloadCount: stats.downloadCount || 0,
        averageRating: 0,
        totalRatings: 0,
      };
    });

    Object.entries(ratingsToUse).forEach(([pluginTitle, ratings]) => {
      if (!result[pluginTitle]) {
        result[pluginTitle] = {
          downloadCount: 0,
          averageRating: 0,
          totalRatings: 0,
        };
      }

      result[pluginTitle].averageRating = ratings.averageRating || 0;
      result[pluginTitle].totalRatings = ratings.totalRatings || 0;
    });

    // Also include requested titles that have no data yet (return zeros)
    if (requestedTitles) {
      for (const title of requestedTitles) {
        if (!result[title]) {
          result[title] = {
            downloadCount: 0,
            averageRating: 0,
            totalRatings: 0,
          };
        }
      }
    }

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
