import {
  tw,
  type RootWidgetEvent,
  type OAuthResponse,
} from './api-client/types';
import {
  ALL_PLUGIN_STATS_REFRESH_TITLE,
  COMMENTS_CENTER_REFRESH_TITLE,
  LEGACY_MIRROR_CONFIG_TITLE,
  LEGACY_SERVER_CONFIG_TITLE,
  MIRROR_CONFIG_TITLE,
  PLUGIN_ACTIVITY_REFRESH_TITLE,
  SERVER_CONFIG_TITLE,
} from './api-client/constants';
import { getCurrentServerOrigin } from './api-client/state';
import { getEventParam } from './api-client/utilities';
import { createCplServerApi } from './api-client/api';
import { refreshMirrorCapabilityState } from './api-client/server-status';
import { startBuildStatusPolling } from './build-status-poll';

export const name = 'cpl-server-api-client';
export const platforms = ['browser'];
export const after = ['startup'];
export const synchronous = true;

const cplServerApi = createCplServerApi();
const touchRefreshToken = (title: string, pluginTitle?: string): void => {
  tw.wiki.addTiddler({
    title,
    text: String(Date.now()),
    ...(pluginTitle ? { 'plugin-title': pluginTitle } : {}),
  });
};

const requestAllPluginStatsRefresh = (pluginTitle?: string): void => {
  touchRefreshToken(ALL_PLUGIN_STATS_REFRESH_TITLE, pluginTitle);
};

const requestPluginActivityRefresh = (pluginTitle: string): void => {
  touchRefreshToken(PLUGIN_ACTIVITY_REFRESH_TITLE, pluginTitle);
};

const requestCommentsCenterRefresh = (pluginTitle: string): void => {
  touchRefreshToken(COMMENTS_CENTER_REFRESH_TITLE, pluginTitle);
};

