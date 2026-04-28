import { Auth } from '../../../lib/auth';
import { CommentStore } from '../../../lib/store/comments';
import { decodeRouteParam, sendInternalError, sendJson } from '../../../lib/http';
import type { RouteHandler } from '../../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/api\/comments\/(?!pending$)(.+)$/;

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const user = Auth.getUserFromRequest(request);
    const comments = CommentStore.getComments(
      pluginTitle,
      user && Auth.isAdmin(user) ? null : 'approved',
    );

    sendJson(context, 200, {
      success: true,
      pluginTitle,
      comments,
    });
  } catch (error) {
    sendInternalError(context, 'get-comments handler', error);
  }
};