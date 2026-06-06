import * as fs from 'fs';
import { sendInternalError, sendJson } from '../lib/http';
import type { RouteHandler } from '../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/build-status$/;

const BUILD_STATUS_FILE = '/tmp/cpl-build-status.json';

const readBuildStatus = (): {
  phase: string;
  message: string;
  startedAt: string;
} => {
  try {
    if (fs.existsSync(BUILD_STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(BUILD_STATUS_FILE, 'utf-8'));
    }
  } catch {
    /* ignore */
  }
  return { phase: 'idle', message: 'Server is running', startedAt: '' };
};

export const handler: RouteHandler = (_request, _response, context) => {
  try {
    const status = readBuildStatus();
    sendJson(context, 200, status, {
      'Cache-Control': 'no-cache',
    });
  } catch (error) {
    sendInternalError(context, 'build-status handler', error);
  }
};
