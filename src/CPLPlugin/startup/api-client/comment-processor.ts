/**
 * Comment JSON → TW tiddler pre-processor.
 *
 * TW5.4.0's filter parser cannot handle JSON text containing `[`, `]`, `{`, `}`
 * characters as filter operands — the brackets are misinterpreted as filter syntax.
 *
 * This module works around the limitation by parsing comment JSON in JavaScript
 * and creating individual tiddlers for each comment item. The wikitext can then
 * iterate over the tiddler list using standard TW list syntax (title references),
 * avoiding the need to pass JSON through filter expressions.
 *
 * Creates:
 *   $:/temp/CPL-Server/comment-items/<prefix>/list   — newline-separated tiddler titles
 *   $:/temp/CPL-Server/comment-items/<prefix>/<index> — one tiddler per comment with fields
 */

import { tw } from './types';

interface CommentItem {
  pluginTitle?: string;
  id?: string;
  username?: string;
  content?: string;
  createdAt?: string;
  avatar?: string;
  status?: string;
  comment?: CommentItem;
}

type CommentPrefix = string;

const extractField = (item: CommentItem, field: keyof CommentItem): string => {
  if (typeof item.comment === 'object' && item.comment !== null) {
    return String(item.comment[field] ?? '');
  }
  return String(item[field] ?? '');
};

const processCommentsToTiddlers = (
  jsonText: string | undefined,
  prefix: CommentPrefix,
): void => {
  const listTitle = `$:/temp/CPL-Server/comment-items/${prefix}/list`;
  const itemPrefix = `$:/temp/CPL-Server/comment-items/${prefix}`;

  // Clear old items
  const oldList = tw.wiki.getTiddlerText(listTitle, '');
  if (oldList) {
    for (const title of oldList.split('\n').filter(Boolean)) {
      tw.wiki.deleteTiddler(title);
    }
  }

  if (!jsonText) {
    tw.wiki.addTiddler({ title: listTitle, text: '' });
    return;
  }

  try {
    const data = JSON.parse(jsonText) as { comments?: CommentItem[] };
    if (!data.comments || !Array.isArray(data.comments)) {
      tw.wiki.addTiddler({ title: listTitle, text: '' });
      return;
    }

    const titles: string[] = [];
    data.comments.forEach((item: CommentItem, index: number) => {
      const tiddlerTitle = `${itemPrefix}/${index}`;
      titles.push(tiddlerTitle);
      tw.wiki.addTiddler({
        title: tiddlerTitle,
        pluginTitle: item.pluginTitle ?? '',
        commentId: extractField(item, 'id'),
        username: extractField(item, 'username') || 'Anonymous',
        content: extractField(item, 'content'),
        createdAt: extractField(item, 'createdAt'),
        avatar: extractField(item, 'avatar'),
        status: extractField(item, 'status') || 'approved',
      });
    });
    tw.wiki.addTiddler({ title: listTitle, text: titles.join('\n') });
  } catch {
    tw.wiki.addTiddler({ title: listTitle, text: '' });
  }
};

/**
 * Listen for changes to the raw JSON comment tiddlers and process them
 * into individual tiddlers that the wikitext can safely iterate over.
 */
export const setupCommentJsonProcessor = (): void => {
  const pendingTitle = '$:/temp/CPL-Server/pending-comments';
  const recentTitle = '$:/temp/CPL-Server/all-recent-comments';
  const commentPrefix = '$:/temp/CPL-Server/comments/';

  tw.wiki.addEventListener('change', changes => {
    const changed = changes as Record<string, unknown>;
    if (changed[pendingTitle]) {
      processCommentsToTiddlers(
        tw.wiki.getTiddlerText(pendingTitle),
        'pending',
      );
    }
    if (changed[recentTitle]) {
      processCommentsToTiddlers(tw.wiki.getTiddlerText(recentTitle), 'recent');
    }
    // Handle per-plugin comment tiddlers
    for (const key of Object.keys(changed)) {
      if (
        key.startsWith(commentPrefix) &&
        key !== pendingTitle &&
        key !== recentTitle
      ) {
        const pluginTitle = key.slice(commentPrefix.length);
        processCommentsToTiddlers(
          tw.wiki.getTiddlerText(key),
          `plugin/${pluginTitle}`,
        );
      }
    }
  });
};
