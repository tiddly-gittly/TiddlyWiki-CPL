import { formatPluginTitle, getCurrentRepoEntry, getEventParam, getFieldString } from './bridge';
import {
  tw,
  type DependencyTree,
  type PluginInfo,
  type RootWidgetEvent,
} from './types';

export interface InstallController {
  handleInstallPluginRequest: (event: RootWidgetEvent) => Promise<void>;
  handleInstallPlugin: (event: RootWidgetEvent) => Promise<void>;
}

const asPluginInfo = (value: unknown): PluginInfo => value as PluginInfo;

const CPL_REPO_PLUGIN_TITLE = '$:/plugins/Gk0Wk/CPL-Repo';
const CPL_SERVER_PLUGIN_TITLE = '$:/plugins/Gk0Wk/CPL-Server';

export const shouldSkipLegacyDependency = (
  pluginTitle: string,
  dependencyTitle: string,
): boolean =>
  pluginTitle === CPL_REPO_PLUGIN_TITLE &&
  dependencyTitle === CPL_SERVER_PLUGIN_TITLE;

export const name = 'cpl-install';
export const platforms = ['browser'];
export const after = ['startup'];
export const synchronous = true;

const INSTALL_PLUGIN_REQUEST_TITLE = '$:/temp/CPL-Repo/install-plugin-request';
const INSTALL_PLUGIN_CONFIRM_REQUEST_TITLE = '$:/temp/CPL-Repo/install-plugin-confirm-request';

const getRequestFields = (changes: Record<string, unknown>, title: string): Record<string, string> | null => {
  if (!tw.utils.hop(changes, title)) return null;
  const tiddler = tw.wiki.getTiddler(title);
  if (!tiddler || typeof tiddler.fields.text !== 'string' || !tiddler.fields.text) return null;
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(tiddler.fields)) if (typeof v === 'string') result[k] = v;
  return result;
};

export const startup = (): void => {
  const controller = createInstallController();

  tw.wiki.addEventListener('change', changes => {
    const installRequest = getRequestFields(changes, INSTALL_PLUGIN_REQUEST_TITLE);
    if (installRequest) {
      tw.wiki.addTiddler({ title: INSTALL_PLUGIN_REQUEST_TITLE, text: '' });
      void controller.handleInstallPluginRequest({
        type: 'cpl-install-plugin-request',
        paramObject: installRequest,
        widget: tw.rootWidget,
      } as unknown as RootWidgetEvent);
    }

    const installConfirmRequest = getRequestFields(changes, INSTALL_PLUGIN_CONFIRM_REQUEST_TITLE);
    if (installConfirmRequest) {
      tw.wiki.addTiddler({ title: INSTALL_PLUGIN_CONFIRM_REQUEST_TITLE, text: '' });
      void controller.handleInstallPlugin({
        type: 'cpl-install-plugin',
        paramObject: installConfirmRequest,
        widget: tw.rootWidget,
      } as unknown as RootWidgetEvent);
    }
  });
};

