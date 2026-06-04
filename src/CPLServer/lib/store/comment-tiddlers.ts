import * as fs from 'fs';
import * as pathModule from 'path';

import { Config } from '../config';
import type { CommentRecord, PendingCommentRecord } from '../types';

const getCommentTiddlersDir = (): string => Config.commentsTiddlersDir;

const COMMENT_PREFIX = '$:/cpl/comment/';
const TID_FIELD_ORDER = [
  'title',
  'plugin-title',
  'github-id',
  'username',
  'avatar',
  'status',
  'created-at',
  'updated-at',
  'type',
];

const ensureDir = (): void => {
  if (!fs.existsSync(getCommentTiddlersDir())) {
    fs.mkdirSync(getCommentTiddlersDir(), { recursive: true });
  }
};

/**
 * Read all comment tiddlers from disk and return as CommentRecord[].
 */
const readAllCommentTiddlers = (): Array<CommentRecord & { pluginTitle: string }> => {
  if (!fs.existsSync(getCommentTiddlersDir())) {
    return [];
  }

  const seenIds = new Set<string>();
  const results: Array<CommentRecord & { pluginTitle: string }> = [];

  for (const fileName of fs.readdirSync(getCommentTiddlersDir())) {
    if (!fileName.endsWith('.tid')) {
      continue;
    }

    const filePath = pathModule.join(getCommentTiddlersDir(), fileName);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseCommentTiddler(content);
      if (parsed && !seenIds.has(parsed.id)) {
        seenIds.add(parsed.id);
        results.push(parsed);
      }
    } catch {
      // skip unreadable files
    }
  }

  return results;
};

/**
 * Parse a .tid string into a CommentRecord.
 *
 * Expected format:
 * title: $:/cpl/comment/<id>
 * plugin-title: $:/plugins/xxx/yyy
 * github-id: 3746270
 * username: linonetwo
 * avatar: https://...
 * status: pending|approved|rejected|deleted
 * created-at: 2026-06-03T10:22:07.498Z
 * updated-at: 2026-06-03T10:22:07.498Z
 * type: text/vnd.tiddlywiki
 *
 * <content>
 */
const parseCommentTiddler = (
  raw: string,
): (CommentRecord & { pluginTitle: string }) | null => {
  const lines = raw.split(/\r?\n/);
  const fields: Record<string, string> = {};
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line after header fields → body starts next line
    if (trimmed === '' && Object.keys(fields).length > 0) {
      bodyStart = i + 1;
      break;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      continue;
    }

    const key = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    if (key === 'title' || key === 'plugin-title' || key === 'github-id' ||
        key === 'username' || key === 'avatar' || key === 'status' ||
        key === 'created-at' || key === 'updated-at') {
      fields[key] = value;
    }
  }

  if (!fields['title'] || !fields['plugin-title']) {
    return null;
  }

  const content = lines.slice(bodyStart).join('\n').trim();

  return {
    id: fields['title'].startsWith(COMMENT_PREFIX)
      ? fields['title'].slice(COMMENT_PREFIX.length)
      : fields['title'],
    githubId: fields['github-id'] ?? '',
    username: fields['username'] ?? 'Anonymous',
    avatar: fields['avatar'] ?? '',
    content,
    status: (fields['status'] as CommentRecord['status']) || 'pending',
    createdAt: fields['created-at'] ?? new Date().toISOString(),
    updatedAt: fields['updated-at'] ?? new Date().toISOString(),
    pluginTitle: fields['plugin-title'],
  };
};

/**
 * Serialize a CommentRecord to .tid format string.
 */
const serializeCommentTiddler = (
  comment: CommentRecord,
  pluginTitle: string,
): string => {
  const fields: Record<string, string> = {
    'title': `${COMMENT_PREFIX}${comment.id}`,
    'plugin-title': pluginTitle,
    'github-id': comment.githubId,
    'username': comment.username,
    'avatar': comment.avatar || '',
    'status': comment.status,
    'created-at': comment.createdAt,
    'updated-at': comment.updatedAt,
    'type': 'text/vnd.tiddlywiki',
  };

  const header = TID_FIELD_ORDER
    .filter(key => fields[key] !== undefined)
    .map(key => `${key}: ${fields[key]}`)
    .join('\n');

  return `${header}\n\n${comment.content}`;
};

const getTidFilePath = (commentId: string): string =>
  pathModule.join(getCommentTiddlersDir(), `${commentId}${Config.getServerSuffix()}.tid`);

/**
 * Find a comment file by ID, regardless of server suffix.
 * Multi-server deployments write different suffixes on the same logical comment.
 */
const findCommentFile = (commentId: string): string | null => {
  const dir = getCommentTiddlersDir();
  if (!fs.existsSync(dir)) return null;
  for (const fileName of fs.readdirSync(dir)) {
    if (fileName.startsWith(commentId) && fileName.endsWith('.tid')) {
      return pathModule.join(dir, fileName);
    }
  }
  return null;
};

export const CommentTiddlerStore = {
  /**
   * Get comments for a specific plugin, optionally filtered by status.
   */
  getComments(
    pluginTitle: string,
    status?: string | null,
  ): CommentRecord[] {
    const all = readAllCommentTiddlers()
      .filter(c => c.pluginTitle === pluginTitle)
      // exclude deleted
      .filter(c => c.status !== 'deleted');

    if (!status) {
      return all;
    }

    return all.filter(c => c.status === status);
  },

  /**
   * Create a new comment as a .tid file.
   */
  addComment(
    pluginTitle: string,
    comment: CommentRecord,
  ): CommentRecord {
    ensureDir();
    const filePath = getTidFilePath(comment.id);
    const tid = serializeCommentTiddler(comment, pluginTitle);
    fs.writeFileSync(filePath, tid, 'utf-8');
    return comment;
  },

  /**
   * Update a comment's status by rewriting its .tid file.
   */
  updateCommentStatus(
    pluginTitle: string,
    commentId: string,
    status: 'approved' | 'rejected',
  ): CommentRecord | null {
    const filePath = findCommentFile(commentId) ?? getTidFilePath(commentId);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const comment = parseCommentTiddler(raw);
      if (!comment) {
        return null;
      }

      comment.status = status;
      comment.updatedAt = new Date().toISOString();

      const tid = serializeCommentTiddler(comment, pluginTitle);
      fs.writeFileSync(filePath, tid, 'utf-8');
      return comment;
    } catch {
      return null;
    }
  },

  /**
   * Delete a comment by removing its .tid file.
   */
  deleteComment(_pluginTitle: string, commentId: string): boolean {
    const filePath = findCommentFile(commentId);
    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get all pending comments across all plugins.
   */
  getPendingComments(): PendingCommentRecord[] {
    return readAllCommentTiddlers()
      .filter(c => c.status === 'pending')
      .map(c => ({
        pluginTitle: c.pluginTitle,
        comment: {
          id: c.id,
          githubId: c.githubId,
          username: c.username,
          avatar: c.avatar,
          content: c.content,
          status: c.status,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        },
      }));
  },

  /**
   * Get all recent comments across all plugins.
   * Admins see all non-deleted; regular users only see approved.
   */
  getAllComments(isAdmin: boolean): Array<CommentRecord & { pluginTitle: string }> {
    const all = readAllCommentTiddlers()
      .filter(c => c.status !== 'deleted');

    if (!isAdmin) {
      return all.filter(c => c.status === 'approved');
    }

    return all.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  },
};
