type CplPayload = Record<string, string | number | boolean | undefined>;
type CplRequest = (type: string, payload?: CplPayload) => Promise<string>;
type RequestHandlers = [(value: string) => void, (reason?: unknown) => void];

interface DependencyTree {
  [key: string]: DependencyTree;
}

interface CplMessageData {
  type?: string;
  token?: number;
  target?: string;
  payload?: string;
  success?: boolean;
}

interface PluginInfo {
  title: string;
  author?: string;
  name?: string;
  description?: string;
  tags?: string;
  category?: string;
  versions?: Record<string, string>;
  latest?: string;
  suggestions?: string;
  dependents?: string;
  'parent-plugin'?: string;
  'versions-size'?: Record<string, number | null>;
  [key: string]: unknown;
}

type TwWithLayoutState = typeof $tw & {
  titleWidgetNode?: {
    refresh: (changes: unknown, container: Node | null, nextSibling: unknown) => boolean;
  };
  titleContainer?: HTMLElement | null;
};

const tw = $tw as TwWithLayoutState;

type RootWidgetListener = Parameters<typeof tw.rootWidget.addEventListener>[1];
type RootWidgetEvent = RootWidgetListener extends (
  event: infer EventType,
) => boolean | Promise<void> | undefined
  ? EventType
  : never;

const browserRuntime = globalThis as typeof globalThis & {
  __tiddlywiki_cpl__?: CplRequest;
  __tiddlywiki_cpl__reset__?: () => void;
};

export const name = 'cpl-repo-init';
export const platforms = ['browser'];
export const after = ['render'];
export const synchronous = true;

const DEFAULT_REPO_ENTRY = 'https://tiddly-gittly.github.io/TiddlyWiki-CPL/repo';
const CURRENT_REPO_TITLE = '$:/plugins/Gk0Wk/CPL-Repo/config/current-repo';

let messagerPromise: Promise<CplRequest> | undefined;
let previousEntry: string | undefined;
let installRequestLock = false;
let installLock = false;
let getPluginsIndexLock = false;
let mirrorSwitchInternalChange = false;
let mirrorSwitchPending = false;

const getCurrentRepoEntry = (): string => {
  if (!tw.wiki || typeof tw.wiki.getTiddlerText !== 'function') {
    return DEFAULT_REPO_ENTRY;
  }

  return tw.wiki.getTiddlerText(CURRENT_REPO_TITLE, DEFAULT_REPO_ENTRY);
};

const getEventParam = (event: RootWidgetEvent, name: string): string | undefined => {
  const value = event.paramObject?.[name];
  return typeof value === 'string' ? value : undefined;
};

const getFieldString = (fields: Record<string, unknown>, name: string): string | undefined => {
  const value = fields[name];
  return typeof value === 'string' ? value : undefined;
};

const setMirrorSwitchStatus = (status: string, message: string): void => {
  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Repo/mirror-switch-status',
    text: status || '',
    message: message || '',
    repo: getCurrentRepoEntry(),
    timestamp: String(Date.now()),
  });
};

const clearTempRepoState = (): void => {
  for (const title of tw.wiki.filterTiddlers('[prefix[$:/temp/CPL-Repo/]]')) {
    tw.wiki.deleteTiddler(title);
  }
};

const isMirrorSwitchBlocked = (): boolean =>
  installRequestLock || installLock || getPluginsIndexLock;

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

const cpl: CplRequest = (type, payload) => {
  const entry = tw.wiki.getTiddlerText(CURRENT_REPO_TITLE, DEFAULT_REPO_ENTRY);

  if (previousEntry !== entry && browserRuntime.__tiddlywiki_cpl__reset__) {
    browserRuntime.__tiddlywiki_cpl__reset__();
  }

  previousEntry = entry;
  messagerPromise ??= createMessenger(entry);
  return messagerPromise.then(request => request(type, payload));
};

const getAutoUpdateTime = (): number =>
  Number.parseInt(
    tw.wiki.getTiddlerText(
      '$:/plugins/Gk0Wk/CPL-Repo/config/auto-update-intervals-minutes',
      '-1',
    ),
    10,
  ) || -1;

const triggerMirrorRefresh = (): void => {
  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Repo/plugins-index-refresh-requested',
    text: 'yes',
  });
  tw.rootWidget.dispatchEvent({
    type: 'cpl-get-plugins-index',
    paramObject: {},
    widget: tw.rootWidget,
  });
};