export const createInstallController = (): InstallController => {
  let installRequestLock = false;
  let installLock = false;

  const handleInstallPluginRequest = async (
    event: RootWidgetEvent,
  ): Promise<void> => {
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
      const autoConfirm = getEventParam(event, 'auto-confirm') === 'yes';
      if (titles.length === 0) {
        return;
      }

      installRequestLock = true;
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/instal-plugin-requesting',
        text: 'yes',
        'plugin-titles': JSON.stringify(titles),
      });

      const existingTitles = new Set<string>();
      const versionsMap: Record<string, Record<string, string>> = {};
      const versionsMapLatest: Record<string, string | undefined> = {};
      const sizesMap: Record<
        string,
        Record<string, number | null | undefined>
      > = {};
      const allTrees: Record<string, DependencyTree> = {};

      const recursiveInstallCheck = async (
        title: string,
      ): Promise<DependencyTree> => {
        try {
          const response = await fetch(
            `${getCurrentRepoEntry()}/plugins/${formatPluginTitle(title)}/__meta__.json`,
          );
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const text = await response.text();
          const data = asPluginInfo(JSON.parse(text));

          existingTitles.add(title);
          if (!versionsMap[title]) {
            versionsMap[title] =
              (data.versions as Record<string, string>) ?? {};
            versionsMapLatest[title] = data.latest;
            sizesMap[title] = data['versions-size'] ?? {};
            sizesMap[title].latest = data['versions-size']?.[data.latest ?? ''];
          }

          const seenDependencies = new Set<string>();
          const subtree: DependencyTree = {};

          const processDependency = async (
            dependencyTitle: string,
          ): Promise<void> => {
            seenDependencies.add(dependencyTitle);
            if (existingTitles.has(dependencyTitle)) {
              subtree[dependencyTitle] = {};
              return;
            }

            subtree[dependencyTitle] = await recursiveInstallCheck(
              dependencyTitle,
            );
          };

          const parentPlugin = data['parent-plugin'];
          if (typeof parentPlugin === 'string' && parentPlugin.length > 0) {
            if (!shouldSkipLegacyDependency(title, parentPlugin)) {
              await processDependency(parentPlugin);
            }
          }

          for (const dependencyTitle of tw.utils.parseStringArray(
            data.dependents || '',
          )) {
            if (seenDependencies.has(dependencyTitle)) {
              continue;
            }
            if (shouldSkipLegacyDependency(title, dependencyTitle)) {
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
          tw.utils.compareVersions(
            typeof version === 'string' ? version : '',
            latestVersion,
          ) < 0
            ? 'yes'
            : 'no';
      }

      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/instal-plugin-request-tree',
        type: 'application/json',
        text: JSON.stringify({
          title: titles.length > 1 ? undefined : titles[0],
          isBatch: titles.length > 1,
          versions: versionsMap,
          sizes: sizesMap,
          tree: allTrees,
        }),
        ...tiddlerFields,
      });
      tw.wiki.deleteTiddler('$:/temp/CPL-Repo/instal-plugin-requesting');
      if (autoConfirm) {
        await handleInstallPlugin({
          type: 'cpl-install-plugin',
          paramObject: {
            response: '$:/temp/CPL-Repo/instal-plugin-request-tree',
          },
          widget: event.widget,
        } as unknown as RootWidgetEvent);
      }
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
    const response = getEventParam(event, 'response');
    const responseRootPlugin = response
      ? getFieldString(tw.wiki.getTiddler(response)?.fields ?? {}, 'title')
      : undefined;

    try {
      if (installLock) {
        return;
      }

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
        ? [
            [
              rootPlugin,
              getFieldString(
                responseTiddler.fields,
                `cpl-plugin#version#${rootPlugin}`,
              ),
            ],
          ]
        : [];

      for (const pluginTitle of Object.keys(data.versions ?? {})) {
        if (
          getFieldString(
            responseTiddler.fields,
            `cpl-plugin#install#${pluginTitle}`,
          ) === 'yes' &&
          getFieldString(
            responseTiddler.fields,
            `cpl-plugin#version#${pluginTitle}`,
          )
        ) {
          plugins.push([
            pluginTitle,
            getFieldString(
              responseTiddler.fields,
              `cpl-plugin#version#${pluginTitle}`,
            ),
          ]);
        }
      }

      installLock = true;
      if (rootPlugin) {
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Repo/installing-plugin',
          text: 'yes',
          'plugin-title': rootPlugin,
          count: '0',
          total: String(plugins.length),
        });
      }

      let count = 0;
      const total = plugins.length;
      const tiddlers = await Promise.all(
        plugins.map(async ([pluginTitle, version]) => {
          const response = await fetch(
            `${getCurrentRepoEntry()}/plugins/${formatPluginTitle(pluginTitle)}/${version ?? 'latest'}.json`,
          );
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const text = await response.text();

          count += 1;
          tw.wiki.addTiddler({
            title: '$:/temp/CPL-Repo/installing-plugin',
            text: 'yes',
            'plugin-title': rootPlugin ?? pluginTitle,
            'current-plugin': pluginTitle,
            count: String(count),
            total: String(total),
          });
          return new tw.Tiddler(tw.utils.parseJSONSafe(text));
        }),
      );

      tw.wiki.deleteTiddler('$:/temp/CPL-Repo/installing-plugin');
      for (const tiddler of tiddlers) {
        tw.wiki.addTiddler(tiddler);
      }
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/install-plugin-status',
        text: 'success',
        'plugin-title': rootPlugin ?? '',
      });
    } catch (error) {
      console.error(error);
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/install-plugin-status',
        text: String(error),
        'plugin-title': responseRootPlugin ?? '',
      });
      if (responseRootPlugin) {
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Repo/installing-plugin',
          text: String(error),
          'plugin-title': responseRootPlugin,
        });
      }
    } finally {
      installLock = false;
    }
  };

  return {
    handleInstallPluginRequest,
    handleInstallPlugin,
  };
};
