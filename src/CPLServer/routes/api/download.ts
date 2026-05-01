import { DataStore } from '../../lib/store/data';
import { RateLimiter } from '../../lib/security/rate-limit';
import { decodeRouteParam, sendInternalError, sendJson } from '../../lib/http';
import type { RouteHandler } from '../../lib/types';

export const method = 'POST';
export const path = /^\/cpl\/api\/download\/(.+)$/;

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const ip = RateLimiter.getClientIp(request);

    if (RateLimiter.canDownload(pluginTitle, ip)) {
      RateLimiter.recordDownload(pluginTitle, ip);
      const stats = DataStore.updateDownloadStats(pluginTitle, ip);
      sendJson(context, 200, {
        success: true,
        message: 'Download recorded',
        plugintitle: pluginTitle,
        downloadCount: stats.downloadCount,
      });
      return;
    }

    const stats = DataStore.getStats(pluginTitle);
    sendJson(context, 200, {
      success: true,
      message: 'Download rate limited (already counted recently)',
      plugintitle: pluginTitle,
      downloadCount: stats.downloadCount,
    });
  } catch (error) {
    sendInternalError(context, 'download handler', error);
  }
};