import { decodeRouteParam, sendInternalError, sendJson } from '../../../lib/http';
import { DataStore } from '../../../lib/store/data';
import type { RouteHandler } from '../../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/api\/stats\/(.+)$/;

export const handler: RouteHandler = (_request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const stats = DataStore.getStats(pluginTitle);
    const ratings = DataStore.getRatings(pluginTitle);

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