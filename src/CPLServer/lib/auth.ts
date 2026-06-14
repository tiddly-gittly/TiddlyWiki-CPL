import * as https from 'https';
import * as querystring from 'querystring';

import { Config } from './config';
import { getHeaderValue } from './http';
import type {
  AuthenticatedUser,
  GitHubTokenResponse,
  GitHubUserProfile,
  RouteRequest,
  TokenPayload,
} from './types';

interface JwtModule {
  sign: (
    payload: Record<string, unknown>,
    secret: string,
    options?: { expiresIn?: string },
  ) => string;
  verify: (token: string, secret: string) => unknown;
}

const jwt = require('jsonwebtoken') as JwtModule;

export const AUTH_COOKIE_NAME = 'cpl_jwt_token';
const JWT_SECRET = Config.jwtSecret;
const JWT_EXPIRY = `${Config.jwtExpiryDays}d`;

const parseCookies = (cookieHeader: string): Record<string, string> => {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(entry => {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex < 0) {
      return;
    }

    const name = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (name) {
      cookies[name] = decodeURIComponent(value);
    }
  });

  return cookies;
};

const isTokenPayload = (value: unknown): value is TokenPayload => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<TokenPayload>;
  return (
    typeof candidate.githubId === 'string' &&
    typeof candidate.username === 'string' &&
    typeof candidate.avatar === 'string'
  );
};

const requestJson = <T>(
  options: https.RequestOptions,
  body?: string,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const request = https.request(options, response => {
      let data = '';
      const statusCode = response.statusCode ?? 0;

      response.on('data', chunk => {
        data += typeof chunk === 'string' ? chunk : chunk.toString();
      });

      response.on('end', () => {
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`HTTP ${statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(data) as T);
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });

export const Auth = {
  generateToken(user: AuthenticatedUser): string {
    return jwt.sign(
      {
        githubId: user.githubId,
        username: user.username,
        avatar: user.avatar,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY },
    );
  },

  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return isTokenPayload(decoded) ? decoded : null;
    } catch {
      return null;
    }
  },

  getUserFromRequest(request: RouteRequest): TokenPayload | null {
    const authHeader = getHeaderValue(request.headers, 'authorization');
    const match = authHeader.match(/^Bearer\s+(.+)$/);
    if (match) {
      return this.verifyToken(match[1]);
    }

    const cookieHeader = getHeaderValue(request.headers, 'cookie');
    const token = parseCookies(cookieHeader)[AUTH_COOKIE_NAME];
    return token ? this.verifyToken(token) : null;
  },

  createCookie(token: string): string {
    const maxAgeSeconds = Config.jwtExpiryDays * 24 * 60 * 60;
    return `${AUTH_COOKIE_NAME}=${encodeURIComponent(
      token,
    )}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=None; Secure`;
  },

  clearCookie(): string {
    return `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=None; Secure`;
  },

  async exchangeGitHubCode(code: string): Promise<GitHubTokenResponse> {
    const postData = querystring.stringify({
      client_id: Config.githubClientId,
      client_secret: Config.githubClientSecret,
      code,
    });

    return requestJson<GitHubTokenResponse>(
      {
        hostname: 'github.com',
        path: '/login/oauth/access_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'Content-Length': String(Buffer.byteLength(postData)),
        },
      },
      postData,
    );
  },

  async fetchGitHubUser(accessToken: string): Promise<GitHubUserProfile> {
    return requestJson<GitHubUserProfile>({
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'TiddlyWiki-CPL-Server',
        Accept: 'application/vnd.github.v3+json',
      },
    });
  },

  isAdmin(user?: { githubId?: string | number | null } | null): boolean {
    return Config.isAdmin(user?.githubId ?? null);
  },

  isBlocked(user?: { githubId?: string | number | null } | null): boolean {
    return Config.isBlocked(user?.githubId ?? null);
  },
};
