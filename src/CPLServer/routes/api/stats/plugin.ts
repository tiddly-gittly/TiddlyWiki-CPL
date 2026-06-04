import {
  decodeRouteParam,
  sendInternalError,
  sendJson,
} from '../../../lib/http';
import { DownloadStatsTiddlerStore } from '../../../lib/store/download-stats-tiddlers';
import { RatingTiddlerStore } from '../../../lib/store/rating-tiddlers';
import type { RouteHandler } from '../../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/api\/stats\/(.+)$/;

export const handler: RouteHandler = (_request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const stats = DownloadStatsTiddlerStore.getStats(pluginTitle);
    const ratings = RatingTiddlerStore.getStats(pluginTitle);

    sendJson(
      context,
      200,
      {
        plugintitle: pluginTitle,
        downloadCount: stats.downloadCount,
        downloadLastUpdated: stats.lastUpdated,
        averageRating: ratings.averageRating,
        totalRatings: ratings.totalRatings,
      },
      {
        'Cache-Control': 'public, max-age=60',
      },
    );
  } catch (error) {
    sendInternalError(context, 'stats handler', error);
  }
};
