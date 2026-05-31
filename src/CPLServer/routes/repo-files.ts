/**
 * Serve CPL repo static files (index.json, update.json, plugin metadata)
 * under /repo/ path with CORS headers, so that CPL-Repo browser clients
 * can fetch plugin data directly from a CPL server mirror via HTTP.
 */
import * as fs from 'fs';
import * as pathModule from 'path';
import { CORS_HEADERS, sendError } from '../lib/http';
import { decodeRouteParam } from '../lib/http';
import type { RouteHandler } from '../lib/types';

const REPO_DIR = pathModule.resolve(
  process.cwd(),
  'cache',
  'plugins',
);

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
};

const getMimeType = (filePath: string): string =>
  MIME_TYPES[pathModule.extname(filePath).toLowerCase()] ?? 'application/octet-stream';

const resolveSafePath = (requestedPath: string): string | null => {
  // Normalize and prevent directory traversal
  const normalized = pathModule.normalize(requestedPath)
    .replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = pathModule.resolve(REPO_DIR, normalized);
  if (!resolved.startsWith(REPO_DIR + pathModule.sep) && resolved !== REPO_DIR) {
    return null;
  }
  return resolved;
};

export const method = 'GET';
export const path = /^\/repo\/(.+)$/;

export const handler: RouteHandler = (_request, _response, context) => {
  try {
    const filePath = decodeRouteParam(context.params[0]);
    const resolved = resolveSafePath(filePath);

    if (!resolved || !fs.existsSync(resolved)) {
      sendError(context, 404, 'File not found');
      return;
    }

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      sendError(context, 404, 'Not a file');
      return;
    }

    const content = fs.readFileSync(resolved);
    const mimeType = getMimeType(resolved);

    context.sendResponse(
      200,
      {
        'Content-Type': mimeType,
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=300',
        'Content-Length': String(stat.size),
      },
      content instanceof Buffer ? content.toString('utf-8') : content,
    );
  } catch (error) {
    sendError(context, 500, 'Internal server error');
    console.error('[CPL-Server] Error serving repo file:', error);
  }
};
