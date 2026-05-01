import type { RouteContext, RouteRequest } from './types';

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
};

export const jsonHeaders = (
  headers: Record<string, string> = {},
): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...CORS_HEADERS,
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
  context.sendResponse(204, {
    ...CORS_HEADERS,
    ...headers,
  }, '');
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