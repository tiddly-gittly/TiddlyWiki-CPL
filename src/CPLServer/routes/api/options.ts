import { CORS_HEADERS, sendNoContent } from '../../lib/http';
import type { RouteHandler } from '../../lib/types';

export const method = 'OPTIONS';
export const path = /^\/cpl\/api\//;

export const handler: RouteHandler = (_request, _response, context) => {
  sendNoContent(context, {
    ...CORS_HEADERS,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  });
};