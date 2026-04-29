import { tw, type CPLServerApi } from './types';

export const fetchPluginStats = (cplServerApi: CPLServerApi, pluginTitle: string): void => {
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

export const fetchPluginChangelog = (cplServerApi: CPLServerApi, pluginTitle: string): void => {
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

export const fetchPluginComments = (cplServerApi: CPLServerApi, pluginTitle: string): void => {
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
