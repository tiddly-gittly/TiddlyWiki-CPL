import { Config } from '../../../lib/config';
import { sendInternalError, sendJson } from '../../../lib/http';
import type { RouteHandler } from '../../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/api\/auth\/config$/;

export const handler: RouteHandler = (_request, _response, context) => {
  try {
    sendJson(context, 200, {
      githubClientId: Config.githubClientId || null,
    });
  } catch (error) {
    sendInternalError(context, 'auth-config handler', error);
  }
};
