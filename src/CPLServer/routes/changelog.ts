import { decodeRouteParam, sendInternalError, sendJson } from '../lib/http';
import type { RouteHandler } from '../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/api\/changelog\/(.+)$/;

export const handler: RouteHandler = (_request, _response, context) => {
  try {
    const pluginTitle = decodeRouteParam(context.params[0]);
    const changelogTitles = [
      `${pluginTitle}/changelog`,
      `${pluginTitle}/ChangeLog`,
      `${pluginTitle}/CHANGELOG`,
      `${pluginTitle}/history`,
      `${pluginTitle}/History`,
      `${pluginTitle}/HISTORY`,
    ];

    let changelogContent: string | null = null;
    let changelogTitle: string | null = null;
    let modified: string | null = null;

    for (const candidateTitle of changelogTitles) {
      const tiddler = context.wiki.getTiddler(candidateTitle);
      if (!tiddler) {
        continue;
      }

      changelogContent = tiddler.fields.text;
      changelogTitle = tiddler.fields.title;
      modified = tiddler.fields.modified
        ? String(tiddler.fields.modified)
        : null;
      break;
    }

    if (!changelogContent) {
      const pluginTiddler = context.wiki.getTiddler(pluginTitle);
      if (typeof pluginTiddler?.fields.changelog === 'string') {
        changelogContent = pluginTiddler.fields.changelog;
      }
    }

    if (changelogContent) {
      sendJson(
        context,
        200,
        {
          plugintitle: pluginTitle,
          hasChangelog: true,
          changelog: changelogContent,
          tiddlertitle: changelogTitle,
          modified,
        },
        {
          'Cache-Control': 'public, max-age=3600',
        },
      );
      return;
    }

    sendJson(context, 404, {
      plugintitle: pluginTitle,
      hasChangelog: false,
      changelog: null,
      message: 'No changelog found for this plugin',
    });
  } catch (error) {
    sendInternalError(context, 'changelog handler', error);
  }
};