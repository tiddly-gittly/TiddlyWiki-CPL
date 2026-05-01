import { getHeaderValue } from '../http';
import { getRuntimeState } from '../runtime-state';
import type { RouteRequest } from '../types';

const runtimeState = getRuntimeState().rateLimiter;
const DOWNLOAD_WINDOW_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const cleanup = (): void => {
  const now = Date.now();

  Object.entries(runtimeState.downloadLimits).forEach(([pluginTitle, limits]) => {
    Object.entries(limits).forEach(([ip, timestamp]) => {
      if (now - timestamp > DOWNLOAD_WINDOW_MS) {
        delete limits[ip];
      }
    });

    if (Object.keys(limits).length === 0) {
      delete runtimeState.downloadLimits[pluginTitle];
    }
  });

  Object.entries(runtimeState.ratingLimits).forEach(([pluginTitle, limits]) => {
    if (Object.keys(limits).length === 0) {
      delete runtimeState.ratingLimits[pluginTitle];
    }
  });
};

if (!runtimeState.cleanupTimer) {
  runtimeState.cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
  runtimeState.cleanupTimer.unref?.();
}

export const RateLimiter = {
  getClientIp(request: RouteRequest): string {
    const forwardedFor = getHeaderValue(request.headers, 'x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim() || 'unknown';
    }

    const realIp = getHeaderValue(request.headers, 'x-real-ip');
    if (realIp) {
      return realIp;
    }

    return (
      request.connection?.remoteAddress
      || request.socket?.remoteAddress
      || 'unknown'
    );
  },

  canDownload(pluginTitle: string, ip: string): boolean {
    if (process.env.CPL_TEST_MODE === 'true') {
      return true;
    }

    const lastDownload = runtimeState.downloadLimits[pluginTitle]?.[ip];
    if (!lastDownload) {
      return true;
    }

    return Date.now() - lastDownload > DOWNLOAD_WINDOW_MS;
  },

  recordDownload(pluginTitle: string, ip: string): void {
    if (!runtimeState.downloadLimits[pluginTitle]) {
      runtimeState.downloadLimits[pluginTitle] = {};
    }

    runtimeState.downloadLimits[pluginTitle][ip] = Date.now();
  },

  canRate(
    pluginTitle: string,
    ip: string,
    dataStore?: { hasRated: (title: string, clientIp: string) => boolean },
  ): boolean {
    if (process.env.CPL_TEST_MODE === 'true') {
      return true;
    }

    if (runtimeState.ratingLimits[pluginTitle]?.[ip]) {
      return false;
    }

    if (dataStore?.hasRated(pluginTitle, ip)) {
      if (!runtimeState.ratingLimits[pluginTitle]) {
        runtimeState.ratingLimits[pluginTitle] = {};
      }

      runtimeState.ratingLimits[pluginTitle][ip] = true;
      return false;
    }

    return true;
  },

  recordRating(pluginTitle: string, ip: string): void {
    if (!runtimeState.ratingLimits[pluginTitle]) {
      runtimeState.ratingLimits[pluginTitle] = {};
    }

    runtimeState.ratingLimits[pluginTitle][ip] = true;
  },

  getStatus(): { trackedDownloads: number; trackedRatings: number } {
    const trackedDownloads = Object.values(runtimeState.downloadLimits).reduce(
      (count, limits) => count + Object.keys(limits).length,
      0,
    );
    const trackedRatings = Object.values(runtimeState.ratingLimits).reduce(
      (count, limits) => count + Object.keys(limits).length,
      0,
    );

    return {
      trackedDownloads,
      trackedRatings,
    };
  },
};