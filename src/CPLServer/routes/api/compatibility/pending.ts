import { Auth } from '../../../lib/auth';
import { CompatibilityStore } from '../../../lib/store/compatibility';
import { sendError, sendInternalError, sendJson } from '../../../lib/http';
import type { RouteHandler } from '../../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/api\/compatibility\/pending$/;

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const user = Auth.getUserFromRequest(request);
    if (!user || !Auth.isAdmin(user)) {
      sendError(context, 403, 'Admin privileges required');
      return;
    }

    const reports = CompatibilityStore.getPendingReports();

    sendJson(context, 200, {
      success: true,
      reports,
    });
  } catch (error) {
    sendInternalError(context, 'get-compatibility-pending handler', error);
  }
};
