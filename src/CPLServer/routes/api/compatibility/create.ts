import { Auth } from '../../../lib/auth';
import { Config } from '../../../lib/config';
import {
  decodeRouteParam,
  sendError,
  sendInternalError,
  sendJson,
  parseJsonBody,
} from '../../../lib/http';
import { getRuntimeState } from '../../../lib/runtime-state';
import { CompatibilityTiddlerStore } from '../../../lib/store/compatibility-tiddlers';
import type {
  CompatibilityConflictType,
  CompatibilityReport,
  CompatibilitySeverity,
  ConflictingPlugin,
  RouteHandler,
} from '../../../lib/types';

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

const isValidConflictingPlugin = (
  value: unknown,
): value is { pluginTitle: string; description: string } => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.pluginTitle === 'string' &&
    typeof candidate.description === 'string'
  );
};

const isValidSeverity = (value: unknown): value is CompatibilitySeverity => {
  return value === 'info' || value === 'warning' || value === 'error';
};

const isValidConflictType = (
  value: unknown,
): value is CompatibilityConflictType => {
  return (
    value === 'conflict' ||
    value === 'breaks' ||
    value === 'requires' ||
    value === 'replaces' ||
    value === 'optional'
  );
};

const asOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
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
      sendError(
        context,
        401,
        'Authentication required. Please login with GitHub.',
      );
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

    const conflictingPlugins: ConflictingPlugin[] = [];
    if (Array.isArray(body.conflictingPlugins)) {
      for (const item of body.conflictingPlugins) {
        if (!isValidConflictingPlugin(item)) {
          continue;
        }

        const conflictPluginTitle = item.pluginTitle.trim();
        if (conflictPluginTitle) {
          const candidate = item as Record<string, unknown>;
          conflictingPlugins.push({
            pluginTitle: conflictPluginTitle,
            description: item.description.trim().slice(0, 1000),
            versionMin: asOptionalString(candidate.versionMin),
            versionMax: asOptionalString(candidate.versionMax),
            severity: isValidSeverity(candidate.severity)
              ? candidate.severity
              : 'error',
            type: isValidConflictType(candidate.type)
              ? candidate.type
              : 'conflict',
          });
        }
      }
    }

    const timestamp = new Date().toISOString();

    const report: CompatibilityReport = {
      id: `${Config.serverId || 'default'}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      pluginTitle,
      reporterGithubId: user.githubId,
      reporterUsername: user.username,
      twVersionMin: asOptionalString(body.twVersionMin),
      twVersionMax: asOptionalString(body.twVersionMax),
      conflictingPlugins,
      description,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    CompatibilityTiddlerStore.addReport(report);
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
