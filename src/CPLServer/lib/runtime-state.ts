import type { CommentFile, DownloadStats, RatingStats } from './types';

export interface LoadedCommentFile extends CommentFile {
  loaded: boolean;
}

interface DataStoreRuntimeState {
  statsCache: Record<string, DownloadStats> | null;
  ratingsCache: Record<string, RatingStats> | null;
  flushTimer: NodeJS.Timeout | null;
  pendingFlush: boolean;
  handlersRegistered: boolean;
}

interface CommentStoreRuntimeState {
  commentsCache: Record<string, LoadedCommentFile>;
  flushTimer: NodeJS.Timeout | null;
  pendingFlushes: Set<string>;
  handlersRegistered: boolean;
}

interface RateLimiterRuntimeState {
  downloadLimits: Record<string, Record<string, number>>;
  ratingLimits: Record<string, Record<string, true>>;
  cleanupTimer: NodeJS.Timeout | null;
}

interface CommentRouteRuntimeState {
  limits: Record<string, number[]>;
}

export interface CplServerRuntimeState {
  dataStore: DataStoreRuntimeState;
  commentStore: CommentStoreRuntimeState;
  rateLimiter: RateLimiterRuntimeState;
  commentRoute: CommentRouteRuntimeState;
}

declare global {
  var __TIDDLYWIKI_CPL_SERVER__: CplServerRuntimeState | undefined;
}

export const getRuntimeState = (): CplServerRuntimeState => {
  if (!globalThis.__TIDDLYWIKI_CPL_SERVER__) {
    globalThis.__TIDDLYWIKI_CPL_SERVER__ = {
      dataStore: {
        statsCache: null,
        ratingsCache: null,
        flushTimer: null,
        pendingFlush: false,
        handlersRegistered: false,
      },
      commentStore: {
        commentsCache: {},
        flushTimer: null,
        pendingFlushes: new Set<string>(),
        handlersRegistered: false,
      },
      rateLimiter: {
        downloadLimits: {},
        ratingLimits: {},
        cleanupTimer: null,
      },
      commentRoute: {
        limits: {},
      },
    };
  }

  return globalThis.__TIDDLYWIKI_CPL_SERVER__;
};