export const startup = (): void => {
  tw.cpl = cplServerApi;
  tw.cplServerAPI = tw.cpl;
  refreshMirrorCapabilityState(cplServerApi);

  // Start polling build status for the badge widget
  startBuildStatusPolling();

  // Mirror config change → refresh API availability (rare, keep as simple JS listener)
  tw.wiki.addEventListener('change', changes => {
    if (
      $tw.utils.hop(changes, MIRROR_CONFIG_TITLE) ||
      $tw.utils.hop(changes, LEGACY_MIRROR_CONFIG_TITLE) ||
      $tw.utils.hop(changes, SERVER_CONFIG_TITLE) ||
      $tw.utils.hop(changes, LEGACY_SERVER_CONFIG_TITLE)
    ) {
      refreshMirrorCapabilityState(cplServerApi);
    }
  });

  tw.rootWidget.addEventListener(
    'cpl-refresh-mirror',
    (_event: RootWidgetEvent): undefined => {
      refreshMirrorCapabilityState(cplServerApi);
      return undefined;
    },
  );

  tw.rootWidget.addEventListener(
    'cpl-submit-rating',
    (event: RootWidgetEvent): undefined => {
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

        requestAllPluginStatsRefresh(pluginTitle);
      });
      return undefined;
    },
  );

  tw.rootWidget.addEventListener(
    'cpl-install-plugin',
    (event: RootWidgetEvent): undefined => {
      const response = getEventParam(event, 'response');
      if (!response || !tw.wiki.tiddlerExists(response)) {
        return undefined;
      }

      try {
        const responseTiddler = tw.wiki.getTiddler(response);
        if (!responseTiddler) {
          return undefined;
        }

        const data = JSON.parse(responseTiddler.fields.text) as {
          title?: string;
        };
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
            requestAllPluginStatsRefresh(rootPlugin);
          });
        }, 100);
      } catch (error) {
        console.error('[CPL-Server] Error recording download:', error);
      }
      return undefined;
    },
  );

  tw.rootWidget.addEventListener(
    'cpl-logout',
    (_event: RootWidgetEvent): undefined => {
      cplServerApi.logout();
      tw.wiki.deleteTiddler('$:/temp/CPL-Server/user');
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/user-status',
        text: 'anonymous',
      });
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/is-admin',
        text: 'no',
      });
      return undefined;
    },
  );

  const OAUTH_STATE_KEY = 'cpl-oauth-state';
  const OAUTH_RETURN_KEY = 'cpl-oauth-return';

  const generateOAuthState = (): string => {
    const array = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // Fallback for very old environments
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  tw.rootWidget.addEventListener(
    'cpl-github-login',
    (_event: RootWidgetEvent): undefined => {
      const githubClientId = tw.wiki.getTiddlerText(
        '$:/temp/CPL-Server/github-client-id',
        '',
      );
      if (!githubClientId) {
        console.error(
          '[CPL-Server] GitHub client ID not available. Server may not have OAuth configured.',
        );
        return undefined;
      }
      const state = generateOAuthState();
      try {
        sessionStorage.setItem(OAUTH_STATE_KEY, state);
        sessionStorage.setItem(OAUTH_RETURN_KEY, window.location.href);
      } catch {
        // sessionStorage may be unavailable in some contexts; continue without CSRF protection
      }
      const redirectUri = `${getCurrentServerOrigin()}/cpl/auth/github/callback`;
      const githubAuthParams = new URLSearchParams({
        client_id: githubClientId,
        redirect_uri: redirectUri,
        scope: 'read:user',
        state,
      });
      const githubAuthUrl = `https://github.com/login/oauth/authorize?${githubAuthParams.toString()}`;
      window.location.href = githubAuthUrl;
      return undefined;
    },
  );

  if (window.location.pathname === '/cpl/auth/github/callback') {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    let returnUrl = '/';
    let stateValid = false;
    try {
      const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);
      const storedReturn = sessionStorage.getItem(OAUTH_RETURN_KEY);
      if (storedState && state === storedState) {
        stateValid = true;
        if (storedReturn) {
          returnUrl = storedReturn;
        }
      }
      sessionStorage.removeItem(OAUTH_STATE_KEY);
      sessionStorage.removeItem(OAUTH_RETURN_KEY);
    } catch {
      // sessionStorage unavailable; treat as invalid
    }

    if (!stateValid) {
      console.error(
        '[CPL-Server] OAuth state mismatch. Possible CSRF attack.',
      );
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/oauth-error',
        text: 'OAuth state mismatch. Please try logging in again.',
      });
      window.location.replace('/');
    } else if (code) {
      tw.utils.httpRequest({
        url: `${getCurrentServerOrigin()}/cpl/auth/github/callback?code=${encodeURIComponent(
          code,
        )}`,
        type: 'GET',
        headers: { 'Content-Type': 'application/json' },
        callback: (error: unknown, response: string) => {
          if (error || !response) {
            return;
          }

          try {
            const data = JSON.parse(response) as OAuthResponse;
            if (!data.success) {
              return;
            }
            tw.wiki.addTiddler({
              title: '$:/temp/CPL-Server/user-status',
              text: 'authenticated',
            });
            tw.wiki.addTiddler({
              title: '$:/temp/CPL-Server/user',
              text: JSON.stringify(data.user),
              type: 'application/json',
            });
            // Also check admin status after login
            cplServerApi.checkAuthStatus((_err, authData) => {
              if (!_err && authData) {
                tw.wiki.addTiddler({
                  title: '$:/temp/CPL-Server/is-admin',
                  text: authData.isAdmin ? 'yes' : 'no',
                });
              }
            });
            window.location.replace(returnUrl);
          } catch (parseError) {
            console.error(
              '[CPL-Server] Failed to parse auth response:',
              parseError,
            );
          }
        },
      });
    } else {
      window.location.replace('/');
    }
  }

  tw.rootWidget.addEventListener(
    'cpl-submit-comment',
    (event: RootWidgetEvent): undefined => {
      const pluginTitle = getEventParam(event, 'pluginTitle');
      if (!pluginTitle) {
        console.error(
          '[CPL-Server] Missing pluginTitle for comment submission',
        );
        return undefined;
      }

      const content =
        tw.wiki.getTiddler('$:/temp/CPL-Server/comment-draft')?.fields.text ??
        '';
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
        requestPluginActivityRefresh(pluginTitle);
        requestCommentsCenterRefresh(pluginTitle);
      });
      return undefined;
    },
  );

  tw.rootWidget.addEventListener(
    'cpl-submit-compatibility',
    (event: RootWidgetEvent): undefined => {
      const pluginTitle = getEventParam(event, 'pluginTitle');
      if (!pluginTitle) {
        console.error(
          '[CPL-Server] Missing pluginTitle for compatibility report',
        );
        return undefined;
      }

      const twVersionMin = getEventParam(event, 'twVersionMin') || undefined;
      const twVersionMax = getEventParam(event, 'twVersionMax') || undefined;
      const description = getEventParam(event, 'description') || '';
      const conflictPlugin = getEventParam(event, 'conflictPlugin') || '';
      const conflictDescription =
        getEventParam(event, 'conflictDescription') || '';

      const conflictingPlugins: Array<{
        pluginTitle: string;
        description: string;
      }> = [];
      if (conflictPlugin.trim()) {
        conflictingPlugins.push({
          pluginTitle: conflictPlugin.trim(),
          description: conflictDescription.trim() || 'No description provided',
        });
      }

      if (!description.trim()) {
        tw.wiki.addTiddler({
          title: `$:/temp/CPL-Server/compatibility-status/${pluginTitle}`,
          text: 'error: Description cannot be empty',
        });
        return undefined;
      }

      tw.wiki.addTiddler({
        title: `$:/temp/CPL-Server/compatibility-status/${pluginTitle}`,
        text: 'submitting',
      });

      cplServerApi.submitCompatibilityReport(
        pluginTitle,
        {
          twVersionMin,
          twVersionMax,
          conflictingPlugins,
          description: description.trim(),
        },
        (error, _data) => {
          if (error) {
            tw.wiki.addTiddler({
              title: `$:/temp/CPL-Server/compatibility-status/${pluginTitle}`,
              text: `error: ${error || 'Failed to submit report'}`,
            });
            return;
          }
          tw.wiki.addTiddler({
            title: `$:/temp/CPL-Server/compatibility-status/${pluginTitle}`,
            text: 'success',
          });
          tw.wiki.deleteTiddler(
            `$:/temp/CPL-Server/compatibility-draft/${pluginTitle}`,
          );
          requestPluginActivityRefresh(pluginTitle);
        },
      );
      return undefined;
    },
  );

  tw.rootWidget.addEventListener(
    'cpl-moderate-comment',
    (event: RootWidgetEvent): undefined => {
      const pluginTitle = getEventParam(event, 'pluginTitle');
      const commentId = getEventParam(event, 'commentId');
      const status = getEventParam(event, 'status');
      if (!pluginTitle || !commentId || !status) {
        console.error('[CPL-Server] Missing params for comment moderation');
        return undefined;
      }
      cplServerApi.moderateComment(pluginTitle, commentId, status, error => {
        if (error) {
          console.error('[CPL-Server] Comment moderation error:', error);
          return;
        }
        requestPluginActivityRefresh(pluginTitle);
        requestCommentsCenterRefresh(pluginTitle);
      });
      return undefined;
    },
  );

  tw.rootWidget.addEventListener(
    'cpl-moderate-compatibility',
    (event: RootWidgetEvent): undefined => {
      const pluginTitle = getEventParam(event, 'pluginTitle');
      const reportId = getEventParam(event, 'reportId');
      const status = getEventParam(event, 'status');
      if (!pluginTitle || !reportId || !status) {
        console.error(
          '[CPL-Server] Missing params for compatibility moderation',
        );
        return undefined;
      }
      cplServerApi.moderateCompatibilityReport(
        pluginTitle,
        reportId,
        status,
        error => {
          if (error) {
            console.error(
              '[CPL-Server] Compatibility moderation error:',
              error,
            );
            return;
          }
          requestPluginActivityRefresh(pluginTitle);
        },
      );
      return undefined;
    },
  );

  console.log('[CPL-Server] API Client initialized');
};
