import { Auth } from '../../../lib/auth';
import { Config } from '../../../lib/config';
import { sendError, sendInternalError, sendJson, parseJsonBody } from '../../../lib/http';
import { CompatibilityStore } from '../../../lib/store/compatibility';
import type { CompatibilityReport, RouteHandler } from '../../../lib/types';

interface CreateCompatibilityBody {
  twVersionMin?: unknown;
  twVersionMax?: unknown;
  conflictingPlugins?: unknown;
  description?: unknown;
}

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
    const pluginTitle = decodeURIComponent(context.params[0] ?? '');
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

    const conflictingPlugins: Array<{ pluginTitle: string; description: string }> = [];
    if (Array.isArray(body.conflictingPlugins)) {
      for (const item of body.conflictingPlugins) {
        if (isValidConflictingPlugin(item)) {
          conflictingPlugins.push(item);
        }
      }
    }

    const report: CompatibilityReport = {
      id: `${Config.serverId || 'default'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pluginTitle,
      reporterGithubId: user.githubId,
      reporterUsername: user.username,
      twVersionMin: typeof body.twVersionMin === 'string' ? body.twVersionMin : undefined,
      twVersionMax: typeof body.twVersionMax === 'string' ? body.twVersionMax : undefined,
      conflictingPlugins,
      description: body.description.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    CompatibilityStore.addReport(pluginTitle, report);

    sendJson(context, 201, {
      success: true,
      message: 'Compatibility report submitted for review',
      report,
    });
  } catch (error) {
    sendInternalError(context, 'post-compatibility handler', error);
  }
};
