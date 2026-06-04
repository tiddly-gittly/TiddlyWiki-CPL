import { URL } from 'url';

import { Auth } from '../../lib/auth';
import { Config } from '../../lib/config';
import {
  CORS_HEADERS,
  getHeaderValue,
  sendError,
  sendInternalError,
  sendJson,
} from '../../lib/http';
import type { AuthenticatedUser, RouteHandler } from '../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/auth\/github\/callback$/;

const isLocalClientReturnUrl = (url: URL): boolean => {
  const hostname = url.hostname.toLowerCase();
  return (
    url.protocol === 'file:' ||
    url.protocol === 'app:' ||
    url.protocol === 'tidgi:' ||
    ((url.protocol === 'http:' || url.protocol === 'https:') &&
      (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]'))
  );
};

const getRequestOrigin = (request: Parameters<RouteHandler>[0]): string => {
  const host =
    getHeaderValue(request.headers, 'x-forwarded-host') ||
    getHeaderValue(request.headers, 'host');
  const proto = getHeaderValue(request.headers, 'x-forwarded-proto') || 'https';
  return host ? `${proto}://${host}` : '';
};

const getAllowedReturnUrl = (
  rawReturnUrl: string | null,
  request: Parameters<RouteHandler>[0],
): string | null => {
  if (!rawReturnUrl) {
    return null;
  }

  try {
    const returnUrl = new URL(rawReturnUrl);
    if (
      returnUrl.origin === getRequestOrigin(request) ||
      isLocalClientReturnUrl(returnUrl)
    ) {
      return returnUrl.toString();
    }
  } catch {
    return null;
  }

  return null;
};

export const handler: RouteHandler = async (request, _response, context) => {
  try {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
    const code = requestUrl.searchParams.get('code');
    const returnUrl = getAllowedReturnUrl(
      requestUrl.searchParams.get('state'),
      request,
    );

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
      console.error(
        '[CPL-Server] GitHub OAuth token exchange failed:',
        tokenData,
      );
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

    const token = Auth.generateToken(user);
    const cookie = Auth.createCookie(token);

    if (returnUrl) {
      context.sendResponse(
        302,
        {
          ...CORS_HEADERS,
          Location: returnUrl,
          'Set-Cookie': cookie,
          'Cache-Control': 'no-store',
        },
        '',
      );
      return;
    }

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
