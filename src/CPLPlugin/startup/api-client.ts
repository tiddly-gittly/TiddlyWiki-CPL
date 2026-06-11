import {
  tw,
  type JsonObject,
  type ApiCallback,
  type CPLServerApi,
  type PluginStatsResponse,
} from './api-client/types';
import {
  API_GET_STATS_REQUEST_TITLE,
  API_GET_STATS_RESPONSE_PREFIX,
  API_MESSAGE_TIDDLER,
  API_RECORD_DOWNLOAD_REQUEST_TITLE,
  API_RECORD_DOWNLOAD_RESPONSE_PREFIX,
  SERVER_PROBE_REFRESH_TITLE,
} from './api-client/constants';
import { setupCommentJsonProcessor } from './api-client/comment-processor';
import { handleGithubLogin, handleOAuthCallback } from './api-client/oauth';
import { startBuildStatusPolling } from './build-status-poll';

export const name = 'cpl-server-api-client';
export const platforms = ['browser'];
export const after = ['startup'];
export const synchronous = true;

const GITHUB_LOGIN_REQUEST_TITLE = '$:/temp/CPL-Server/github-login-request';

const getUnavailableMessage = (): string =>
  tw.wiki.getTiddlerText(
    API_MESSAGE_TIDDLER,
    'This mirror does not provide CPL server API features.',
  );

const getApiAvailability = (): boolean | null => {
  const serverType = tw.wiki.getTiddlerText(
    '$:/temp/CPL-Repo/server-type',
    'unknown',
  );
  if (serverType === 'server') {
    return true;
  }
  if (serverType === 'unreachable') {
    return false;
  }
  return null;
};

const pendingStatsRequests = new Map<
  string,
  ApiCallback<PluginStatsResponse>
>();
const pendingDownloadRequests = new Map<string, ApiCallback<JsonObject>>();
let apiResponseBridgeInitialized = false;

const createRequestToken = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const resolveJsonResponse = <T extends JsonObject>(
  title: string,
  callback: ApiCallback<T>,
): void => {
  const tiddler = tw.wiki.getTiddler(title);
  const error = tiddler?.fields.error;
  const text = tiddler?.fields.text ?? '';
  if (typeof error === 'string' && error.trim() !== '') {
    callback(error, null);
    tw.wiki.deleteTiddler(title);
    return;
  }

  try {
    callback(null, JSON.parse(text || '{}') as T);
  } catch {
    callback('Invalid JSON response', null);
  }
  tw.wiki.deleteTiddler(title);
};

const setupApiResponseBridge = (): void => {
  if (apiResponseBridgeInitialized) {
    return;
  }
  apiResponseBridgeInitialized = true;

  tw.wiki.addEventListener('change', changes => {
    for (const title of Object.keys(changes)) {
      if (title.startsWith(API_GET_STATS_RESPONSE_PREFIX)) {
        const token = title.slice(API_GET_STATS_RESPONSE_PREFIX.length);
        const callback = pendingStatsRequests.get(token);
        if (callback) {
          pendingStatsRequests.delete(token);
          resolveJsonResponse(title, callback);
        }
      }
      if (title.startsWith(API_RECORD_DOWNLOAD_RESPONSE_PREFIX)) {
        const token = title.slice(API_RECORD_DOWNLOAD_RESPONSE_PREFIX.length);
        const callback = pendingDownloadRequests.get(token);
        if (callback) {
          pendingDownloadRequests.delete(token);
          resolveJsonResponse(title, callback);
        }
      }
    }
  });
};

const setupGithubLoginRequest = (): void => {
  tw.wiki.addEventListener('change', changes => {
    if (!tw.utils.hop(changes, GITHUB_LOGIN_REQUEST_TITLE)) {
      return;
    }
    const request = tw.wiki.getTiddlerText(GITHUB_LOGIN_REQUEST_TITLE, '');
    if (!request) {
      return;
    }
    tw.wiki.addTiddler({ title: GITHUB_LOGIN_REQUEST_TITLE, text: '' });
    handleGithubLogin();
  });
};

const cplServerApi: CPLServerApi = {
  getStats(pluginTitle, callback) {
    if (getApiAvailability() === false) {
      callback(getUnavailableMessage(), null);
      return;
    }
    const token = createRequestToken();
    pendingStatsRequests.set(token, callback);
    tw.wiki.addTiddler({
      title: API_GET_STATS_REQUEST_TITLE,
      text: token,
      'plugin-title': pluginTitle,
      endpoint: `/stats/${encodeURIComponent(pluginTitle)}`,
    });
  },
  recordDownload(pluginTitle, callback) {
    if (getApiAvailability() === false) {
      callback(getUnavailableMessage(), null);
      return;
    }
    const token = createRequestToken();
    pendingDownloadRequests.set(token, callback);
    tw.wiki.addTiddler({
      title: API_RECORD_DOWNLOAD_REQUEST_TITLE,
      text: token,
      'plugin-title': pluginTitle,
      endpoint: `/download/${encodeURIComponent(pluginTitle)}`,
    });
  },
};

export const startup = (): void => {
  setupApiResponseBridge();
  tw.cpl = cplServerApi;
  tw.cplServerAPI = tw.cpl;

  // Force initial Wikitext-driven server config sync on startup.
  tw.wiki.addTiddler({
    title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo',
    text: tw.wiki.getTiddlerText(
      '$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo',
      '',
    ),
  });
  tw.wiki.addTiddler({
    title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-server-repo',
    text: tw.wiki.getTiddlerText(
      '$:/plugins/Gk0Wk/CPL-Repo/config/current-server-repo',
      '',
    ),
  });

  tw.wiki.addTiddler({
    title: SERVER_PROBE_REFRESH_TITLE,
    text: String(Date.now()),
  });

  // Start polling build status for the badge widget
  startBuildStatusPolling();

  // Process comment JSON into individual tiddlers for safe filter iteration
  setupCommentJsonProcessor();
  setupGithubLoginRequest();
  handleOAuthCallback();

  console.log('[CPL-Server] API Client initialized');
};
