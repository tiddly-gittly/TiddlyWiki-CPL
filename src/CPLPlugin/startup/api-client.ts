import { tw, type RootWidgetEvent, type OAuthResponse } from './api-client/types';
import { MIRROR_CONFIG_TITLE } from './api-client/constants';
import { getEventParam, getViewedPluginTitle } from './api-client/utilities';
import { setJwtToken } from './api-client/auth';
import { createCplServerApi } from './api-client/api';
import { fetchPluginStats, fetchPluginChangelog, fetchPluginComments } from './api-client/data-fetch';
import { refreshMirrorCapabilityState } from './api-client/server-status';

export const name = 'cpl-server-api-client';
export const platforms = ['browser'];
export const after = ['startup'];
export const synchronous = true;

const cplServerApi = createCplServerApi();

export const startup = (): void => {
  tw.cpl = cplServerApi;
  tw.cplServerAPI = tw.cpl;
  refreshMirrorCapabilityState(cplServerApi);

  tw.wiki.addEventListener('change', changes => {
    if ($tw.utils.hop(changes, MIRROR_CONFIG_TITLE)) {
      refreshMirrorCapabilityState(cplServerApi);
    }

    const pluginTitle = getViewedPluginTitle();
    if (!pluginTitle) {
      return;
    }

    fetchPluginStats(cplServerApi, pluginTitle);
    fetchPluginChangelog(cplServerApi, pluginTitle);
    fetchPluginComments(cplServerApi, pluginTitle);
  });

  tw.rootWidget.addEventListener('cpl-fetch-stats', (event: RootWidgetEvent): undefined => {
    const pluginTitle = getEventParam(event, 'pluginTitle');
    if (pluginTitle) {
      fetchPluginStats(cplServerApi, pluginTitle);
    }
    return undefined;
  });

  tw.rootWidget.addEventListener('cpl-fetch-changelog', (event: RootWidgetEvent): undefined => {
    const pluginTitle = getEventParam(event, 'pluginTitle');
    if (pluginTitle) {
      fetchPluginChangelog(cplServerApi, pluginTitle);
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

      fetchPluginStats(cplServerApi, pluginTitle);
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
      fetchPluginComments(cplServerApi, pluginTitle);
    });
    return undefined;
  });

  tw.rootWidget.addEventListener('cpl-fetch-comments', (event: RootWidgetEvent): undefined => {
    const pluginTitle = getEventParam(event, 'pluginTitle');
    if (pluginTitle) {
      fetchPluginComments(cplServerApi, pluginTitle);
    }
    return undefined;
  });

  console.log('[CPL-Server] API Client initialized');
};