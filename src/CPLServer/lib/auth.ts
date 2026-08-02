import { Config } from './config';
import { getHeaderValue } from './http';
import type {
  AuthenticatedUser,
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

  isAdmin(user?: { githubId?: string | number | null } | null): boolean {
    return Config.isAdmin(user?.githubId ?? null);
  },

  isBlocked(user?: { githubId?: string | number | null } | null): boolean {
    return Config.isBlocked(user?.githubId ?? null);
  },
};
