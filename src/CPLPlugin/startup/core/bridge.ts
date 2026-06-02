import {
  MIRROR_STATIC_REPOS_TITLE,
  MIRROR_SERVER_REPOS_TITLE,
} from '../api-client/constants';
import { fetchStaticRepoFile, formatPluginTitle } from './static-mirror-fetch';
import {
  browserRuntime,
  tw,
  type CplPayload,
  type CplMessageData,
  type CplRequest,
  type RequestHandlers,
  type RootWidgetEvent,
} from './types';

export const DEFAULT_REPO_ENTRY =
  'https://tiddly-gittly.github.io/TiddlyWiki-CPL/repo';
export const CURRENT_REPO_TITLE =
  '$:/plugins/Gk0Wk/CPL-Repo/config/current-repo';

const BRIDGE_READY_TIMEOUT = 8_000;
const BRIDGE_REQUEST_TIMEOUT = 30_000;
const SERVER_REPO_PATH = '/repo';

let messagerPromise: Promise<CplRequest> | undefined;
let previousEntry: string | undefined;

export const getCurrentRepoEntry = (): string => {
  if (!tw.wiki || typeof tw.wiki.getTiddlerText !== 'function') {
    return DEFAULT_REPO_ENTRY;
  }

  return tw.wiki.getTiddlerText(CURRENT_REPO_TITLE, DEFAULT_REPO_ENTRY);
};

export const getEventParam = (
  event: RootWidgetEvent,
  name: string,
): string | undefined => {
  const value = event.paramObject?.[name];
  return typeof value === 'string' ? value : undefined;
};

export const getFieldString = (
  fields: Record<string, unknown>,
  name: string,
): string | undefined => {
  const value = fields[name];
  return typeof value === 'string' ? value : undefined;
};

const normalizeRepoEntry = (entry: string): string => {
  try {
    return new URL(entry, window.location.origin).toString().replace(/\/$/, '');
  } catch {
    return entry.trim().replace(/\/$/, '');
  }
};

