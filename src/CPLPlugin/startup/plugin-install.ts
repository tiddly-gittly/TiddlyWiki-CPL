import { formatPluginTitle, getCurrentRepoEntry } from './repo';
import {
  tw,
  type DependencyTree,
  type PluginInfo,
  type RootWidgetEvent,
} from './types';

export const name = 'cpl-install';
export const platforms = ['browser'];
export const after = ['startup'];
export const synchronous = true;

const asPluginInfo = (value: unknown): PluginInfo => value as PluginInfo;

const CPL_REPO_PLUGIN_TITLE = '$:/plugins/Gk0Wk/CPL-Repo';
const CPL_SERVER_PLUGIN_TITLE = '$:/plugins/Gk0Wk/CPL-Server';

export const shouldSkipLegacyDependency = (
  pluginTitle: string,
  dependencyTitle: string,
): boolean =>
  pluginTitle === CPL_REPO_PLUGIN_TITLE &&
  dependencyTitle === CPL_SERVER_PLUGIN_TITLE;

const getFieldString = (
  fields: Record<string, unknown>,
  name: string,
): string | undefined => {
  const value = fields[name];
  return typeof value === 'string' ? value : undefined;
};

let installRequestLock = false;
let installLock = false;

const doInstallPluginRequest = async (
  event: RootWidgetEvent,
): Promise<void> => {
  const p = (event.paramObject ?? {}) as Record<string, string>;
  try {
    if (installRequestLock) {
      return;
    }
    const titlesParam = p.titles;
    const titleParam = p.title;
    const titles = titlesParam
      ? tw.utils.parseStringArray(titlesParam)
      : titleParam
      ? [titleParam]
      : [];
    const autoConfirm = p['auto-confirm'] === 'yes';
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
          `${getCurrentRepoEntry()}/plugins/${formatPluginTitle(
            title,
          )}/__meta__.json`,
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = asPluginInfo(JSON.parse(await response.text()));
        existingTitles.add(title);
        if (!versionsMap[title]) {
          versionsMap[title] = (data.versions as Record<string, string>) ?? {};
          versionsMapLatest[title] = data.latest;
          sizesMap[title] = data['versions-size'] ?? {};
          sizesMap[title].latest = data['versions-size']?.[data.latest ?? ''];
        }
        const seenDependencies = new Set<string>();
        const subtree: DependencyTree = {};
        const processDependency = async (dt: string): Promise<void> => {
          seenDependencies.add(dt);
          if (existingTitles.has(dt)) {
            subtree[dt] = {};
            return;
          }
          subtree[dt] = await recursiveInstallCheck(dt);
        };
        const parentPlugin = data['parent-plugin'];
        if (
          typeof parentPlugin === 'string' &&
          parentPlugin.length > 0 &&
          !shouldSkipLegacyDependency(title, parentPlugin)
        ) {
          await processDependency(parentPlugin);
        }
        for (const dt of tw.utils.parseStringArray(data.dependents || '')) {
          if (
            !seenDependencies.has(dt) &&
            !shouldSkipLegacyDependency(title, dt)
          ) {
            await processDependency(dt);
          }
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
      titles.map(async t => {
        allTrees[t] = await recursiveInstallCheck(t);
      }),
    );

    const tiddlerFields: Record<string, string> = {};
    for (const t of existingTitles) {
      const lv = versionsMapLatest[t];
      if (lv) {
        tiddlerFields[`cpl-plugin#version#${t}`] = lv;
      }
      const v = tw.wiki.getTiddler(t)?.fields.version;
      tiddlerFields[`cpl-plugin#install#${t}`] =
        lv && tw.utils.compareVersions(typeof v === 'string' ? v : '', lv) < 0
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
      await doInstallPlugin({
        type: 'cpl-install-plugin-confirm',
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

const doInstallPlugin = async (event: RootWidgetEvent): Promise<void> => {
  const p = (event.paramObject ?? {}) as Record<string, string>;
  const responseTitle = p.response ?? '';
  const responseRootPlugin = responseTitle
    ? getFieldString(tw.wiki.getTiddler(responseTitle)?.fields ?? {}, 'title')
    : undefined;
  try {
    if (installLock) {
      return;
    }
    if (!responseTitle || !tw.wiki.tiddlerExists(responseTitle)) {
      return;
    }
    const rt = tw.wiki.getTiddler(responseTitle);
    if (!rt) {
      return;
    }
    tw.wiki.deleteTiddler(responseTitle);
    const data = JSON.parse(rt.fields.text) as {
      title?: string;
      versions?: Record<string, string>;
    };
    const rootPlugin = data.title;
    const plugins: Array<[string, string | undefined]> = rootPlugin
      ? [
          [
            rootPlugin,
            getFieldString(rt.fields, `cpl-plugin#version#${rootPlugin}`),
          ],
        ]
      : [];
    for (const pt of Object.keys(data.versions ?? {})) {
      if (
        getFieldString(rt.fields, `cpl-plugin#install#${pt}`) === 'yes' &&
        getFieldString(rt.fields, `cpl-plugin#version#${pt}`)
      ) {
        plugins.push([
          pt,
          getFieldString(rt.fields, `cpl-plugin#version#${pt}`),
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
      plugins.map(async ([pt, version]) => {
        const resp = await fetch(
          `${getCurrentRepoEntry()}/plugins/${formatPluginTitle(pt)}/${
            version ?? 'latest'
          }.json`,
        );
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const text = await resp.text();
        count += 1;
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Repo/installing-plugin',
          text: 'yes',
          'plugin-title': rootPlugin ?? pt,
          'current-plugin': pt,
          count: String(count),
          total: String(total),
        });
        return new tw.Tiddler(tw.utils.parseJSONSafe(text));
      }),
    );
    tw.wiki.deleteTiddler('$:/temp/CPL-Repo/installing-plugin');
    for (const t of tiddlers) {
      tw.wiki.addTiddler(t);
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

export const startup = (): void => {
  tw.rootWidget.addEventListener(
    'cpl-install-plugin-request',
    doInstallPluginRequest,
  );
  tw.rootWidget.addEventListener('cpl-install-plugin-confirm', doInstallPlugin);
};
