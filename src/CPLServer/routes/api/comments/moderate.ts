import { Auth } from '../../../lib/auth';
import { CommentStore } from '../../../lib/store/comments';
import { decodeRouteParam, parseJsonBody, sendError, sendInternalError, sendJson } from '../../../lib/http';
import type { CommentStatus, RouteHandler } from '../../../lib/types';

interface ModerateCommentBody {
  status?: unknown;
}

const isValidStatus = (
  value: unknown,
): value is 'approved' | 'rejected' | 'deleted' => {
  return value === 'approved' || value === 'rejected' || value === 'deleted';
};

export const method = 'PUT';
export const path = /^\/cpl\/api\/comments\/(.+)\/([^/]+)$/;
export const bodyFormat = 'string';

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const commentId = decodeRouteParam(context.params[1]);
    const body = parseJsonBody<ModerateCommentBody>(context.data);
    const user = Auth.getUserFromRequest(request);

    if (!user) {
      sendError(context, 401, 'Authentication required');
      return;
    }

    if (!Auth.isAdmin(user)) {
      sendError(context, 403, 'Admin privileges required');
      return;
    }

    if (!isValidStatus(body?.status)) {
      sendError(
        context,
        400,
        'Missing status field. Expected: approved, rejected, or deleted',
      );
      return;
    }

    if (body.status === 'deleted') {
      const deleted = CommentStore.deleteComment(pluginTitle, commentId);
      if (!deleted) {
        sendError(context, 404, 'Comment not found');
        return;
      }

      sendJson(context, 200, {
        success: true,
        message: 'Comment deleted',
      });
      return;
    }

    const comment = CommentStore.updateCommentStatus(
      pluginTitle,
      commentId,
      body.status as Exclude<CommentStatus, 'deleted'>,
    );

    if (!comment) {
      sendError(context, 404, 'Comment not found');
      return;
    }

    sendJson(context, 200, {
      success: true,
      message: `Comment ${body.status}`,
      comment,
    });
  } catch (error) {
    sendInternalError(context, 'put-comment handler', error);
  }
};