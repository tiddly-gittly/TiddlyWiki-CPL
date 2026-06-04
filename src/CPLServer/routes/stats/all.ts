import { sendInternalError, sendJson } from '../../lib/http';
import { DownloadStatsTiddlerStore } from '../../lib/store/download-stats-tiddlers';
import { RatingTiddlerStore } from '../../lib/store/rating-tiddlers';
import type { RouteHandler } from '../../lib/types';

interface CombinedStats {
  downloadCount: number;
  averageRating: number;
  totalRatings: number;
}

export const method = 'GET';
export const path = /^\/cpl\/stats$/;

export const handler: RouteHandler = (_request, _response, context) => {
  try {
    const allStats = DownloadStatsTiddlerStore.getAllStats();
    const allRatings = RatingTiddlerStore.getAllStats();
    const result: Record<string, CombinedStats> = {};

    Object.entries(allStats).forEach(([pluginTitle, stats]) => {
      result[pluginTitle] = {
        downloadCount: stats.downloadCount || 0,
        averageRating: 0,
        totalRatings: 0,
      };
    });

    Object.entries(allRatings).forEach(([pluginTitle, ratings]) => {
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
