import * as fs from 'fs';
import * as pathModule from 'path';

import { sanitizePluginFileName } from '../lib/files';
import { RateLimiter } from '../lib/security/rate-limit';
import { DownloadStatsTiddlerStore } from '../lib/store/download-stats-tiddlers';
import { decodeRouteParam, sendError, sendInternalError } from '../lib/http';
import type { RouteHandler } from '../lib/types';

const findPluginFile = (
  pluginTitle: string,
  version?: string,
): string | null => {
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
export const path = /^\/cpl\/download-plugin\/(.+)$/;

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    // Parse query string manually — TW module sandbox does not provide URL.
    let version: string | undefined;
    const raw = request.url ?? '/';
    const qIndex = raw.indexOf('?');
    if (qIndex !== -1) {
      for (const part of raw.slice(qIndex + 1).split('&')) {
        const eq = part.indexOf('=');
        const key =
          eq === -1
            ? decodeURIComponent(part)
            : decodeURIComponent(part.slice(0, eq));
        if (key === 'version') {
          version = eq === -1 ? '' : decodeURIComponent(part.slice(eq + 1));
        }
      }
    }
    const filePath = findPluginFile(pluginTitle, version);

    if (!filePath) {
      sendError(context, 404, 'Plugin file not found');
      return;
    }

    const ip = RateLimiter.getClientIp(request);
    if (RateLimiter.canDownload(pluginTitle, ip)) {
      RateLimiter.recordDownload(pluginTitle, ip);
      DownloadStatsTiddlerStore.updateDownloadStats(pluginTitle, ip);
    }

    context.sendResponse(
      200,
      {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': `attachment; filename="${sanitizePluginFileName(
          pluginTitle,
        )}.json"`,
      },
      fs.readFileSync(filePath, 'utf-8'),
    );
  } catch (error) {
    sendInternalError(context, 'download-plugin handler', error);
  }
};
