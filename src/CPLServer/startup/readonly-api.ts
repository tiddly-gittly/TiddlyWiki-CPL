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
  headers?: Record<string, string | string[] | undefined>;
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
    const req = request as RouteRequestLike;

    // Fix CORS for credentialed requests.
    // The CPL browser client uses fetch({credentials:'include'}) which
    // cannot work with Access-Control-Allow-Origin:*. Echo the request's
    // Origin header back on the response instead.
    const origin =
      typeof req.headers?.['origin'] === 'string'
        ? (req.headers['origin'] as string)
        : null;
    if (origin) {
      const res = response as { writeHead: (...args: unknown[]) => void };
      const origWriteHead = res.writeHead.bind(res);
      res.writeHead = function (...args: unknown[]): void {
        // Headers are passed as the second argument (object form).
        if (args.length >= 2 && typeof args[1] === 'object' && args[1] !== null) {
          const headers = args[1] as Record<string, string>;
          if (headers['Access-Control-Allow-Origin'] === '*') {
            headers['Access-Control-Allow-Origin'] = origin;
            headers['Access-Control-Allow-Credentials'] = 'true';
          }
        }
        return origWriteHead(...args);
      };
    }

    if (
      shouldUseReaderAuthorizationForCplApi(req, this)
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
