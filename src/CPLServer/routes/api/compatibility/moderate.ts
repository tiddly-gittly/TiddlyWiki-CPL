import { Auth } from '../../../lib/auth';
import { CompatibilityStore } from '../../../lib/store/compatibility';
import { sendError, sendInternalError, sendJson, parseJsonBody } from '../../../lib/http';
import type { RouteHandler, CompatibilityReportStatus } from '../../../lib/types';

interface ModerateBody {
  status?: unknown;
}

const isValidStatus = (value: unknown): value is CompatibilityReportStatus => {
  return value === 'approved' || value === 'rejected';
};

export const method = 'PUT';
export const path = /^\/cpl\/api\/compatibility\/(.+)\/([^/]+)$/;
export const bodyFormat = 'string';

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const pluginTitle = decodeURIComponent(context.params[0] ?? '');
    const reportId = decodeURIComponent(context.params[1] ?? '');
    const body = parseJsonBody<ModerateBody>(context.data);
    const user = Auth.getUserFromRequest(request);

    if (!user || !Auth.isAdmin(user)) {
      sendError(context, 403, 'Admin privileges required');
      return;
    }

    if (!isValidStatus(body?.status)) {
      sendError(context, 400, 'Missing or invalid status. Expected: approved or rejected');
      return;
    }

    const report = CompatibilityStore.updateReportStatus(pluginTitle, reportId, body.status);
    if (!report) {
      sendError(context, 404, 'Report not found');
      return;
    }

    sendJson(context, 200, {
      success: true,
      message: `Report ${body.status}`,
      report,
    });
  } catch (error) {
    sendInternalError(context, 'put-compatibility handler', error);
  }
};
