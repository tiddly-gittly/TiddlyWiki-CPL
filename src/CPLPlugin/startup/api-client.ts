type JsonObject = Record<string, unknown>;
type ApiCallback<T> = (error: string | null, data: T | null) => void;

interface HttpErrorLike {
  message?: string;
  status?: number;
  statusText?: string;
}

interface AuthStatusResponse extends JsonObject {
  authenticated?: boolean;
  user?: unknown;
}

interface RatingResponse extends JsonObject {
  averageRating?: number;
  totalRatings?: number;
}

interface OAuthResponse extends JsonObject {
  success?: boolean;
  token?: string;
  user?: unknown;
}

interface CPLServerApi {
  recordDownload: (pluginTitle: string, callback: ApiCallback<JsonObject>) => void;
  getStats: (pluginTitle: string, callback: ApiCallback<JsonObject>) => void;
  getAllStats: (callback: ApiCallback<JsonObject>) => void;
  submitRating: (
    pluginTitle: string,
    rating: number,
    callback: ApiCallback<RatingResponse>,
  ) => void;
  getChangelog: (pluginTitle: string, callback: ApiCallback<JsonObject>) => void;
  getComments: (pluginTitle: string, callback: ApiCallback<JsonObject>) => void;
  submitComment: (
    pluginTitle: string,
    content: string,
    callback: ApiCallback<JsonObject>,
  ) => void;
  checkAuthStatus: (callback: ApiCallback<AuthStatusResponse>) => void;
  logout: () => void;
}

type TwWithCplApi = typeof $tw & {
  cpl?: CPLServerApi;
  cplServerAPI?: CPLServerApi;
};

const tw = $tw as TwWithCplApi;

type RootWidgetListener = Parameters<typeof tw.rootWidget.addEventListener>[1];
type RootWidgetEvent = RootWidgetListener extends (
  event: infer EventType,
) => boolean | Promise<void> | undefined
  ? EventType
  : never;

export const name = 'cpl-server-api-client';
export const platforms = ['browser'];
export const after = ['startup'];
export const synchronous = true;

const CPL_API_BASE = '/cpl/api';
const API_STATUS_TIDDLER = '$:/temp/CPL-Repo/api-status';
const API_TYPE_TIDDLER = '$:/temp/CPL-Repo/mirror-type';
const API_MESSAGE_TIDDLER = '$:/temp/CPL-Repo/mirror-message';
const MIRROR_CONFIG_TITLE = '$:/plugins/Gk0Wk/CPL-Repo/config/current-repo';
const JWT_TOKEN_KEY = 'cpl_jwt_token';

let apiAvailability: boolean | null = null;
let lastMirrorEntry: string | null = null;

const getCurrentMirrorEntry = (): string =>
  tw.wiki.getTiddlerText(MIRROR_CONFIG_TITLE, '');

const getEventParam = (event: RootWidgetEvent, name: string): string | undefined => {
  const value = event.paramObject?.[name];
  return typeof value === 'string' ? value : undefined;
};

const clearServerTempState = (): void => {
  for (const title of tw.wiki.filterTiddlers('[prefix[$:/temp/CPL-Server/]]')) {
    tw.wiki.deleteTiddler(title);
  }
};

const setApiStatus = (status: string, type: string, message: string): void => {
  const timestamp = String(Date.now());

  tw.wiki.addTiddler({
    title: API_STATUS_TIDDLER,
    text: status,
    timestamp,
  });
  tw.wiki.addTiddler({
    title: API_TYPE_TIDDLER,
    text: type || 'unknown',
    timestamp,
  });
  tw.wiki.addTiddler({
    title: API_MESSAGE_TIDDLER,
    text: message || '',
    timestamp,
  });
};

