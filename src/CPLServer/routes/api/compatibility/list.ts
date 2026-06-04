import { CompatibilityTiddlerStore } from '../../../lib/store/compatibility-tiddlers';
import {
  decodeRouteParam,
  sendInternalError,
  sendJson,
} from '../../../lib/http';
import type { RouteHandler } from '../../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/api\/compatibility\/(?!pending$)(.+)$/;

export const handler: RouteHandler = (_request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const reports = CompatibilityTiddlerStore.getReports(pluginTitle, 'approved');

    sendJson(context, 200, {
      success: true,
      pluginTitle,
      reports,
    });
  } catch (error) {
    sendInternalError(context, 'get-compatibility handler', error);
  }
};
