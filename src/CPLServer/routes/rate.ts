import { Auth } from '../lib/auth';
import { RatingTiddlerStore } from '../lib/store/rating-tiddlers';
import {
  decodeRouteParam,
  parseJsonBody,
  sendError,
  sendInternalError,
  sendJson,
} from '../lib/http';
import type { RouteHandler } from '../lib/types';

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
export const path = /^\/cpl\/rate\/(.+)$/;
export const bodyFormat = 'string';

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const body = parseJsonBody<RateBody>(context.data);
    const user = Auth.getUserFromRequest(request);

    if (!user) {
      sendError(
        context,
        401,
        'Authentication required. Please login with GitHub.',
      );
      return;
    }

    if (Auth.isBlocked(user)) {
      sendError(
        context,
        403,
        'This GitHub account is not allowed to submit ratings.',
      );
      return;
    }

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
      sendError(
        context,
        400,
        'Invalid rating. Must be an integer between 1 and 5.',
      );
      return;
    }

    const ratings = RatingTiddlerStore.addRating(pluginTitle, user, rating);

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
