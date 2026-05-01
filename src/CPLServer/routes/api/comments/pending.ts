import { Auth } from '../../../lib/auth';
import { CommentStore } from '../../../lib/store/comments';
import { sendError, sendInternalError, sendJson } from '../../../lib/http';
import type { RouteHandler } from '../../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/api\/comments\/pending$/;

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const user = Auth.getUserFromRequest(request);
    if (!user) {
      sendError(context, 401, 'Authentication required');
      return;
    }

    if (!Auth.isAdmin(user)) {
      sendError(context, 403, 'Admin privileges required');
      return;
    }

    sendJson(context, 200, {
      success: true,
      comments: CommentStore.getPendingComments(),
    });
  } catch (error) {
    sendInternalError(context, 'get-pending-comments handler', error);
  }
};