interface RateLimiterRuntimeState {
  downloadLimits: Record<string, Record<string, number>>;
  ratingLimits: Record<string, Record<string, true>>;
  cleanupTimer: NodeJS.Timeout | null;
}

interface CommentRouteRuntimeState {
  limits: Record<string, number[]>;
}

interface CompatibilityRouteRuntimeState {
  limits: Record<string, number[]>;
}

export interface CplServerRuntimeState {
  rateLimiter: RateLimiterRuntimeState;
  commentRoute: CommentRouteRuntimeState;
  compatibilityRoute: CompatibilityRouteRuntimeState;
}

declare module 'tiddlywiki' {
  export interface ITiddlyWiki {
    cplServerState?: CplServerRuntimeState;
  }
}

const createRuntimeState = (): CplServerRuntimeState => ({
  rateLimiter: {
    downloadLimits: {},
    ratingLimits: {},
    cleanupTimer: null,
  },
  commentRoute: {
    limits: {},
  },
  compatibilityRoute: {
    limits: {},
  },
});

export const getRuntimeState = (): CplServerRuntimeState => {
  if (!$tw.cplServerState) {
    $tw.cplServerState = createRuntimeState();
  }
  return $tw.cplServerState;
};
