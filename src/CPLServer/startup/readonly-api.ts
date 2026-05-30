type RequestHandler = (
  request: unknown,
  response: unknown,
  options?: Record<string, unknown>,
) => unknown;

interface TiddlyWikiServerPrototype {
  get?: (name: string) => string | undefined;
  requestHandler: RequestHandler;
  cplApiReadonlyPatchApplied?: boolean;
}

interface TiddlyWikiServerModule {
  Server?: {
    prototype: TiddlyWikiServerPrototype;
  };
}

interface RouteRequestLike {
  method?: string;
  url?: string;
}

const CPL_API_PATH_PREFIX = '/cpl/api/';
const CPL_API_WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE']);

export const shouldUseReaderAuthorizationForCplApi = (
  request: RouteRequestLike,
  server: TiddlyWikiServerPrototype,
): boolean => {
  const method = request.method ?? '';
  if (!CPL_API_WRITE_METHODS.has(method)) {
    return false;
  }

  // Manually extract pathname without using URL constructor,
  // as URL may not be available in the TiddlyWiki sandbox environment.
  const url = request.url ?? '/';
  let pathname = url;
  const queryIndex = pathname.indexOf('?');
  if (queryIndex !== -1) {
    pathname = pathname.slice(0, queryIndex);
  }
  const hashIndex = pathname.indexOf('#');
  if (hashIndex !== -1) {
    pathname = pathname.slice(0, hashIndex);
  }

  const pathPrefix = server.get?.('path-prefix') ?? '';
  const routePath =
    pathPrefix && pathname.startsWith(pathPrefix)
      ? pathname.slice(pathPrefix.length) || '/'
      : pathname;

  const result = routePath.startsWith(CPL_API_PATH_PREFIX);
  return result;
};

export const name = 'cpl-server-readonly-api';
export const platforms = ['node'];
export const before = ['commands'];
export const synchronous = true;

export const startup = (): void => {
  // 安全防护：仅在 Node.js 环境下执行
  if (!$tw.node) {
    return;
  }

  const serverModule =
    require('$:/core/modules/server/server.js') as TiddlyWikiServerModule;
  const prototype = serverModule.Server?.prototype;

  if (!prototype || prototype.cplApiReadonlyPatchApplied) {
    return;
  }

  const originalRequestHandler = prototype.requestHandler;
  prototype.requestHandler = function requestHandler(
    this: TiddlyWikiServerPrototype,
    request: unknown,
    response: unknown,
    options?: Record<string, unknown>,
  ): unknown {
    if (
      shouldUseReaderAuthorizationForCplApi(request as RouteRequestLike, this)
    ) {
      return originalRequestHandler.call(this, request, response, {
        ...options,
        authorizationType: 'readers',
      });
    }

    return originalRequestHandler.call(this, request, response, options);
  };

  prototype.cplApiReadonlyPatchApplied = true;
};
