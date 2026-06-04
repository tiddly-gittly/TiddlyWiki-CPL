import { Auth } from '../../lib/auth';
import { CompatibilityTiddlerStore } from '../../lib/store/compatibility-tiddlers';
import {
  decodeRouteParam,
  sendError,
  sendInternalError,
  sendJson,
  parseJsonBody,
} from '../../lib/http';
import type {
  RouteHandler,
  CompatibilityReportStatus,
} from '../../lib/types';

interface ModerateBody {
  status?: unknown;
}

const isValidStatus = (value: unknown): value is CompatibilityReportStatus => {
  return value === 'approved' || value === 'rejected';
};

export const method = 'PUT';
export const path = /^\/cpl\/compatibility\/(.+)\/([^/]+)$/;
export const bodyFormat = 'string';

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const reportId = decodeRouteParam(context.params[1]);
    const body = parseJsonBody<ModerateBody>(context.data);
    const user = Auth.getUserFromRequest(request);

    if (!user || !Auth.isAdmin(user)) {
      sendError(context, 403, 'Admin privileges required');
      return;
    }

    const { status } = body ?? {};
    if (!isValidStatus(status)) {
      sendError(
        context,
        400,
        'Missing or invalid status. Expected: approved or rejected',
      );
      return;
    }

    const report = CompatibilityTiddlerStore.updateReportStatus(
      pluginTitle,
      reportId,
      status,
    );
    if (!report) {
      sendError(context, 404, 'Report not found');
      return;
    }

    sendJson(context, 200, {
      success: true,
      message: `Report ${status}`,
      report,
    });
  } catch (error) {
    sendInternalError(context, 'put-compatibility handler', error);
  }
};
