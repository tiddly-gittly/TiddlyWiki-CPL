import { CommentTiddlerStore } from '../../lib/store/comment-tiddlers';
import { sendInternalError, sendJson } from '../../lib/http';
import type { RouteHandler } from '../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/comments\/all-recent$/;

export const handler: RouteHandler = (request, _response, context) => {
  try {
    // Always filter out pending comments from the public "recent" view.
    // Admins see pending comments in the dedicated pending section.
    const comments = CommentTiddlerStore.getAllComments(false);

    sendJson(context, 200, {
      success: true,
      comments: comments.slice(0, 200),
    });
  } catch (error) {
    sendInternalError(context, 'all-recent-comments handler', error);
  }
};
