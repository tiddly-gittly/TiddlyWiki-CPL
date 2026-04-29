import {
  browserRuntime,
  tw,
  type CplMessageData,
  type CplPayload,
  type CplRequest,
  type RequestHandlers,
  type RootWidgetEvent,
} from './types';

export const DEFAULT_REPO_ENTRY = 'https://tiddly-gittly.github.io/TiddlyWiki-CPL/repo';
export const CURRENT_REPO_TITLE = '$:/plugins/Gk0Wk/CPL-Repo/config/current-repo';

let messagerPromise: Promise<CplRequest> | undefined;
let previousEntry: string | undefined;

export const getCurrentRepoEntry = (): string => {
  if (!tw.wiki || typeof tw.wiki.getTiddlerText !== 'function') {
    return DEFAULT_REPO_ENTRY;
  }

  return tw.wiki.getTiddlerText(CURRENT_REPO_TITLE, DEFAULT_REPO_ENTRY);
};

export const getPreviousRepoEntry = (): string | undefined => previousEntry;

export const setPreviousRepoEntry = (entry: string | undefined): void => {
  previousEntry = entry;
};

export const getEventParam = (event: RootWidgetEvent, name: string): string | undefined => {
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

const createMessenger = (entry: string): Promise<CplRequest> =>
  new Promise(resolve => {
    let counter = 0;
    const callbackMap = new Map<number, RequestHandlers>();
    const iframe = tw.utils.domMaker('iframe', {
      document,
      attributes: { src: entry },
      style: { display: 'none' },
    }) as HTMLIFrameElement;

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
          counter += 1;
          resolve((type, payload) =>
            new Promise<string>((resolveRequest, rejectRequest) => {
              const token = counter;
              counter += 1;
              callbackMap.set(token, [resolveRequest, rejectRequest]);
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
      const [resolveRequest, rejectRequest] = handlers;
      if (data.success) {
        resolveRequest(data.payload ?? '');
        return;
      }

      rejectRequest(data.payload);
    };

    window.addEventListener('message', handleMessage);
    document.body.appendChild(iframe);
    browserRuntime.__tiddlywiki_cpl__reset__ = () => {
      delete browserRuntime.__tiddlywiki_cpl__reset__;
      messagerPromise = undefined;
      window.removeEventListener('message', handleMessage);
      iframe.parentNode?.removeChild(iframe);
      callbackMap.forEach(([, rejectRequest]) => {
        rejectRequest();
      });
      callbackMap.clear();
    };
  });

export const resetBridge = (): void => {
  browserRuntime.__tiddlywiki_cpl__reset__?.();
};

export const cpl: CplRequest = (type, payload) => {
  const entry = tw.wiki.getTiddlerText(CURRENT_REPO_TITLE, DEFAULT_REPO_ENTRY);

  if (previousEntry !== entry && browserRuntime.__tiddlywiki_cpl__reset__) {
    browserRuntime.__tiddlywiki_cpl__reset__();
  }

  previousEntry = entry;
  messagerPromise ??= createMessenger(entry);
  return messagerPromise.then(request => request(type, payload));
};