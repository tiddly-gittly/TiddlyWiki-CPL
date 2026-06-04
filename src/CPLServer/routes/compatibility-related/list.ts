import { CompatibilityTiddlerStore } from '../../lib/store/compatibility-tiddlers';
import {
  decodeRouteParam,
  sendInternalError,
  sendJson,
} from '../../lib/http';
import type { RouteHandler } from '../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/compatibility-related\/(.+)$/;

export const handler: RouteHandler = (_request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const reports = CompatibilityTiddlerStore.getRelatedReports(
      pluginTitle,
    );

    sendJson(context, 200, {
      success: true,
      pluginTitle,
      reports,
    });
  } catch (error) {
    sendInternalError(context, 'get-related-compatibility handler', error);
  }
};