const getErrorMessage = (error: unknown): string => {
  if (!error) {
    return 'Request failed';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const httpError = error as HttpErrorLike;
  if (httpError.message) {
    return httpError.message;
  }
  if (httpError.status !== undefined) {
    return `HTTP ${httpError.status}${httpError.statusText ? ` ${httpError.statusText}` : ''}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const rawApiRequest = <T extends JsonObject>(
  method: string,
  endpoint: string,
  body: JsonObject | null,
  callback: ApiCallback<T>,
  extraHeaders?: Record<string, string>,
): void => {
  const options: {
    url: string;
    type: string;
    headers: Record<string, string>;
    data?: string;
    callback: (error: unknown, response: string) => void;
  } = {
    url: `${CPL_API_BASE}${endpoint}`,
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

const getUnavailableMessage = (): string =>
  'This mirror does not provide CPL server API features.';

const apiRequest = <T extends JsonObject>(
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

const getJwtToken = (): string | null => {
  try {
    return localStorage.getItem(JWT_TOKEN_KEY);
  } catch {
    return null;
  }
};

const setJwtToken = (token: string | null): void => {
  try {
    if (token) {
      localStorage.setItem(JWT_TOKEN_KEY, token);
      return;
    }

    localStorage.removeItem(JWT_TOKEN_KEY);
  } catch (error) {
    console.error('[CPL-Server] Failed to access localStorage:', error);
  }
};

const authenticatedRequest = <T extends JsonObject>(
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

const probeApiAvailability = (callback: (available: boolean) => void): void => {
  setApiStatus('checking', 'unknown', 'Checking mirror capabilities...');
  rawApiRequest<JsonObject>(
    'GET',
    `/stats/${encodeURIComponent('$:/plugins/Gk0Wk/CPL-Repo/__probe__')}`,
    null,
    error => {
      if (error) {
        apiAvailability = false;
        setApiStatus(
          'unavailable',
          'static',
          'Static mirror detected. Stats, ratings, comments, and login are unavailable here.',
        );
        callback(false);
        return;
      }

      apiAvailability = true;
      setApiStatus('available', 'server', 'Full CPL server features are available on this mirror.');
      callback(true);
    },
  );
};

const hasPluginWikiTag = (tags: unknown): boolean => {
  if (Array.isArray(tags)) {
    return tags.includes('$:/tags/PluginWiki');
  }
  if (typeof tags === 'string') {
    return tw.utils.parseStringArray(tags).includes('$:/tags/PluginWiki');
  }

  return false;
};

const getViewedPluginTitle = (): string | null => {
  const historyTiddler = tw.wiki.getTiddler('$:/HistoryList');
  const currentTitle = historyTiddler?.fields?.['current-tiddler'];

  if (typeof currentTitle !== 'string' || currentTitle.length === 0) {
    return null;
  }

  const tiddler = tw.wiki.getTiddler(currentTitle);
  if (!tiddler || !hasPluginWikiTag(tiddler.fields.tags)) {
    return null;
  }

  const pluginTitle = tiddler.fields['cpl.title'];
  return typeof pluginTitle === 'string' && pluginTitle.length > 0 ? pluginTitle : null;
};

const fetchPluginStats = (pluginTitle: string): void => {
  if (!pluginTitle) {
    return;
  }

  const tempTitle = `$:/temp/CPL-Server/plugin-stats/${pluginTitle}`;
  cplServerApi.getStats(pluginTitle, (error, data) => {
    if (error || !data) {
      console.error('[CPL-Server] Failed to fetch stats for', pluginTitle, error);
      return;
    }

    tw.wiki.addTiddler({
      title: tempTitle,
      text: JSON.stringify(data),
      type: 'application/json',
      'plugin-title': pluginTitle,
      timestamp: String(Date.now()),
    });
  });
};

const fetchPluginChangelog = (pluginTitle: string): void => {
  if (!pluginTitle) {
    return;
  }

  const tempTitle = `$:/temp/CPL-Server/plugin-changelog/${pluginTitle}`;
  cplServerApi.getChangelog(pluginTitle, (error, data) => {
    if (error || !data) {
      console.error('[CPL-Server] Failed to fetch changelog for', pluginTitle, error);
      return;
    }

    tw.wiki.addTiddler({
      title: tempTitle,
      text: JSON.stringify(data),
      type: 'application/json',
      'plugin-title': pluginTitle,
      timestamp: String(Date.now()),
    });
  });
};

const fetchPluginComments = (pluginTitle: string): void => {
  if (!pluginTitle) {
    return;
  }

  const tempTitle = `$:/temp/CPL-Server/comments/${pluginTitle}`;
  cplServerApi.getComments(pluginTitle, (error, data) => {
    if (error || !data) {
      console.error('[CPL-Server] Failed to fetch comments for', pluginTitle, error);
      return;
    }

    tw.wiki.addTiddler({
      title: tempTitle,
      text: JSON.stringify(data),
      type: 'application/json',
      'plugin-title': pluginTitle,
      timestamp: String(Date.now()),
    });
  });
};

const refreshMirrorCapabilityState = (): void => {
  const entry = getCurrentMirrorEntry();
  if (entry === lastMirrorEntry && apiAvailability !== null) {
    return;
  }

  lastMirrorEntry = entry;
  apiAvailability = null;
  clearServerTempState();
  probeApiAvailability(available => {
    if (!available) {
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/user-status',
        text: 'anonymous',
      });
      return;
    }

    cplServerApi.checkAuthStatus((error, data) => {
      if (!error && data?.authenticated) {
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Server/user-status',
          text: 'authenticated',
        });
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Server/user',
          text: JSON.stringify(data.user),
          type: 'application/json',
        });
        return;
      }

      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/user-status',
        text: 'anonymous',
      });
    });
  });
};

const cplServerApi: CPLServerApi = {
  recordDownload(pluginTitle, callback) {
    apiRequest('POST', `/download/${encodeURIComponent(pluginTitle)}`, null, callback);
  },
  getStats(pluginTitle, callback) {
    apiRequest('GET', `/stats/${encodeURIComponent(pluginTitle)}`, null, callback);
  },
  getAllStats(callback) {
    apiRequest('GET', '/stats', null, callback);
  },
  submitRating(pluginTitle, rating, callback) {
    apiRequest('POST', `/rate/${encodeURIComponent(pluginTitle)}`, { rating }, callback);
  },
  getChangelog(pluginTitle, callback) {
    apiRequest('GET', `/changelog/${encodeURIComponent(pluginTitle)}`, null, callback);
  },
  getComments(pluginTitle, callback) {
    authenticatedRequest('GET', `/comments/${encodeURIComponent(pluginTitle)}`, null, callback);
  },
  submitComment(pluginTitle, content, callback) {
    authenticatedRequest('POST', `/comments/${encodeURIComponent(pluginTitle)}`, { content }, callback);
  },
  checkAuthStatus(callback) {
    authenticatedRequest('GET', '/auth/status', null, callback);
  },
  logout() {
    setJwtToken(null);
  },
};

export const startup = (): void => {
  tw.cpl = cplServerApi;
  tw.cplServerAPI = tw.cpl;
  refreshMirrorCapabilityState();

  tw.wiki.addEventListener('change', changes => {
    if ($tw.utils.hop(changes, MIRROR_CONFIG_TITLE)) {
      refreshMirrorCapabilityState();
    }

    const pluginTitle = getViewedPluginTitle();
    if (!pluginTitle) {
      return;
    }

    fetchPluginStats(pluginTitle);
    fetchPluginChangelog(pluginTitle);
    fetchPluginComments(pluginTitle);
  });

  tw.rootWidget.addEventListener('cpl-fetch-stats', (event: RootWidgetEvent): undefined => {
    const pluginTitle = getEventParam(event, 'pluginTitle');
    if (pluginTitle) {
      fetchPluginStats(pluginTitle);
    }
    return undefined;
  });

  tw.rootWidget.addEventListener('cpl-fetch-changelog', (event: RootWidgetEvent): undefined => {
    const pluginTitle = getEventParam(event, 'pluginTitle');
    if (pluginTitle) {
      fetchPluginChangelog(pluginTitle);
    }
    return undefined;
  });

  tw.rootWidget.addEventListener('cpl-submit-rating', (event: RootWidgetEvent): undefined => {
    const pluginTitle = getEventParam(event, 'pluginTitle');
    const rating = Number.parseInt(getEventParam(event, 'rating') ?? '', 10);

    if (!pluginTitle || Number.isNaN(rating) || rating < 1 || rating > 5) {
      console.error('[CPL-Server] Invalid rating submission');
      return undefined;
    }

    const tempTitle = `$:/temp/CPL-Server/rating-status/${pluginTitle}`;
    tw.wiki.addTiddler({
      title: tempTitle,
      text: 'submitting',
      'plugin-title': pluginTitle,
    });

    cplServerApi.submitRating(pluginTitle, rating, (error, data) => {
      if (error || !data) {
        tw.wiki.addTiddler({
          title: tempTitle,
          text: `error: ${error || 'Unknown error'}`,
          'plugin-title': pluginTitle,
        });
        return;
      }

      tw.wiki.addTiddler({
        title: tempTitle,
        text: 'success',
        'plugin-title': pluginTitle,
        'average-rating': String(data.averageRating || 0),
        'total-ratings': String(data.totalRatings || 0),
      });

      fetchPluginStats(pluginTitle);
    });
    return undefined;
  });

  tw.rootWidget.addEventListener('cpl-install-plugin', (event: RootWidgetEvent): undefined => {
    const response = getEventParam(event, 'response');
    if (!response || !tw.wiki.tiddlerExists(response)) {
      return undefined;
    }

    try {
      const responseTiddler = tw.wiki.getTiddler(response);
      if (!responseTiddler) {
        return undefined;
      }

      const data = JSON.parse(responseTiddler.fields.text) as { title?: string };
      const rootPlugin = data.title;
      if (!rootPlugin || !tw.cpl) {
        return undefined;
      }

      setTimeout(() => {
        tw.cpl?.recordDownload(rootPlugin, error => {
          if (error) {
            console.error('[CPL-Server] Failed to record download:', error);
            return;
          }

          console.log('[CPL-Server] Download recorded for', rootPlugin);
        });
      }, 100);
    } catch (error) {
      console.error('[CPL-Server] Error recording download:', error);
    }
    return undefined;
  });

  tw.rootWidget.addEventListener('cpl-github-login', (_event: RootWidgetEvent): undefined => {
    const githubClientId = '';
    const redirectUri = `${window.location.origin}/cpl/api/auth/github/callback`;
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(githubClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:read`;
    window.location.href = githubAuthUrl;
    return undefined;
  });

  if (window.location.pathname === '/cpl/api/auth/github/callback') {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      tw.utils.httpRequest({
        url: `/cpl/api/auth/github/callback?code=${encodeURIComponent(code)}`,
        type: 'GET',
        headers: { 'Content-Type': 'application/json' },
        callback: (error: unknown, response: string) => {
          if (error || !response) {
            return;
          }

          try {
            const data = JSON.parse(response) as OAuthResponse;
            if (!data.success || !data.token) {
              return;
            }

            setJwtToken(data.token);
            tw.wiki.addTiddler({
              title: '$:/temp/CPL-Server/user-status',
              text: 'authenticated',
            });
            tw.wiki.addTiddler({
              title: '$:/temp/CPL-Server/user',
              text: JSON.stringify(data.user),
              type: 'application/json',
            });
            window.history.replaceState({}, document.title, '/');
          } catch (parseError) {
            console.error('[CPL-Server] Failed to parse auth response:', parseError);
          }
        },
      });
    }
  }

  tw.rootWidget.addEventListener('cpl-submit-comment', (event: RootWidgetEvent): undefined => {
    const pluginTitle = getEventParam(event, 'pluginTitle');
    if (!pluginTitle) {
      console.error('[CPL-Server] Missing pluginTitle for comment submission');
      return undefined;
    }

    const content = tw.wiki.getTiddler('$:/temp/CPL-Server/comment-draft')?.fields.text ?? '';
    if (content.trim().length === 0) {
      tw.wiki.addTiddler({
        title: `$:/temp/CPL-Server/comment-status/${pluginTitle}`,
        text: 'error: Comment content cannot be empty',
      });
      return undefined;
    }

    tw.wiki.addTiddler({
      title: `$:/temp/CPL-Server/comment-status/${pluginTitle}`,
      text: 'submitting',
    });

    cplServerApi.submitComment(pluginTitle, content.trim(), error => {
      if (error) {
        tw.wiki.addTiddler({
          title: `$:/temp/CPL-Server/comment-status/${pluginTitle}`,
          text: `error: ${error || 'Failed to submit comment'}`,
        });
        return;
      }

      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/comment-draft',
        text: '',
      });
      tw.wiki.addTiddler({
        title: `$:/temp/CPL-Server/comment-status/${pluginTitle}`,
        text: 'success',
      });
      fetchPluginComments(pluginTitle);
    });
    return undefined;
  });

  tw.rootWidget.addEventListener('cpl-fetch-comments', (event: RootWidgetEvent): undefined => {
    const pluginTitle = getEventParam(event, 'pluginTitle');
    if (pluginTitle) {
      fetchPluginComments(pluginTitle);
    }
    return undefined;
  });

  console.log('[CPL-Server] API Client initialized');
};