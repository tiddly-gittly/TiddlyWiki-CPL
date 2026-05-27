import { Auth } from '../../../lib/auth';
import { sendJson } from '../../../lib/http';
import type { RouteHandler } from '../../../lib/types';

export const method = 'POST';
export const path = /^\/cpl\/api\/auth\/logout$/;

export const handler: RouteHandler = (_request, _response, context) => {
  sendJson(
    context,
    200,
    {
      success: true,
    },
    {
      'Set-Cookie': Auth.clearCookie(),
    },
  );
};
