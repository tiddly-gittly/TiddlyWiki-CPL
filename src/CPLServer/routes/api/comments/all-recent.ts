import * as fs from 'fs';
import * as pathModule from 'path';

import { Auth } from '../../../lib/auth';
import { Config } from '../../../lib/config';
import { sendInternalError, sendJson } from '../../../lib/http';
import type {
  CommentFile,
  CommentRecord,
  RouteHandler,
} from '../../../lib/types';

export const method = 'GET';
export const path = /^\/cpl\/api\/comments\/all-recent$/;

export const handler: RouteHandler = (request, _response, context) => {
  try {
    const user = Auth.getUserFromRequest(request);
    const isAdmin = Auth.isAdmin(user);

    const commentsDir = Config.commentsDir;
    if (!fs.existsSync(commentsDir)) {
      sendJson(context, 200, { success: true, comments: [] });
      return;
    }

    const seenIds = new Set<string>();
    const allComments: Array<CommentRecord & { pluginTitle: string }> = [];

    fs.readdirSync(commentsDir)
      .filter(fileName => fileName.endsWith('.json'))
      .forEach(fileName => {
        const filePath = pathModule.join(commentsDir, fileName);
        try {
          const data = JSON.parse(
            fs.readFileSync(filePath, 'utf-8'),
          ) as CommentFile;
          data.comments?.forEach(comment => {
            if (seenIds.has(comment.id)) return;

            // Admins see all; regular users only see approved
            if (!isAdmin && comment.status !== 'approved') return;

            seenIds.add(comment.id);
            allComments.push({
              ...comment,
              pluginTitle: data.pluginTitle || '',
            });
          });
        } catch {
          // Skip unreadable files
        }
      });

    // Sort by most recent first
    allComments.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Return at most 200 recent comments for client-side pagination
    sendJson(context, 200, {
      success: true,
      comments: allComments.slice(0, 200),
    });
  } catch (error) {
    sendInternalError(context, 'all-recent-comments handler', error);
  }
};
