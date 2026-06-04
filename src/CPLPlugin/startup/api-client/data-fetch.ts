import { tw, type CPLServerApi } from './types';

export const fetchPluginStats = (
  cplServerApi: CPLServerApi,
  pluginTitle: string,
): void => {
  if (!pluginTitle) {
    return;
  }

  const tempTitle = `$:/temp/CPL-Server/plugin-stats/${pluginTitle}`;
  cplServerApi.getStats(pluginTitle, (error, data) => {
    if (error || !data) {
      console.error(
        '[CPL-Server] Failed to fetch stats for',
        pluginTitle,
        error,
      );
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

export const fetchPluginChangelog = (
  cplServerApi: CPLServerApi,
  pluginTitle: string,
): void => {
  if (!pluginTitle) {
    return;
  }

  const tempTitle = `$:/temp/CPL-Server/plugin-changelog/${pluginTitle}`;
  cplServerApi.getChangelog(pluginTitle, (error, data) => {
    if (error || !data) {
      console.warn(
        '[CPL-Server] Failed to fetch changelog for',
        pluginTitle,
        error,
      );
      tw.wiki.addTiddler({
        title: tempTitle,
        text: JSON.stringify({
          plugintitle: pluginTitle,
          hasChangelog: false,
          changelog: null,
          message: error || 'No changelog available',
        }),
        type: 'application/json',
        'plugin-title': pluginTitle,
        timestamp: String(Date.now()),
      });
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

export const fetchPluginComments = (
  cplServerApi: CPLServerApi,
  pluginTitle: string,
): void => {
  if (!pluginTitle) {
    return;
  }

  const tempTitle = `$:/temp/CPL-Server/comments/${pluginTitle}`;
  cplServerApi.getComments(pluginTitle, (error, data) => {
    if (error || !data) {
      console.error(
        '[CPL-Server] Failed to fetch comments for',
        pluginTitle,
        error,
      );
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

export const fetchPluginCompatibility = (
  cplServerApi: CPLServerApi,
  pluginTitle: string,
): void => {
  if (!pluginTitle) {
    return;
  }

  const tempTitle = `$:/temp/CPL-Server/compatibility/${pluginTitle}`;
  cplServerApi.getCompatibilityReports(pluginTitle, (error, data) => {
    if (error || !data) {
      console.warn(
        '[CPL-Server] Failed to fetch compatibility reports for',
        pluginTitle,
        error,
      );
      tw.wiki.addTiddler({
        title: tempTitle,
        text: JSON.stringify({
          success: false,
          pluginTitle,
          reports: [],
          message: error || 'No compatibility reports available',
        }),
        type: 'application/json',
        'plugin-title': pluginTitle,
        timestamp: String(Date.now()),
      });
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

export const fetchAllRecentComments = (
  cplServerApi: CPLServerApi,
): void => {
  cplServerApi.getAllRecentComments((error, data) => {
    if (error || !data) {
      console.warn('[CPL-Server] Failed to fetch all recent comments:', error);
      return;
    }
    tw.wiki.addTiddler({
      title: '$:/temp/CPL-Server/all-recent-comments',
      text: JSON.stringify(data),
      type: 'application/json',
    });
  });
};

export const fetchPendingComments = (
  cplServerApi: CPLServerApi,
): void => {
  cplServerApi.getPendingComments((error, data) => {
    if (error || !data) {
      console.warn('[CPL-Server] Failed to fetch pending comments:', error);
      return;
    }
    tw.wiki.addTiddler({
      title: '$:/temp/CPL-Server/pending-comments',
      text: JSON.stringify(data),
      type: 'application/json',
    });
  });
};
