import { Auth } from '../../lib/auth';
import { CommentTiddlerStore } from '../../lib/store/comment-tiddlers';
import { sendInternalError, sendJson } from '../../lib/http';
import type { RouteHandler } from '../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/comments\/all-recent$/;

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const user = Auth.getUserFromRequest(request);
    const isAdmin = Auth.isAdmin(user);
    const comments = CommentTiddlerStore.getAllComments(isAdmin);

    sendJson(context, 200, {
      success: true,
      comments: comments.slice(0, 200),
    });
  } catch (error) {
    sendInternalError(context, 'all-recent-comments handler', error);
  }
};
