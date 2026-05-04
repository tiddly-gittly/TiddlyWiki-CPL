import { Auth } from '../../../lib/auth';
import { Config } from '../../../lib/config';
import { decodeRouteParam, sendError, sendInternalError, sendJson, parseJsonBody } from '../../../lib/http';
import { getRuntimeState } from '../../../lib/runtime-state';
import { CompatibilityStore } from '../../../lib/store/compatibility';
import type { CompatibilityReport, RouteHandler } from '../../../lib/types';

interface CreateCompatibilityBody {
  twVersionMin?: unknown;
  twVersionMax?: unknown;
  conflictingPlugins?: unknown;
  description?: unknown;
}

const COMPATIBILITY_REPORT_WINDOW_MS = 60 * 60 * 1000;
const MAX_REPORTS_PER_HOUR = 10;
const compatibilityLimits = getRuntimeState().compatibilityRoute.limits;

const canSubmitCompatibilityReport = (githubId: string): boolean => {
  if (process.env.CPL_TEST_MODE === 'true') {
    return true;
  }

  const now = Date.now();
  const recent = (compatibilityLimits[githubId] ?? []).filter(
    timestamp => now - timestamp < COMPATIBILITY_REPORT_WINDOW_MS,
  );
  compatibilityLimits[githubId] = recent;

  return recent.length < MAX_REPORTS_PER_HOUR;
};

const recordCompatibilityReport = (githubId: string): void => {
  if (!compatibilityLimits[githubId]) {
    compatibilityLimits[githubId] = [];
  }

  compatibilityLimits[githubId].push(Date.now());
};

const isValidConflictingPlugin = (value: unknown): value is { pluginTitle: string; description: string } => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.pluginTitle === 'string' && typeof candidate.description === 'string';
};

export const method = 'POST';
export const path = /^\/cpl\/api\/compatibility\/(.+)$/;
export const bodyFormat = 'string';

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const body = parseJsonBody<CreateCompatibilityBody>(context.data);
    const user = Auth.getUserFromRequest(request);

    if (!user) {
      sendError(context, 401, 'Authentication required. Please login with GitHub.');
      return;
    }

    if (typeof body?.description !== 'string' || !body.description.trim()) {
      sendError(context, 400, 'Missing description field');
      return;
    }

    const description = body.description.trim();
    if (description.length > 5000) {
      sendError(context, 400, 'Description too long (max 5000 characters)');
      return;
    }

    if (!canSubmitCompatibilityReport(user.githubId)) {
      sendError(
        context,
        429,
        `Rate limit exceeded. Maximum ${MAX_REPORTS_PER_HOUR} compatibility reports per hour.`,
      );
      return;
    }

    const conflictingPlugins: Array<{ pluginTitle: string; description: string }> = [];
    if (Array.isArray(body.conflictingPlugins)) {
      for (const item of body.conflictingPlugins) {
        if (!isValidConflictingPlugin(item)) {
          continue;
        }

        const conflictPluginTitle = item.pluginTitle.trim();
        if (conflictPluginTitle) {
          conflictingPlugins.push({
            pluginTitle: conflictPluginTitle,
            description: item.description.trim().slice(0, 1000),
          });
        }
      }
    }

    const timestamp = new Date().toISOString();

    const report: CompatibilityReport = {
      id: `${Config.serverId || 'default'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pluginTitle,
      reporterGithubId: user.githubId,
      reporterUsername: user.username,
      twVersionMin: typeof body.twVersionMin === 'string' ? body.twVersionMin : undefined,
      twVersionMax: typeof body.twVersionMax === 'string' ? body.twVersionMax : undefined,
      conflictingPlugins,
      description,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    CompatibilityStore.addReport(pluginTitle, report);
    recordCompatibilityReport(user.githubId);

    sendJson(context, 201, {
      success: true,
      message: 'Compatibility report submitted for review',
      report,
    });
  } catch (error) {
    sendInternalError(context, 'post-compatibility handler', error);
  }
};
