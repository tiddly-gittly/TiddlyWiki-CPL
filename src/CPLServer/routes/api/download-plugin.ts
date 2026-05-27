import * as fs from 'fs';
import * as pathModule from 'path';
import { URL } from 'url';

import { sanitizePluginFileName } from '../../lib/files';
import { DataStore } from '../../lib/store/data';
import { RateLimiter } from '../../lib/security/rate-limit';
import { decodeRouteParam, sendError, sendInternalError } from '../../lib/http';
import type { RouteHandler } from '../../lib/types';

const findPluginFile = (pluginTitle: string, version?: string): string | null => {
  const baseDir = pathModule.resolve('wiki', 'files');
  const sanitizedTitle = sanitizePluginFileName(pluginTitle);

  // Specific version requested → look in history directory first.
  if (version && version !== 'latest') {
    const historyPath = pathModule.join(
      baseDir,
      'plugin-fetched-history',
      sanitizedTitle,
      `${version}.json`,
    );
    if (fs.existsSync(historyPath)) {
      return historyPath;
    }
    // Version not found in history; fall through to current (may match).
  }

  const fetchedPath = pathModule.join(
    baseDir,
    'plugin-fetched',
    `${sanitizedTitle}.json`,
  );
  if (fs.existsSync(fetchedPath)) {
    return fetchedPath;
  }

  const offlinePath = pathModule.join(
    baseDir,
    'plugin-offline',
    `${sanitizedTitle}.json`,
  );
  if (fs.existsSync(offlinePath)) {
    return offlinePath;
  }

  return null;
};

export const method = 'GET';
export const path = /^\/cpl\/api\/download-plugin\/(.+)$/;

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const url = new URL(request.url ?? '', 'http://localhost');
    const version = url.searchParams.get('version') ?? undefined;
    const filePath = findPluginFile(pluginTitle, version);

    if (!filePath) {
      sendError(context, 404, 'Plugin file not found');
      return;
    }

    const ip = RateLimiter.getClientIp(request);
    if (RateLimiter.canDownload(pluginTitle, ip)) {
      RateLimiter.recordDownload(pluginTitle, ip);
      DataStore.updateDownloadStats(pluginTitle, ip);
    }

    context.sendResponse(
      200,
      {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': `attachment; filename="${sanitizePluginFileName(pluginTitle)}.json"`,
      },
      fs.readFileSync(filePath, 'utf-8'),
    );
  } catch (error) {
    sendInternalError(context, 'download-plugin handler', error);
  }
};