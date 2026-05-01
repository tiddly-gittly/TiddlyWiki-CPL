import { cpl, getEventParam, getFieldString } from './bridge';
import { tw, type DependencyTree, type PluginInfo, type RootWidgetEvent } from './types';

export interface InstallController {
  handleInstallPluginRequest: (event: RootWidgetEvent) => Promise<void>;
  handleInstallPlugin: (event: RootWidgetEvent) => Promise<void>;
  isInstallRequestPending: () => boolean;
  isInstallPending: () => boolean;
}

const asPluginInfo = (value: unknown): PluginInfo => value as PluginInfo;

export const createInstallController = (): InstallController => {
  let installRequestLock = false;
  let installLock = false;

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
          throw message.startsWith('404') ? `[404] Cannot find plugin ${title}` : message;
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

  return {
    handleInstallPluginRequest,
    handleInstallPlugin,
    isInstallRequestPending: () => installRequestLock,
    isInstallPending: () => installLock,
  };
};