import { Auth } from '../../../lib/auth';
import { sendInternalError, sendJson } from '../../../lib/http';
import type { RouteHandler } from '../../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/api\/auth\/status$/;

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const user = Auth.getUserFromRequest(request);
    if (!user) {
      sendJson(context, 200, {
        authenticated: false,
      });
      return;
    }

    sendJson(context, 200, {
      authenticated: true,
      user: {
        githubId: user.githubId,
        username: user.username,
        avatar: user.avatar,
      },
      isAdmin: Auth.isAdmin(user),
    });
  } catch (error) {
    sendInternalError(context, 'auth-status handler', error);
  }
};