const normalizeServerMirrorEntry = (entry: string): string => {
  const normalizedEntry = normalizeRepoEntry(entry);
  try {
    const url = new URL(normalizedEntry, window.location.origin);
    const pathname = url.pathname.replace(/\/$/, '');
    if (pathname.endsWith(SERVER_REPO_PATH)) {
      url.pathname = pathname.slice(0, -SERVER_REPO_PATH.length) || '/';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return normalizedEntry.replace(/\/repo$/, '');
  }
};

const normalizeServerRepoBase = (entry: string): string => {
  const normalizedEntry = normalizeRepoEntry(entry);
  try {
    const url = new URL(normalizedEntry, window.location.origin);
    const pathname = url.pathname.replace(/\/$/, '');
    if (!pathname.endsWith(SERVER_REPO_PATH)) {
      url.pathname = `${pathname}${SERVER_REPO_PATH}`.replace(/\/+/g, '/');
    }
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return normalizedEntry.endsWith(SERVER_REPO_PATH)
      ? normalizedEntry
      : `${normalizedEntry}${SERVER_REPO_PATH}`;
  }
};

const getConfiguredRepoEntries = (
  title: string,
  normalizer = normalizeRepoEntry,
): Set<string> =>
  new Set(
    tw.utils
      .parseStringArray(tw.wiki.getTiddlerText(title, ''))
      .map(normalizer),
  );

const getCurrentRepoType = (entry: string): 'static' | 'server' | 'unknown' => {
  const normalizedEntry = normalizeRepoEntry(entry);
  if (getConfiguredRepoEntries(MIRROR_STATIC_REPOS_TITLE).has(normalizedEntry)) {
    return 'static';
  }

  if (
    getConfiguredRepoEntries(
      MIRROR_SERVER_REPOS_TITLE,
      normalizeServerMirrorEntry,
    ).has(normalizeServerMirrorEntry(entry))
  ) {
    return 'server';
  }

  return 'unknown';
};

/**
 * For server-type mirrors, try fetching index.json directly as a fallback
 * when the iframe postMessage bridge is not available. This allows server
 * mirrors that also serve static files (like cpl.tidgi.fun/repo) to work
 * without the iframe bridge.
 */
const requestServerFallback = async (
  entry: string,
  type: string,
  payload?: CplPayload,
): Promise<string> => {
  const base = normalizeServerRepoBase(entry);
  switch (type) {
    case 'Index':
      return fetchStaticRepoFile(base, 'index.json');
    case 'Update':
      return fetchStaticRepoFile(base, 'update.json');
    case 'Query': {
      const plugin = typeof payload?.plugin === 'string' ? payload.plugin : '';
      return fetchStaticRepoFile(
        base,
        `${formatPluginTitle(plugin)}/__meta__.json`,
      );
    }
    case 'Install': {
      const plugin = typeof payload?.plugin === 'string' ? payload.plugin : '';
      const version =
        typeof payload?.version === 'string' ? payload.version : 'latest';
      return fetchStaticRepoFile(
        base,
        `${formatPluginTitle(plugin)}/${version}.json`,
      );
    }
    default:
      throw new Error(`Unsupported server fallback request: ${type}`);
  }
};

const requestStaticMirror = (
  entry: string,
  type: string,
  payload?: CplPayload,
): Promise<string> => {
  switch (type) {
    case 'Index':
      return fetchStaticRepoFile(entry, 'index.json');
    case 'Update':
      return fetchStaticRepoFile(entry, 'update.json');
    case 'Query': {
      const plugin = typeof payload?.plugin === 'string' ? payload.plugin : '';
      return fetchStaticRepoFile(
        entry,
        `${formatPluginTitle(plugin)}/__meta__.json`,
      );
    }
    case 'Install': {
      const plugin = typeof payload?.plugin === 'string' ? payload.plugin : '';
      const version =
        typeof payload?.version === 'string' ? payload.version : 'latest';
      return fetchStaticRepoFile(
        entry,
        `${formatPluginTitle(plugin)}/${version}.json`,
      );
    }
    default:
      return Promise.reject(
        new Error(`Unsupported static mirror request: ${type}`),
      );
  }
};

const createMessenger = (entry: string): Promise<CplRequest> =>
  new Promise((resolve, reject) => {
    let counter = 0;
    let readyTimeout: ReturnType<typeof setTimeout> | undefined;
    const callbackMap = new Map<number, RequestHandlers>();
    const iframe = tw.utils.domMaker('iframe', {
      document,
      attributes: { src: entry },
      style: { display: 'none' },
    });

    const handleMessage = (event: MessageEvent<CplMessageData>): void => {
      if (!iframe.contentWindow || event.source !== iframe.contentWindow) {
        return;
      }

      const { data } = event;
      if (data.target !== 'tiddlywiki-cpl' || data.token === undefined) {
        return;
      }

      if (data.type === 'Ready') {
        if (counter === 0) {
          if (readyTimeout !== undefined) {
            clearTimeout(readyTimeout);
            readyTimeout = undefined;
          }
          counter += 1;
          resolve(
            (type, payload) =>
              new Promise<string>((resolveRequest, rejectRequest) => {
                const token = counter;
                counter += 1;
                const requestTimeout = setTimeout(() => {
                  callbackMap.delete(token);
                  rejectRequest(new Error(`CPL mirror request timed out: ${type}`));
                }, BRIDGE_REQUEST_TIMEOUT);
                callbackMap.set(token, [
                  resolveRequest,
                  rejectRequest,
                  () => clearTimeout(requestTimeout),
                ]);
                iframe.contentWindow?.postMessage(
                  {
                    ...(payload ?? {}),
                    type,
                    token,
                    target: 'tiddlywiki-cpl',
                  },
                  '*',
                );
              }),
          );
        }
        return;
      }

      const handlers = callbackMap.get(data.token);
      if (!handlers) {
        return;
      }

      callbackMap.delete(data.token);
      const [resolveRequest, rejectRequest, clearRequestTimeout] = handlers;
      clearRequestTimeout();
      if (data.success) {
        resolveRequest(data.payload ?? '');
        return;
      }

      rejectRequest(data.payload);
    };

    window.addEventListener('message', handleMessage);
    document.body.appendChild(iframe);
    readyTimeout = setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      iframe.parentNode?.removeChild(iframe);
      messagerPromise = undefined;
      reject(new Error(`CPL mirror did not become ready: ${entry}`));
    }, BRIDGE_READY_TIMEOUT);
    browserRuntime.__tiddlywiki_cpl__reset__ = () => {
      delete browserRuntime.__tiddlywiki_cpl__reset__;
      messagerPromise = undefined;
      if (readyTimeout !== undefined) {
        clearTimeout(readyTimeout);
        readyTimeout = undefined;
      }
      window.removeEventListener('message', handleMessage);
      iframe.parentNode?.removeChild(iframe);
      callbackMap.forEach(([, rejectRequest, clearRequestTimeout]) => {
        clearRequestTimeout();
        rejectRequest();
      });
      callbackMap.clear();
    };
  });

export const cpl: CplRequest = (type, payload) => {
  const entry = tw.wiki.getTiddlerText(CURRENT_REPO_TITLE, DEFAULT_REPO_ENTRY);
  const repoType = getCurrentRepoType(entry);

  if (repoType === 'static') {
    return requestStaticMirror(entry, type, payload);
  }

  // For server/unknown mirrors, try the iframe bridge first; if it fails,
  // fall back to direct file fetch (many server mirrors also serve static files).
  if (previousEntry !== entry && browserRuntime.__tiddlywiki_cpl__reset__) {
    browserRuntime.__tiddlywiki_cpl__reset__();
  }

  previousEntry = entry;
  messagerPromise ??= createMessenger(entry).catch((bridgeError) => {
    console.warn(
      `CPL iframe bridge failed for ${entry}, trying direct fetch: ${bridgeError}`,
    );
    // Fall back to direct HTTP fetch of static files.
    const fallback: CplRequest = (type: string, payload?: CplPayload) =>
      repoType === 'server'
        ? requestServerFallback(entry, type, payload)
        : requestStaticMirror(entry, type, payload);
    return fallback;
  });
  return messagerPromise.then(request => request(type, payload));
};
