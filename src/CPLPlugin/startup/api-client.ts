import { tw, type RootWidgetEvent } from './api-client/types';
import {
  ALL_PLUGIN_STATS_REFRESH_TITLE,
  COMMENTS_CENTER_REFRESH_TITLE,
  LEGACY_MIRROR_CONFIG_TITLE,
  LEGACY_SERVER_CONFIG_TITLE,
  MIRROR_CONFIG_TITLE,
  PLUGIN_ACTIVITY_REFRESH_TITLE,
  SERVER_CONFIG_TITLE,
} from './api-client/constants';
import { getEventParam } from './api-client/utilities';
import { createCplServerApi } from './api-client/api';
import { refreshMirrorCapabilityState, setupStatusSync } from './api-client/server-status';
import { setupCommentJsonProcessor } from './api-client/comment-processor';
import { handleGithubLogin, handleOAuthCallback } from './api-client/oauth';
import { startBuildStatusPolling, pollBuildStatus } from './build-status-poll';

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
  setupStatusSync(cplServerApi);
  refreshMirrorCapabilityState(cplServerApi);

  // Start polling build status for the badge widget
  startBuildStatusPolling();

  // Process comment JSON into individual tiddlers for safe filter iteration
  setupCommentJsonProcessor();

  // Mirror config change → refresh API availability (rare, keep as simple JS listener)
  tw.wiki.addEventListener('change', changes => {
    if (
      $tw.utils.hop(changes, MIRROR_CONFIG_TITLE) ||
      $tw.utils.hop(changes, LEGACY_MIRROR_CONFIG_TITLE) ||
      $tw.utils.hop(changes, SERVER_CONFIG_TITLE) ||
      $tw.utils.hop(changes, LEGACY_SERVER_CONFIG_TITLE)
    ) {
      refreshMirrorCapabilityState(cplServerApi);
      // Re-poll build status so the badge clears when switching to a static mirror
      pollBuildStatus();
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

  tw.rootWidget.addEventListener('cpl-github-login', (): undefined => {
    handleGithubLogin();
    return undefined;
  });
  handleOAuthCallback();

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
