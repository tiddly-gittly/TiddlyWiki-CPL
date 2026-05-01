import * as fs from 'fs';
import * as path from 'path';

import { Config } from '../config';
import { escapeRegExp, sanitizePluginFileName } from '../files';
import { getRuntimeState } from '../runtime-state';
import type { CommentFile, CommentRecord, CommentStatus, PendingCommentRecord } from '../types';

const runtimeState = getRuntimeState().commentStore;
const COMMENTS_DIR = Config.commentsDir;

const ensureCommentsDir = (): void => {
  if (!fs.existsSync(COMMENTS_DIR)) {
    fs.mkdirSync(COMMENTS_DIR, { recursive: true });
  }
};

const getCommentsFilePath = (pluginTitle: string): string =>
  path.join(
    COMMENTS_DIR,
    `${sanitizePluginFileName(pluginTitle)}${Config.getServerSuffix()}.json`,
  );

const getAllCommentsFiles = (pluginTitle: string): string[] => {
  if (!fs.existsSync(COMMENTS_DIR)) {
    return [];
  }

  const safeName = escapeRegExp(sanitizePluginFileName(pluginTitle));
  const pattern = new RegExp(`^${safeName}(\\.[^.]+)?\\.json$`);

  return fs
    .readdirSync(COMMENTS_DIR)
    .filter(fileName => pattern.test(fileName))
    .map(fileName => path.join(COMMENTS_DIR, fileName));
};

const loadCommentsFromDisk = (pluginTitle: string): CommentFile => {
  const filePath = getCommentsFilePath(pluginTitle);

  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CommentFile;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[CPL-Server] Error reading comments for ${pluginTitle}:`,
      message,
    );
  }

  return {
    pluginTitle,
    comments: [],
  };
};

const aggregateComments = (pluginTitle: string): CommentRecord[] => {
  const seenIds = new Set<string>();
  const comments: CommentRecord[] = [];

  getAllCommentsFiles(pluginTitle).forEach(filePath => {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CommentFile;
      data.comments?.forEach(comment => {
        if (!seenIds.has(comment.id)) {
          seenIds.add(comment.id);
          comments.push(comment);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[CPL-Server] Error reading ${filePath}:`, message);
    }
  });

  comments.sort((left, right) => {
    return (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  });

  return comments;
};

const ensureLoaded = (pluginTitle: string): void => {
  const existing = runtimeState.commentsCache[pluginTitle];
  if (existing?.loaded) {
    return;
  }

  runtimeState.commentsCache[pluginTitle] = {
    ...loadCommentsFromDisk(pluginTitle),
    loaded: true,
  };
};

const updateLoadedCacheForCurrentServer = (
  pluginTitle: string,
  data: CommentFile,
  filePath: string,
): void => {
  if (
    filePath === getCommentsFilePath(pluginTitle)
    && runtimeState.commentsCache[pluginTitle]?.loaded
  ) {
    runtimeState.commentsCache[pluginTitle] = {
      ...data,
      loaded: true,
    };
  }
};

const flushSync = (pluginTitle: string): void => {
  try {
    ensureCommentsDir();
    const data = runtimeState.commentsCache[pluginTitle];
    if (!data) {
      return;
    }

    const persistData: CommentFile = {
      pluginTitle: data.pluginTitle,
      comments: data.comments,
    };

    fs.writeFileSync(
      getCommentsFilePath(pluginTitle),
      JSON.stringify(persistData, null, 2),
      'utf-8',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[CPL-Server] Error flushing comments for ${pluginTitle}:`,
      message,
    );
  }
};

const flushAsync = (pluginTitle: string): void => {
  runtimeState.pendingFlushes.add(pluginTitle);

  if (runtimeState.flushTimer) {
    clearTimeout(runtimeState.flushTimer);
  }

  runtimeState.flushTimer = setTimeout(() => {
    runtimeState.pendingFlushes.forEach(title => {
      flushSync(title);
    });
    runtimeState.pendingFlushes.clear();
  }, 3000);
};

const registerProcessHandlers = (): void => {
  if (runtimeState.handlersRegistered) {
    return;
  }

  process.on('exit', () => {
    Object.keys(runtimeState.commentsCache).forEach(flushSync);
  });
  process.on('SIGINT', () => {
    Object.keys(runtimeState.commentsCache).forEach(flushSync);
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    Object.keys(runtimeState.commentsCache).forEach(flushSync);
    process.exit(0);
  });

  runtimeState.handlersRegistered = true;
};

registerProcessHandlers();

export const CommentStore = {
  getComments(pluginTitle: string, status?: CommentStatus | null): CommentRecord[] {
    const comments = aggregateComments(pluginTitle);
    if (!status) {
      return comments;
    }

    return comments.filter(comment => comment.status === status);
  },

  addComment(pluginTitle: string, comment: CommentRecord): CommentRecord {
    ensureLoaded(pluginTitle);

    if (!runtimeState.commentsCache[pluginTitle].comments) {
      runtimeState.commentsCache[pluginTitle].comments = [];
    }

    runtimeState.commentsCache[pluginTitle].comments.push(comment);
    flushAsync(pluginTitle);

    return comment;
  },

  updateCommentStatus(
    pluginTitle: string,
    commentId: string,
    status: Exclude<CommentStatus, 'deleted'>,
  ): CommentRecord | null {
    const currentFilePath = getCommentsFilePath(pluginTitle);

    for (const filePath of getAllCommentsFiles(pluginTitle)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CommentFile;
        const comment = data.comments.find(candidate => candidate.id === commentId);
        if (!comment) {
          continue;
        }

        comment.status = status;
        comment.updatedAt = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        updateLoadedCacheForCurrentServer(pluginTitle, data, currentFilePath === filePath ? currentFilePath : filePath);
        return comment;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[CPL-Server] Error updating comment in ${filePath}:`, message);
      }
    }

    return null;
  },

  deleteComment(pluginTitle: string, commentId: string): boolean {
    const currentFilePath = getCommentsFilePath(pluginTitle);

    for (const filePath of getAllCommentsFiles(pluginTitle)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CommentFile;
        const commentIndex = data.comments.findIndex(
          candidate => candidate.id === commentId,
        );
        if (commentIndex < 0) {
          continue;
        }

        data.comments.splice(commentIndex, 1);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        updateLoadedCacheForCurrentServer(pluginTitle, data, currentFilePath === filePath ? currentFilePath : filePath);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[CPL-Server] Error deleting comment from ${filePath}:`, message);
      }
    }

    return false;
  },

  getPendingComments(): PendingCommentRecord[] {
    if (!fs.existsSync(COMMENTS_DIR)) {
      return [];
    }

    const seenIds = new Set<string>();
    const pending: PendingCommentRecord[] = [];

    fs.readdirSync(COMMENTS_DIR)
      .filter(fileName => fileName.endsWith('.json'))
      .forEach(fileName => {
        const filePath = path.join(COMMENTS_DIR, fileName);

        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CommentFile;
          data.comments?.forEach(comment => {
            if (comment.status !== 'pending' || seenIds.has(comment.id)) {
              return;
            }

            seenIds.add(comment.id);
            pending.push({
              pluginTitle: data.pluginTitle,
              comment,
            });
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[CPL-Server] Error reading ${filePath}:`, message);
        }
      });

    return pending;
  },

  flushAllSync(): void {
    Object.keys(runtimeState.commentsCache).forEach(flushSync);
  },
};