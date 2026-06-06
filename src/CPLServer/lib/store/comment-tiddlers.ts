import * as fs from 'fs';
import * as pathModule from 'path';

import { Config } from '../config';
import type { CommentRecord, PendingCommentRecord } from '../types';

const getPendingDir = (): string => Config.commentsPendingDir;
const getApprovedDir = (): string => Config.commentsApprovedDir;
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

const ensureDir = (dir: string): void => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/**
 * Scan a directory for .tid files and parse them into comment records.
 */
const scanDir = (
  dir: string,
): Array<CommentRecord & { pluginTitle: string }> => {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const results: Array<CommentRecord & { pluginTitle: string }> = [];

  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith('.tid')) {
      continue;
    }
    try {
      const content = fs.readFileSync(pathModule.join(dir, fileName), 'utf-8');
      const parsed = parseCommentTiddler(content);
      if (parsed) {
        results.push(parsed);
      }
    } catch {
      /* skip unreadable */
    }
  }

  return results;
};

/**
 * Read all comment tiddlers from both pending/ and approved/ directories.
 * Dedup by id: approved takes priority over pending.
 */
const readAllCommentTiddlers = (): Array<
  CommentRecord & { pluginTitle: string }
> => {
  const pending = scanDir(getPendingDir());
  const approved = scanDir(getApprovedDir());

  const byId = new Map<string, CommentRecord & { pluginTitle: string }>();
  for (const c of pending) {
    byId.set(c.id, c);
  }
  // Approved overwrites pending for same id
  for (const c of approved) {
    byId.set(c.id, c);
  }

  return [...byId.values()].filter(c => c.status !== 'deleted');
};

/**
 * Parse a .tid string into a CommentRecord.
 */
const parseCommentTiddler = (
  raw: string,
): (CommentRecord & { pluginTitle: string }) | null => {
  const lines = raw.split(/\r?\n/);
  const fields: Record<string, string> = {};
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' && Object.keys(fields).length > 0) {
      bodyStart = i + 1;
      break;
    }
    const colonIdx = lines[i].indexOf(':');
    if (colonIdx === -1) {
      continue;
    }
    const key = lines[i].substring(0, colonIdx).trim().toLowerCase();
    const value = lines[i].substring(colonIdx + 1).trim();
    if (
      key === 'title' ||
      key === 'plugin-title' ||
      key === 'github-id' ||
      key === 'username' ||
      key === 'avatar' ||
      key === 'status' ||
      key === 'created-at' ||
      key === 'updated-at'
    ) {
      fields[key] = value;
    }
  }

  if (!fields.title || !fields['plugin-title']) {
    return null;
  }

  const content = lines.slice(bodyStart).join('\n').trim();
  return {
    id: fields.title.startsWith(COMMENT_PREFIX)
      ? fields.title.slice(COMMENT_PREFIX.length)
      : fields.title,
    githubId: fields['github-id'] ?? '',
    username: fields.username ?? 'Anonymous',
    avatar: fields.avatar ?? '',
    content,
    status: (fields.status as CommentRecord['status']) || 'pending',
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
    title: `${COMMENT_PREFIX}${comment.id}`,
    'plugin-title': pluginTitle,
    'github-id': comment.githubId,
    username: comment.username,
    avatar: comment.avatar || '',
    status: comment.status,
    'created-at': comment.createdAt,
    'updated-at': comment.updatedAt,
    type: 'text/vnd.tiddlywiki',
  };
  const header = TID_FIELD_ORDER.filter(key => fields[key] !== undefined)
    .map(key => `${key}: ${fields[key]}`)
    .join('\n');
  return `${header}\n\n${comment.content}`;
};

/**
 * Get the file path for a comment in the given directory.
 */
const getFilePath = (dir: string, commentId: string): string =>
  pathModule.join(dir, `${commentId}${Config.getServerSuffix()}.tid`);

/**
 * Find a comment file by ID across both dirs.
 */
const findCommentFile = (
  commentId: string,
): { dir: string; path: string } | null => {
  for (const dir of [getPendingDir(), getApprovedDir()]) {
    if (!fs.existsSync(dir)) {
      continue;
    }
    for (const fileName of fs.readdirSync(dir)) {
      if (fileName.startsWith(commentId) && fileName.endsWith('.tid')) {
        return { dir, path: pathModule.join(dir, fileName) };
      }
    }
  }
  return null;
};

export const CommentTiddlerStore = {
  getComments(pluginTitle: string, status?: string | null): CommentRecord[] {
    const all = readAllCommentTiddlers()
      .filter(c => c.pluginTitle === pluginTitle)
      .filter(c => c.status !== 'deleted');
    return status ? all.filter(c => c.status === status) : all;
  },

  /**
   * Create a new comment — always goes to pending/.
   */
  addComment(pluginTitle: string, comment: CommentRecord): CommentRecord {
    const dir = getPendingDir();
    ensureDir(dir);
    const filePath = getFilePath(dir, comment.id);
    // New comments always start as pending
    const pendingComment = { ...comment, status: 'pending' as const };
    fs.writeFileSync(
      filePath,
      serializeCommentTiddler(pendingComment, pluginTitle),
      'utf-8',
    );
    return comment;
  },

  /**
   * Update comment status.
   * - approved → move from pending/ to approved/
   * - rejected → remove from pending/
   * - deleted → remove from wherever it is
   */
  updateCommentStatus(
    pluginTitle: string,
    commentId: string,
    status: 'approved' | 'rejected',
  ): CommentRecord | null {
    const found = findCommentFile(commentId);
    if (!found) {
      return null;
    }

    try {
      const raw = fs.readFileSync(found.path, 'utf-8');
      const comment = parseCommentTiddler(raw);
      if (!comment) {
        return null;
      }

      // Verify the comment belongs to the expected plugin to prevent cross-plugin manipulation
      if (comment.pluginTitle !== pluginTitle) {
        return null;
      }

      comment.status = status;
      comment.updatedAt = new Date().toISOString();
      const tid = serializeCommentTiddler(comment, comment.pluginTitle);

      if (status === 'approved') {
        // Move from pending/ to approved/
        const approvedDir = getApprovedDir();
        ensureDir(approvedDir);
        const newPath = getFilePath(approvedDir, commentId);
        fs.writeFileSync(newPath, tid, 'utf-8');
        if (found.dir !== approvedDir) {
          fs.unlinkSync(found.path);
        }
      } else {
        // rejected — just remove from pending/
        fs.unlinkSync(found.path);
      }

      return comment;
    } catch {
      return null;
    }
  },

  /**
   * Delete a comment — remove from whichever dir it's in.
   */
  deleteComment(pluginTitle: string, commentId: string): boolean {
    const found = findCommentFile(commentId);
    if (!found) {
      return false;
    }
    try {
      const raw = fs.readFileSync(found.path, 'utf-8');
      const comment = parseCommentTiddler(raw);
      if (comment && comment.pluginTitle !== pluginTitle) {
        return false;
      }
      fs.unlinkSync(found.path);
      return true;
    } catch {
      return false;
    }
  },

  getPendingComments(): PendingCommentRecord[] {
    return scanDir(getPendingDir())
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

  getAllComments(
    isAdmin: boolean,
  ): Array<CommentRecord & { pluginTitle: string }> {
    const all = readAllCommentTiddlers();
    const filtered = isAdmin ? all : all.filter(c => c.status === 'approved');
    return filtered.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  },
};
