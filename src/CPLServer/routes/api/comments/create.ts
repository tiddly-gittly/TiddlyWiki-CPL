import { Auth } from '../../../lib/auth';
import { Config } from '../../../lib/config';
import { sendError, sendInternalError, sendJson, parseJsonBody, decodeRouteParam } from '../../../lib/http';
import { getRuntimeState } from '../../../lib/runtime-state';
import { CommentStore } from '../../../lib/store/comments';
import { WikitextFilter } from '../../../lib/security/wikitext';
import type { CommentRecord, RouteHandler } from '../../../lib/types';

interface CreateCommentBody {
  content?: unknown;
}

const COMMENT_WINDOW_MS = 60 * 60 * 1000;
const commentLimits = getRuntimeState().commentRoute.limits;

const canComment = (githubId: string): boolean => {
  if (process.env.CPL_TEST_MODE === 'true') {
    return true;
  }

  const now = Date.now();
  const recent = (commentLimits[githubId] ?? []).filter(
    timestamp => now - timestamp < COMMENT_WINDOW_MS,
  );
  commentLimits[githubId] = recent;

  return recent.length < Config.commentRateLimit;
};

const recordComment = (githubId: string): void => {
  if (!commentLimits[githubId]) {
    commentLimits[githubId] = [];
  }

  commentLimits[githubId].push(Date.now());
};

export const method = 'POST';
export const path = /^\/cpl\/api\/comments\/(.+)$/;
export const bodyFormat = 'string';

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const body = parseJsonBody<CreateCommentBody>(context.data);
    const user = Auth.getUserFromRequest(request);

    if (!user) {
      sendError(
        context,
        401,
        'Authentication required. Please login with GitHub.',
      );
      return;
    }

    if (typeof body?.content !== 'string') {
      sendError(context, 400, 'Missing content field');
      return;
    }

    const content = body.content.trim();
    if (!content) {
      sendError(context, 400, 'Comment content cannot be empty');
      return;
    }

    if (content.length > 5000) {
      sendError(context, 400, 'Comment content too long (max 5000 characters)');
      return;
    }

    if (!canComment(user.githubId)) {
      sendError(
        context,
        429,
        `Rate limit exceeded. Maximum ${Config.commentRateLimit} comments per hour.`,
      );
      return;
    }

    const timestamp = new Date().toISOString();
    const comment: CommentRecord = {
      id: `${Config.serverId || 'default'}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      githubId: user.githubId,
      username: user.username,
      avatar: user.avatar,
      content: WikitextFilter.sanitize(content),
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    CommentStore.addComment(pluginTitle, comment);
    recordComment(user.githubId);

    sendJson(context, 201, {
      success: true,
      message: 'Comment submitted for moderation',
      comment,
    });
  } catch (error) {
    sendInternalError(context, 'post-comment handler', error);
  }
};