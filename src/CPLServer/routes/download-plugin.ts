import * as fs from 'fs';
import * as pathModule from 'path';

import {
  isSafePluginVersionFileName,
  sanitizePluginFileName,
} from '../lib/files';
import { paths } from '../lib/paths';
import { RateLimiter } from '../lib/security/rate-limit';
import { DownloadStatsTiddlerStore } from '../lib/store/download-stats-tiddlers';
import { decodeRouteParam, sendError, sendInternalError } from '../lib/http';
import type { RouteContext, RouteHandler } from '../lib/types';

const findPluginFile = (
  pluginTitle: string,
  version?: string,
): string | null => {
  const sanitizedTitle = sanitizePluginFileName(pluginTitle);

  // Specific version requested → look in history directory first.
  if (version && version !== 'latest') {
    const historyPath = pathModule.join(
      paths.pluginFetchedHistory,
      sanitizedTitle,
      `${version}.json`,
    );
    if (fs.existsSync(historyPath)) {
      return historyPath;
    }
    // Version not found in history; fall through to current (may match).
  }

  const fetchedPath = pathModule.join(
    paths.pluginFetched,
    `${sanitizedTitle}.json`,
  );
  if (fs.existsSync(fetchedPath)) {
    return fetchedPath;
  }

  const offlinePath = pathModule.join(
    paths.pluginOffline,
    `${sanitizedTitle}.json`,
  );
  if (fs.existsSync(offlinePath)) {
    return offlinePath;
  }

  return null;
};

export const method = 'GET';
export const path = /^\/cpl\/download-plugin\/(.+)$/;

const parseVersionQuery = (rawUrl: string): string | undefined => {
  const qIndex = rawUrl.indexOf('?');
  if (qIndex === -1) {
    return undefined;
  }

  for (const part of rawUrl.slice(qIndex + 1).split('&')) {
    const eq = part.indexOf('=');
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const key = decodeURIComponent(rawKey);
    if (key === 'version') {
      return eq === -1 ? '' : decodeURIComponent(part.slice(eq + 1));
    }
  }

  return undefined;
};

const getRequestedVersion = (
  requestUrl: string,
  context: RouteContext,
): string | undefined => {
  const version = context.queryParameters?.version;
  if (Array.isArray(version)) {
    return version[0];
  }
  if (typeof version === 'string') {
    return version;
  }
  return parseVersionQuery(requestUrl);
};

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    // TiddlyWiki parses query strings into route context; keep a manual
    // fallback for direct unit calls outside the server.
    const version = getRequestedVersion(request.url ?? '/', context);
    if (
      version &&
      version !== 'latest' &&
      !isSafePluginVersionFileName(version)
    ) {
      sendError(context, 400, 'Invalid plugin version');
      return;
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
