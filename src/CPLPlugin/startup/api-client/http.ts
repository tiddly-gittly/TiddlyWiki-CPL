import { tw, type JsonObject, type ApiCallback } from './types';
import { API_MESSAGE_TIDDLER } from './constants';
import { getErrorMessage } from './utilities';
import { getJwtToken } from './auth';
import { apiAvailability, getCurrentMirrorApiBase } from './state';

const getUnavailableMessage = (): string =>
  tw.wiki.getTiddlerText(
    API_MESSAGE_TIDDLER,
    'This mirror does not provide CPL server API features.',
  );

export const rawApiRequest = <T extends JsonObject>(
  method: string,
  endpoint: string,
  body: JsonObject | null,
  callback: ApiCallback<T>,
  extraHeaders?: Record<string, string>,
  baseUrl?: string,
): void => {
  const headers: Record<string, string> = {
    ...(extraHeaders ?? {}),
  };
  let data: string | undefined;

  if (body) {
    headers['Content-Type'] = 'application/json';
    data = JSON.stringify(body);
  }

  fetch(`${baseUrl ?? getCurrentMirrorApiBase()}${endpoint}`, {
    method,
    headers,
    body: data,
    credentials: 'include',
  })
    .then(async response => {
      const text = await response.text();
      if (!response.ok) {
        callback(text || response.statusText, null);
        return;
      }

      try {
        callback(null, JSON.parse(text) as T);
      } catch {
        callback('Invalid JSON response', null);
      }
    })
    .catch(error => {
      callback(getErrorMessage(error), null);
    });
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
  rawApiRequest(
    method,
    endpoint,
    body,
    callback,
    token ? { Authorization: `Bearer ${token}` } : undefined,
  );
};