const handleMirrorSwitch = (newEntry: string, oldEntry: string): void => {
  if (newEntry === oldEntry || mirrorSwitchInternalChange) {
    return;
  }

  if (isMirrorSwitchBlocked()) {
    mirrorSwitchInternalChange = true;
    tw.wiki.addTiddler({ title: CURRENT_REPO_TITLE, text: oldEntry });
    mirrorSwitchInternalChange = false;
    setMirrorSwitchStatus('blocked', 'Mirror switching is unavailable while CPL is busy.');
    return;
  }

  mirrorSwitchPending = true;
  clearTempRepoState();
  setMirrorSwitchStatus('switching', 'Switching mirror and reloading plugin data...');
  browserRuntime.__tiddlywiki_cpl__reset__?.();
  previousEntry = newEntry;
  setTimeout(() => {
    triggerMirrorRefresh();
  }, 0);
};

const asPluginInfo = (value: unknown): PluginInfo => value as PluginInfo;
const asPluginInfoList = (value: unknown): PluginInfo[] => value as PluginInfo[];

export const startup = (): void => {
  browserRuntime.__tiddlywiki_cpl__ = cpl;
  previousEntry = getCurrentRepoEntry();
  setMirrorSwitchStatus('ready', '');

  let lastUpdateTime = -1;
  let updateLock = false;
  let autoUpdateInterval: ReturnType<typeof setInterval> | undefined;
  let autoTimeout: ReturnType<typeof setTimeout> | undefined;
  let pluginIndexCache: PluginInfo[] | undefined;
  let allPluginsCache: string[] | undefined;
  let categoryCache: Record<string, string[]> = {};

  const update = (notify?: boolean): void => {
    try {
      if (updateLock) {
        return;
      }

      updateLock = true;
      lastUpdateTime = Date.now();
      tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/updaing', text: 'yes' });

      const updatePromise = cpl('Update');
      const plugins = tw.wiki.filterTiddlers(
        tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/config/update-filter', ''),
      );

      updatePromise
        .then(text => {
          const updatePlugins = JSON.parse(text) as Record<string, [string, string?]>;
          const pluginsToShow = plugins.filter(title => {
            const latestVersion = updatePlugins[title];
            if (!latestVersion) {
              return false;
            }
            if (
              latestVersion[1] &&
              tw.utils.compareVersions(tw.version, latestVersion[1].trim()) < 0
            ) {
              return false;
            }

            const version = tw.wiki.getTiddler(title)?.fields.version;
            return !(
              typeof version === 'string' &&
              latestVersion[0] &&
              tw.utils.compareVersions(version.trim(), latestVersion[0].trim()) >= 0
            );
          });

          if (pluginsToShow.length > 0) {
            tw.wiki.addTiddler({
              title: '$:/temp/CPL-Repo/update-plugins',
              type: 'application/json',
              text: JSON.stringify(pluginsToShow),
            });
            if (notify !== false) {
              const notificationDuration = tw.config.preferences.notificationDuration;
              tw.config.preferences.notificationDuration = 10_000;
              tw.notifier.display('$:/plugins/Gk0Wk/CPL-Repo/notifications/update-notify-template', {
                variables: { updateCount: pluginsToShow.length },
              });
              tw.config.preferences.notificationDuration = notificationDuration;
            }
          }

          tw.wiki.deleteTiddler('$:/temp/CPL-Repo/updaing');
          updateLock = false;
        })
        .catch(error => {
          console.error(error);
          tw.wiki.addTiddler({
            title: '$:/temp/CPL-Repo/updaing',
            text: String(error),
          });
          updateLock = false;
        });
    } catch (error) {
      console.error(error);
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/updaing',
        text: String(error),
      });
      updateLock = false;
    }
  };

  tw.wiki.addEventListener('change', changes => {
    if (tw.utils.hop(changes, CURRENT_REPO_TITLE)) {
      handleMirrorSwitch(getCurrentRepoEntry(), previousEntry ?? getCurrentRepoEntry());
    }

    if (
      tw.utils.hop(changes, '$:/plugins/Gk0Wk/CPL-Repo/config/auto-update-intervals-minutes')
    ) {
      const time = getAutoUpdateTime();
      if (autoUpdateInterval !== undefined) {
        clearInterval(autoUpdateInterval);
      }
      if (autoTimeout !== undefined) {
        clearTimeout(autoTimeout);
      }
      autoUpdateInterval = undefined;
      autoTimeout = undefined;

      if (time > 0) {
        autoTimeout = setTimeout(() => {
          update();
          autoUpdateInterval = setInterval(() => {
            update();
          }, time * 60_000);
        }, lastUpdateTime === -1 ? 0 : time * 60_000 + lastUpdateTime - Date.now());
      }
    }

    if (tw.titleWidgetNode?.refresh(changes, tw.titleContainer ?? null, null)) {
      document.title = tw.titleContainer?.textContent ?? document.title;
    }
  });

  autoTimeout = setTimeout(() => {
    const time = getAutoUpdateTime();
    if (time > 0) {
      update();
      autoUpdateInterval = setInterval(() => {
        update();
      }, time * 60_000);
    }
  }, 3_000);

  const handleInstallPluginRequest = async (event: RootWidgetEvent): Promise<void> => {
    try {
      if (installRequestLock) {
        return;
      }

      const titlesParam = getEventParam(event, 'titles');
      const titleParam = getEventParam(event, 'title');
      const titles = titlesParam
        ? tw.utils.parseStringArray(titlesParam)
        : titleParam
          ? [titleParam]
          : [];
      if (titles.length === 0) {
        return;
      }

      installRequestLock = true;
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/instal-plugin-requesting',
        text: 'yes',
        'plugin-titles': JSON.stringify(titles),
      });
      tw.notifier.display('$:/plugins/Gk0Wk/CPL-Repo/notifications/install-plugin-query', {
        variables: {},
      });

      const existingTitles = new Set<string>();
      const versionsMap: Record<string, Record<string, string>> = {};
      const versionsMapLatest: Record<string, string | undefined> = {};
      const sizesMap: Record<string, Record<string, number | null | undefined>> = {};
      const allTrees: Record<string, DependencyTree> = {};

      const recursiveInstallCheck = async (title: string): Promise<DependencyTree> => {
        try {
          const text = await cpl('Query', { plugin: title });
          const data = asPluginInfo(JSON.parse(text));

          existingTitles.add(title);
          if (!versionsMap[title]) {
            versionsMap[title] = (data.versions as Record<string, string>) ?? {};
            versionsMapLatest[title] = data.latest;
            sizesMap[title] = data['versions-size'] ?? {};
            sizesMap[title].latest = data['versions-size']?.[data.latest ?? ''];
          }

          const seenDependencies = new Set<string>();
          const subtree: DependencyTree = {};

          const processDependency = async (dependencyTitle: string): Promise<void> => {
            seenDependencies.add(dependencyTitle);
            if (existingTitles.has(dependencyTitle)) {
              subtree[dependencyTitle] = {};
              return;
            }

            subtree[dependencyTitle] = await recursiveInstallCheck(dependencyTitle);
          };

          const parentPlugin = data['parent-plugin'];
          if (typeof parentPlugin === 'string' && parentPlugin.length > 0) {
            await processDependency(parentPlugin);
          }

          for (const dependencyTitle of tw.utils.parseStringArray(data.dependents || '')) {
            if (seenDependencies.has(dependencyTitle)) {
              continue;
            }
            await processDependency(dependencyTitle);
          }

          return subtree;
        } catch (error) {
          const message = String(error);
          throw message.startsWith('404')
            ? `[404] Cannot find plugin ${title}`
            : message;
        }
      };

      await Promise.all(
        titles.map(async title => {
          allTrees[title] = await recursiveInstallCheck(title);
        }),
      );

      const tiddlerFields: Record<string, string> = {};
      for (const title of existingTitles) {
        const latestVersion = versionsMapLatest[title];
        if (latestVersion) {
          tiddlerFields[`cpl-plugin#version#${title}`] = latestVersion;
        }

        const version = tw.wiki.getTiddler(title)?.fields.version;
        tiddlerFields[`cpl-plugin#install#${title}`] =
          latestVersion &&
          tw.utils.compareVersions(typeof version === 'string' ? version : '', latestVersion) < 0
            ? 'yes'
            : 'no';
      }

      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/instal-plugin-request-tree',
        type: 'application/json',
        text: JSON.stringify({
          title: titles.length > 1 ? undefined : titles[0],
          versions: versionsMap,
          sizes: sizesMap,
          tree: allTrees,
        }),
        ...tiddlerFields,
      });
      tw.wiki.deleteTiddler('$:/temp/CPL-Repo/instal-plugin-requesting');
      tw.modal.display('$:/plugins/Gk0Wk/CPL-Repo/templates/modals/install-plugin-request', {
        variables: {
          requestTiddler: '$:/temp/CPL-Repo/instal-plugin-request-tree',
        },
        event,
      });
    } catch (error) {
      console.error(error);
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/instal-plugin-requesting',
        text: String(error),
        'plugin-title': JSON.stringify(event.paramObject ?? {}),
      });
    } finally {
      installRequestLock = false;
    }
  };

  const handleInstallPlugin = async (event: RootWidgetEvent): Promise<void> => {
    try {
      if (installLock) {
        return;
      }

      const response = getEventParam(event, 'response');
      if (!response || !tw.wiki.tiddlerExists(response)) {
        return;
      }

      const responseTiddler = tw.wiki.getTiddler(response);
      if (!responseTiddler) {
        return;
      }

      tw.wiki.deleteTiddler(response);
      const data = JSON.parse(responseTiddler.fields.text) as {
        title?: string;
        versions?: Record<string, string>;
      };

      const rootPlugin = data.title;
      const plugins: Array<[string, string | undefined]> = rootPlugin
        ? [[rootPlugin, getFieldString(responseTiddler.fields, `cpl-plugin#version#${rootPlugin}`)]]
        : [];

      for (const pluginTitle of Object.keys(data.versions ?? {})) {
        if (
          getFieldString(responseTiddler.fields, `cpl-plugin#install#${pluginTitle}`) === 'yes' &&
          getFieldString(responseTiddler.fields, `cpl-plugin#version#${pluginTitle}`)
        ) {
          plugins.push([
            pluginTitle,
            getFieldString(responseTiddler.fields, `cpl-plugin#version#${pluginTitle}`),
          ]);
        }
      }

      installLock = true;
      if (rootPlugin) {
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Repo/installing-plugin',
          text: 'yes',
          'plugin-title': rootPlugin,
        });
      }

      let count = 0;
      const total = plugins.length;
      const tiddlers = await Promise.all(
        plugins.map(async ([pluginTitle, version]) => {
          const text = await cpl('Install', {
            plugin: pluginTitle,
            version: version ?? 'latest',
          });
          count += 1;
          tw.notifier.display('$:/plugins/Gk0Wk/CPL-Repo/notifications/downloading', {
            variables: { plugin: pluginTitle, count, total },
          });
          return new tw.Tiddler(tw.utils.parseJSONSafe(text));
        }),
      );

      tw.wiki.deleteTiddler('$:/temp/CPL-Repo/installing-plugin');
      for (const tiddler of tiddlers) {
        tw.wiki.addTiddler(tiddler);
      }
      tw.notifier.display('$:/plugins/Gk0Wk/CPL-Repo/notifications/downloading-complete', {
        variables: {},
      });
    } catch (error) {
      console.error(error);
      tw.notifier.display('$:/plugins/Gk0Wk/CPL-Repo/notifications/downloading-fail', {
        variables: { message: String(error) },
      });
      const response = getEventParam(event, 'response');
      const rootPlugin = response
        ? getFieldString(tw.wiki.getTiddler(response)?.fields ?? {}, 'title')
        : undefined;
      if (rootPlugin) {
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Repo/installing-plugin',
          text: String(error),
          'plugin-title': rootPlugin,
        });
      }
    } finally {
      installLock = false;
    }
  };

  const handleGetPluginsIndex = async (): Promise<void> => {
    try {
      if (getPluginsIndexLock) {
        return;
      }

      getPluginsIndexLock = true;
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/getting-plugins-index',
        text: 'yes',
      });

      const data = asPluginInfoList(JSON.parse(await cpl('Index')));
      const pluginMap: Record<string, PluginInfo> = {};
      const categories: Record<string, string[]> = {};
      const authors: Record<string, string[]> = {};
      const allPlugins: string[] = [];
      const allTags = new Set<string>();

      for (const plugin of data) {
        pluginMap[plugin.title] = plugin;
        allPlugins.push(plugin.title);

        if (plugin.category && plugin.category !== 'Unknown') {
          categories[plugin.category] ??= [];
          categories[plugin.category].push(plugin.title);
        }

        if (plugin.author) {
          authors[plugin.author] ??= [];
          authors[plugin.author].push(plugin.title);
        }

        if (!plugin.title.startsWith('$:/languages') && plugin.title.split('/').length === 4) {
          const derivedAuthor = plugin.title.split('/')[2];
          if (derivedAuthor !== plugin.author) {
            authors[derivedAuthor] ??= [];
            authors[derivedAuthor].push(plugin.title);
          }
        }

        if (plugin.tags) {
          for (const tag of tw.utils.parseStringArray(plugin.tags)) {
            allTags.add(tag);
          }
        }
      }

      pluginIndexCache = data;
      allPluginsCache = allPlugins;
      categoryCache = categories;

      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/plugins-index',
        text: JSON.stringify(pluginMap),
        type: 'application/json',
      });
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/categories',
        text: JSON.stringify(categories),
        type: 'application/json',
      });
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/authors',
        text: JSON.stringify(authors),
        type: 'application/json',
      });
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/tags',
        text: JSON.stringify(Array.from(allTags)),
        type: 'application/json',
      });
      tw.wiki.deleteTiddler('$:/temp/CPL-Repo/getting-plugins-index');

      if (mirrorSwitchPending) {
        mirrorSwitchPending = false;
        setMirrorSwitchStatus('success', 'Mirror switched successfully.');
      } else {
        setMirrorSwitchStatus('ready', '');
      }
    } catch (error) {
      console.error(error);
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/getting-plugins-index',
        text: String(error),
      });
      if (mirrorSwitchPending) {
        mirrorSwitchPending = false;
        setMirrorSwitchStatus('error', String(error || 'Failed to switch mirror'));
      }
    } finally {
      getPluginsIndexLock = false;
    }
  };

  const handleQueryPlugin = async (event: RootWidgetEvent): Promise<void> => {
    const title = getEventParam(event, 'title');
    if (!title) {
      return;
    }

    const queryPluginLocks = handleQueryPlugin.locks;
    try {
      if (queryPluginLocks.has(title)) {
        return;
      }

      queryPluginLocks.add(title);
      tw.wiki.addTiddler({
        title: `$:/temp/CPL-Repo/querying-plugin/${title}`,
        text: 'yes',
      });

      const data = asPluginInfo(JSON.parse(await cpl('Query', { plugin: title })));
      if (
        !data.author &&
        !data.title.startsWith('$:/languages') &&
        data.title.split('/').length === 4
      ) {
        data.author = data.title.split('/')[2];
      }

      let suggestions: string[] = [];
      if (pluginIndexCache && data.category !== 'Language' && data.tags) {
        const tags = new Set(
          tw.utils.parseStringArray(data.tags).map(tag => tag.toLowerCase()),
        );
        suggestions = pluginIndexCache
          .filter(plugin => plugin.title !== title && plugin.tags)
          .map(plugin => {
            const weight = tw.utils
              .parseStringArray(data.tags || '')
              .reduce(
                (sum, tag) =>
                  sum + (tags.has(tag.toLowerCase()) ? 1 : 0),
                0,
              );
            return [plugin.title, weight] as const;
          })
          .filter(([, weight]) => weight > 0)
          .sort((left, right) => right[1] - left[1])
          .slice(0, 20)
          .map(([pluginTitle]) => pluginTitle);

        if (
          suggestions.length < 20 &&
          data.category &&
          data.category !== 'Unknown'
        ) {
          const knownSuggestions = new Set(suggestions);
          for (const pluginTitle of categoryCache[data.category] ?? []) {
            if (knownSuggestions.has(pluginTitle) || pluginTitle === title) {
              continue;
            }
            suggestions.push(pluginTitle);
            if (suggestions.length >= 20) {
              break;
            }
          }
        }
      }

      data.suggestions = tw.utils.stringifyList(suggestions);
      tw.wiki.addTiddler({
        title: `$:/temp/CPL-Repo/plugin-info/${title}`,
        text: JSON.stringify(data),
        type: 'application/json',
      });
      tw.wiki.deleteTiddler(`$:/temp/CPL-Repo/querying-plugin/${title}`);
    } catch (error) {
      console.error(error);
      tw.wiki.addTiddler({
        title: `$:/temp/CPL-Repo/querying-plugin/${title}`,
        text: String(error),
      });
    } finally {
      queryPluginLocks.delete(title);
    }
  };
  handleQueryPlugin.locks = new Set<string>();

  const handleSearchPlugins = (event: RootWidgetEvent): void => {
    try {
      if (handleSearchPlugins.lock || allPluginsCache === undefined || !pluginIndexCache) {
        return;
      }

      const mode = getEventParam(event, 'mode') ?? '';
      const text = getEventParam(event, 'text') ?? '';
      const saveTo = getEventParam(event, 'saveTo') ?? '';
      if (!saveTo) {
        return;
      }

      handleSearchPlugins.lock = true;

      switch (mode) {
        case 'mix': {
          if (text.length < 3) {
            tw.wiki.addTiddler({
              title: saveTo,
              text: JSON.stringify(allPluginsCache),
              type: 'application/json',
            });
            break;
          }

          tw.wiki.addTiddler({
            title: '$:/temp/CPL-Repo/searching-plugin',
            text: 'yes',
          });

          const patterns = new Set<string>(
            text
              .split(/\s+/)
              .map((pattern: string) => pattern.toLowerCase())
              .slice(0, 10),
          );

          const suggestions = pluginIndexCache
            .map(plugin => {
              let weight = 0;

              for (const field of ['title', 'author', 'name'] as const) {
                const value = plugin[field];
                if (typeof value === 'string') {
                  for (const pattern of patterns) {
                    if (value.toLowerCase().includes(pattern)) {
                      weight += 10;
                    }
                  }
                }
              }

              if (plugin.tags) {
                for (const tag of tw.utils.parseStringArray(plugin.tags)) {
                  if (patterns.has(tag.toLowerCase())) {
                    weight += 5;
                  }
                }
              }

              if (typeof plugin.description === 'string') {
                const description = plugin.description.toLowerCase();
                for (const pattern of patterns) {
                  if (description.includes(pattern)) {
                    weight += 2;
                  }
                }
                for (const pattern of patterns) {
                  if (plugin.description.includes(pattern)) {
                    weight += 1;
                  }
                }
              }

              return [plugin.title, weight] as const;
            })
            .filter(([, weight]) => weight > 0)
            .sort((left, right) => right[1] - left[1])
            .map(([title]) => title);

          tw.wiki.addTiddler({
            title: saveTo,
            text: JSON.stringify(suggestions),
            type: 'application/json',
          });
          tw.wiki.deleteTiddler('$:/temp/CPL-Repo/searching-plugin');
          break;
        }
        case 'tags': {
          tw.wiki.addTiddler({
            title: '$:/temp/CPL-Repo/searching-plugin',
            text: 'yes',
          });

          const tags = new Set<string>(
            tw.utils.parseStringArray(text).map(tag => tag.toLowerCase()),
          );
          const result = pluginIndexCache
            .filter(plugin => {
              if (!plugin.tags) {
                return false;
              }
              return tw.utils
                .parseStringArray(plugin.tags)
                .every(tag => tags.has(tag.toLowerCase()));
            })
            .map(plugin => plugin.title);

          tw.wiki.addTiddler({
            title: saveTo,
            text: JSON.stringify(result),
            type: 'application/json',
          });
          tw.wiki.deleteTiddler('$:/temp/CPL-Repo/searching-plugin');
          break;
        }
        default:
          return;
      }
    } catch (error) {
      console.error(error);
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/searching-plugin',
        text: String(error),
      });
    } finally {
      handleSearchPlugins.lock = false;
    }
  };
  handleSearchPlugins.lock = false;

  tw.rootWidget.addEventListener('cpl-update-check', (_event: RootWidgetEvent): undefined => {
    update();
    return undefined;
  });
  tw.rootWidget.addEventListener('cpl-install-plugin-request', (event: RootWidgetEvent): undefined => {
    void handleInstallPluginRequest(event);
    return undefined;
  });
  tw.rootWidget.addEventListener('cpl-install-plugin', (event: RootWidgetEvent): undefined => {
    void handleInstallPlugin(event);
    return undefined;
  });
  tw.rootWidget.addEventListener('cpl-get-plugins-index', (_event: RootWidgetEvent): undefined => {
    void handleGetPluginsIndex();
    return undefined;
  });
  tw.rootWidget.addEventListener('cpl-query-plugin', (event: RootWidgetEvent): undefined => {
    void handleQueryPlugin(event);
    return undefined;
  });
  tw.rootWidget.addEventListener('cpl-search-plugins', (event: RootWidgetEvent): undefined => {
    handleSearchPlugins(event);
    return undefined;
  });
};