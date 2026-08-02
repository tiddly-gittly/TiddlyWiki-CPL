import * as querystring from 'querystring';
import { Auth } from '../../lib/auth';
import { Config } from '../../lib/config';
import { GitHubOAuth } from '../../lib/github-oauth';
import {
  CORS_HEADERS,
  sendError,
  sendInternalError,
  sendJson,
} from '../../lib/http';
import type { AuthenticatedUser, RouteHandler } from '../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/auth\/github\/callback$/;

export const handler: RouteHandler = async (request, _response, context) => {
  try {
    const rawRequestUrl = request.url ?? '/';
    const queryIndex = rawRequestUrl.indexOf('?');
    const query = querystring.parse(
      queryIndex >= 0 ? rawRequestUrl.slice(queryIndex + 1) : '',
    );
    const getQueryValue = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] : value ?? null;
    const code = getQueryValue(query.code);
    const state = getQueryValue(query.state);

    if (!code) {
      sendError(context, 400, 'Missing authorization code');
      return;
    }

    if (state) {
      if (!/^[a-f0-9]{32}$/i.test(state)) {
        sendError(context, 400, 'Invalid OAuth state');
        return;
      }

      const callbackQuery = querystring.stringify({
        cpl_oauth_code: code,
        cpl_oauth_state: state,
      });
      context.sendResponse(
        302,
        {
          ...CORS_HEADERS,
          Location: `/?${callbackQuery}`,
          'Cache-Control': 'no-store',
        },
        '',
      );
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

    const tokenData = await GitHubOAuth.exchangeCode(code);
    if (!tokenData.access_token) {
      console.error(
        '[CPL-Server] GitHub OAuth token exchange failed:',
        tokenData,
      );
      sendError(context, 400, 'Failed to exchange GitHub authorization code');
      return;
    }

    const githubUser = await GitHubOAuth.fetchUser(tokenData.access_token);
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

    const token = Auth.generateToken(user);
    const cookie = Auth.createCookie(token);

    sendJson(
      context,
      200,
      {
        success: true,
        user,
      },
      {
        'Set-Cookie': cookie,
      },
    );
  } catch (error) {
    sendInternalError(context, 'auth-github handler', error);
  }
};
