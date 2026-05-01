import { URL } from 'url';

import { Auth } from '../../../lib/auth';
import { Config } from '../../../lib/config';
import { sendError, sendInternalError, sendJson } from '../../../lib/http';
import type { AuthenticatedUser, RouteHandler } from '../../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/api\/auth\/github\/callback$/;

export const handler: RouteHandler = async (request, _response, context) => {
  try {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
    const code = requestUrl.searchParams.get('code');

    if (!code) {
      sendError(context, 400, 'Missing authorization code');
      return;
    }

    if (!Config.githubClientId || !Config.githubClientSecret) {
      sendError(
        context,
        500,
        'GitHub OAuth not configured. Set CPL_GITHUB_CLIENT_ID and CPL_GITHUB_CLIENT_SECRET.',
      );
      return;
    }

    const tokenData = await Auth.exchangeGitHubCode(code);
    if (!tokenData.access_token) {
      console.error('[CPL-Server] GitHub OAuth token exchange failed:', tokenData);
      sendError(context, 400, 'Failed to exchange GitHub authorization code');
      return;
    }

    const githubUser = await Auth.fetchGitHubUser(tokenData.access_token);
    if (!githubUser.id) {
      console.error('[CPL-Server] Failed to fetch GitHub user:', githubUser);
      sendError(context, 400, 'Failed to fetch GitHub user profile');
      return;
    }

    const user: AuthenticatedUser = {
      githubId: String(githubUser.id),
      username:
        githubUser.login || githubUser.name || `user${String(githubUser.id)}`,
      avatar: githubUser.avatar_url || '',
    };

    sendJson(context, 200, {
      success: true,
      token: Auth.generateToken(user),
      user,
    });
  } catch (error) {
    sendInternalError(context, 'auth-github handler', error);
  }
};