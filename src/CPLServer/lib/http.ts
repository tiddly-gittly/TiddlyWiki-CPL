import type { RouteContext, RouteRequest } from './types';

/**
 * The origin of the currently-being-handled HTTP request.
 * Set by the CPL-Server request interceptor before each route handler runs.
 *
 * Prefer echoing the specific request Origin over a wildcard '*' because
 * CORS requests with `credentials: 'include'` (used by the CPL browser
 * client to send auth cookies) cannot be fulfilled with `Access-Control-
 * Allow-Origin: *`.
 */
let currentRequestOrigin: string | null = null;

/**
 * Must be called on every incoming request so that CORS headers reflect
 * the actual Origin rather than the unsafe wildcard '*'.
 */
export const setCorsOrigin = (origin: string | null): void => {
  currentRequestOrigin = origin;
};

const getCorsHeaders = (): Record<string, string> => {
  const origin = currentRequestOrigin;
  if (origin) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  // Fallback for requests without an Origin header (server-to-server, etc.)
  return { 'Access-Control-Allow-Origin': '*' };
};

export const jsonHeaders = (
  headers: Record<string, string> = {},
): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...getCorsHeaders(),
  ...headers,
});

export const sendJson = (
  context: RouteContext,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): void => {
  context.sendResponse(statusCode, jsonHeaders(headers), JSON.stringify(body));
};

export const sendError = (
  context: RouteContext,
  statusCode: number,
  error: string,
): void => {
  sendJson(context, statusCode, {
    success: false,
    error,
  });
};

export const sendInternalError = (
  context: RouteContext,
  label: string,
  error: unknown,
): void => {
  console.error(`[CPL-Server] Error in ${label}:`, error);
  sendError(context, 500, 'Internal server error');
};

export const sendNoContent = (
  context: RouteContext,
  headers: Record<string, string> = {},
): void => {
  context.sendResponse(
    204,
    {
      ...getCorsHeaders(),
      ...headers,
    },
    '',
  );
};

export const parseJsonBody = <T>(body?: string): T | null => {
  if (typeof body !== 'string' || body.length === 0) {
    return null;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
};

export const decodeRouteParam = (value?: string): string =>
  decodeURIComponent(value ?? '');

export const getHeaderValue = (
  headers: RouteRequest['headers'],
  name: string,
): string => {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
};
