import { Auth } from '../../lib/auth';
import { CompatibilityTiddlerStore } from '../../lib/store/compatibility-tiddlers';
import { sendError, sendInternalError, sendJson } from '../../lib/http';
import type { RouteHandler } from '../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/compatibility\/pending$/;

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const user = Auth.getUserFromRequest(request);
    if (!user || !Auth.isAdmin(user)) {
      sendError(context, 403, 'Admin privileges required');
      return;
    }

    const reports = CompatibilityTiddlerStore.getPendingReports();

    sendJson(context, 200, {
      success: true,
      reports,
    });
  } catch (error) {
    sendInternalError(context, 'get-compatibility-pending handler', error);
  }
};
