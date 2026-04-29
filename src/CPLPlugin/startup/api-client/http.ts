import { tw, type JsonObject, type ApiCallback } from './types';
import { CPL_API_BASE } from './constants';
import { getErrorMessage } from './utilities';
import { getJwtToken } from './auth';
import { apiAvailability } from './state';

const getUnavailableMessage = (): string =>
  'This mirror does not provide CPL server API features.';

export const rawApiRequest = <T extends JsonObject>(
  method: string,
  endpoint: string,
  body: JsonObject | null,
  callback: ApiCallback<T>,
  extraHeaders?: Record<string, string>,
  baseUrl?: string,
): void => {
  const options: {
    url: string;
    type: string;
    headers: Record<string, string>;
    data?: string;
    callback: (error: unknown, response: string) => void;
  } = {
    url: baseUrl ? `${baseUrl}${CPL_API_BASE}${endpoint}` : `${CPL_API_BASE}${endpoint}`,
    type: method,
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders ?? {}),
    },
    callback: (error, response) => {
      if (error) {
        callback(getErrorMessage(error), null);
        return;
      }

      try {
        callback(null, JSON.parse(response) as T);
      } catch {
        callback('Invalid JSON response', null);
      }
    },
  };

  if (body) {
    options.data = JSON.stringify(body);
  }

  tw.utils.httpRequest(options);
};

export const apiRequest = <T extends JsonObject>(
  method: string,
  endpoint: string,
  body: JsonObject | null,
  callback: ApiCallback<T>,
): void => {
  if (apiAvailability === false) {
    callback(getUnavailableMessage(), null);
    return;
  }

  rawApiRequest(method, endpoint, body, callback);
};

export const authenticatedRequest = <T extends JsonObject>(
  method: string,
  endpoint: string,
  body: JsonObject | null,
  callback: ApiCallback<T>,
): void => {
  if (apiAvailability === false) {
    callback(getUnavailableMessage(), null);
    return;
  }

  const token = getJwtToken();
  rawApiRequest(method, endpoint, body, callback, token ? { Authorization: `Bearer ${token}` } : undefined);
};
