import * as crypto from 'crypto';

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

// ETag based on server startup time — changes on restart, stable otherwise.
// This allows browsers to get 304 on refresh instead of re-downloading ~12MB.
const homepageEtag = `"${Date.now().toString(36)}"`;

const normalizeHeaderValue = (
  value: string | string[] | undefined,
): string | null => {
  if (typeof value === 'string' && value) {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0]) {
    return value[0];
  }
  return null;
};

const rewriteCorsHeaders = (
  headers: Record<string, unknown>,
  origin: string,
): void => {
  const allowOriginKey =
    Object.keys(headers).find(
      key => key.toLowerCase() === 'access-control-allow-origin',
    ) ?? 'Access-Control-Allow-Origin';

  if (headers[allowOriginKey] !== '*') {
    return;
  }

  headers[allowOriginKey] = origin;
  headers['Access-Control-Allow-Credentials'] = 'true';
  headers.Vary = headers.Vary ? `${String(headers.Vary)}, Origin` : 'Origin';
};

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

    // ── ETag support for homepage ─────────────────────────────────
    // TW doesn't send ETag/Last-Modified, so browser refresh always
    // re-downloads the ~12MB homepage. We intercept the response to
    // add ETag and handle If-None-Match → 304.
    const url = req.url ?? '/';
    const pathname = url.split('?')[0].split('#')[0];
    const isHomepage = pathname === '/' || pathname === '';

    if (isHomepage && req.method === 'GET') {
      const reqHeaders = req.headers as Record<string, string | string[] | undefined>;
      const ifNoneMatch = normalizeHeaderValue(reqHeaders['if-none-match']);
      if (ifNoneMatch === homepageEtag) {
        const res = response as { writeHead: (...a: unknown[]) => unknown; end: (...a: unknown[]) => unknown };
        res.writeHead(304, { ETag: homepageEtag, 'Cache-Control': 'public, max-age=300' });
        res.end();
        return;
      }

      // Add ETag to the response so browser can revalidate on next request
      const resForEtag = response as { end: (...a: unknown[]) => unknown };
      const origEnd = resForEtag.end.bind(resForEtag);
      resForEtag.end = function (...args: unknown[]): unknown {
        // Inject ETag header before the response is sent
        try {
          (resForEtag as unknown as { setHeader: (n: string, v: string) => void }).setHeader('ETag', homepageEtag);
        } catch { /* header already sent */ }
        return origEnd(...args);
      };
    }

    // Fix CORS for credentialed requests.
    // The CPL browser client uses fetch({credentials:'include'}) which
    // cannot work with Access-Control-Allow-Origin:*. Echo the request's
    // Origin header back on the response instead.
    const origin = normalizeHeaderValue(req.headers?.origin);
    if (origin) {
      const resForCors = response as {
        writeHead: (...args: unknown[]) => unknown;
      };
      const origWriteHead = resForCors.writeHead.bind(resForCors);
      resForCors.writeHead = function (...args: unknown[]): unknown {
        const maybeHeaders =
          typeof args[1] === 'object' && args[1] !== null
            ? args[1]
            : typeof args[2] === 'object' && args[2] !== null
            ? args[2]
            : null;

        if (maybeHeaders) {
          rewriteCorsHeaders(maybeHeaders as Record<string, unknown>, origin);
        }
        return origWriteHead(...args);
      };
    }

    if (shouldUseReaderAuthorizationForCplApi(req, this)) {
      return originalRequestHandler.call(this, request, response, {
        ...options,
        authorizationType: 'readers',
      });
    }

    return originalRequestHandler.call(this, request, response, options);
  };

  prototype.cplApiReadonlyPatchApplied = true;
};
