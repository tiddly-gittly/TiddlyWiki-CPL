import { DataStore } from '../../lib/store/data';
import { RateLimiter } from '../../lib/security/rate-limit';
import { decodeRouteParam, parseJsonBody, sendError, sendInternalError, sendJson } from '../../lib/http';
import type { RouteHandler } from '../../lib/types';

interface RateBody {
  rating?: unknown;
}

const parseRating = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 5) {
    return null;
  }

  return parsed;
};

export const method = 'POST';
export const path = /^\/cpl\/api\/rate\/(.+)$/;
export const bodyFormat = 'string';

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const body = parseJsonBody<RateBody>(context.data);

    if (body?.rating === undefined) {
      sendError(
        context,
        400,
        'Missing rating field. Expected: { rating: number(1-5) }',
      );
      return;
    }

    const rating = parseRating(body.rating);
    if (rating === null) {
      sendError(context, 400, 'Invalid rating. Must be an integer between 1 and 5.');
      return;
    }

    const ip = RateLimiter.getClientIp(request);
    if (!RateLimiter.canRate(pluginTitle, ip, DataStore)) {
      sendError(context, 429, 'You have already rated this plugin.');
      return;
    }

    RateLimiter.recordRating(pluginTitle, ip);
    const ratings = DataStore.addRating(pluginTitle, ip, rating);

    sendJson(context, 200, {
      success: true,
      message: 'Rating submitted successfully',
      plugintitle: pluginTitle,
      averageRating: ratings.averageRating,
      totalRatings: ratings.totalRatings,
    });
  } catch (error) {
    sendInternalError(context, 'rate handler', error);
  }
};