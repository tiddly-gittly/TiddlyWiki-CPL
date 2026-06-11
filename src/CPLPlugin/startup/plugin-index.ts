import { tw, type PluginInfo } from './types';

const asPluginInfoList = (value: unknown): PluginInfo[] =>
  value as PluginInfo[];

const PLUGIN_INDEX_RAW_TITLE = '$:/temp/CPL-Repo/plugin-index-raw';

let pluginIndexCache: PluginInfo[] | undefined;
let allPluginsCache: string[] | undefined;
let searchLock = false;

export const name = 'cpl-plugin-index';
export const platforms = ['browser'];
export const after = ['startup'];
export const synchronous = true;

const handleSearchPlugins = (text: string, saveTo: string): void => {
  if (searchLock || allPluginsCache === undefined || !pluginIndexCache) {
    return;
  }
  searchLock = true;
  try {
    if (text.length < 3) {
      tw.wiki.addTiddler({
        title: saveTo,
        text: JSON.stringify(allPluginsCache),
        type: 'application/json',
      });
      return;
    }
    tw.wiki.addTiddler({
      title: '$:/temp/CPL-Repo/searching-plugin',
      text: 'yes',
    });
    const patterns = new Set(
      text
        .split(/\s+/)
        .map(p => p.toLowerCase())
        .slice(0, 10),
    );
    const results = pluginIndexCache
      .map(plugin => {
        let weight = 0;
        for (const field of ['title', 'author', 'name'] as const) {
          const val = plugin[field];
          if (typeof val === 'string') {
            for (const p of patterns) {
              if (val.toLowerCase().includes(p)) {
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
          for (const p of patterns) {
            if (plugin.description.toLowerCase().includes(p)) {
              weight += 2;
            }
          }
        }
        if (typeof plugin.description === 'string') {
          const d = plugin.description.toLowerCase();
          for (const p of patterns) {
            if (d.includes(p)) {
              weight += 1;
            }
          }
        }
        return [plugin.title, weight] as const;
      })
      .filter(([, w]) => w > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t);
    tw.wiki.addTiddler({
      title: saveTo,
      text: JSON.stringify(results),
      type: 'application/json',
    });
    tw.wiki.deleteTiddler('$:/temp/CPL-Repo/searching-plugin');
  } catch (error) {
    console.error(error);
    tw.wiki.addTiddler({
      title: '$:/temp/CPL-Repo/searching-plugin',
      text: String(error),
    });
  } finally {
    searchLock = false;
  }
};

export const startup = (): void => {
  tw.wiki.addEventListener('change', changes => {
    if (tw.utils.hop(changes, PLUGIN_INDEX_RAW_TITLE)) {
      const raw = tw.wiki.getTiddlerText(PLUGIN_INDEX_RAW_TITLE, '');
      if (!raw) {
        return;
      }
      tw.wiki.deleteTiddler(PLUGIN_INDEX_RAW_TITLE);
      try {
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Repo/getting-plugins-index',
          text: 'yes',
        });
        const data = asPluginInfoList(JSON.parse(raw));
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
          if (
            !plugin.title.startsWith('$:/languages') &&
            plugin.title.split('/').length === 4
          ) {
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
      } catch (error) {
        console.error(error);
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Repo/getting-plugins-index',
          text: String(error),
        });
      }
    }
  });

  tw.rootWidget.addEventListener('cpl-search-plugins', (event: unknown) => {
    const e = event as { paramObject?: Record<string, string> };
    const p = e.paramObject ?? {};
    const query = p.query ?? '';
    const saveTo = p.saveTo ?? '';
    if (saveTo) {
      handleSearchPlugins(query, saveTo);
    }
    return undefined;
  });
};
