import { cpl, getEventParam } from './bridge';
import { tw, type PluginInfo, type RootWidgetEvent } from './types';

interface IndexControllerOptions {
  onIndexLoaded: () => void;
  onIndexLoadFailed: (message: string) => void;
}

export interface IndexController {
  handleGetPluginsIndex: () => Promise<void>;
  handleQueryPlugin: (event: RootWidgetEvent) => Promise<void>;
  handleSearchPlugins: (event: RootWidgetEvent) => void;
  isBusy: () => boolean;
}

const asPluginInfo = (value: unknown): PluginInfo => value as PluginInfo;
const asPluginInfoList = (value: unknown): PluginInfo[] => value as PluginInfo[];

export const createIndexController = ({
  onIndexLoaded,
  onIndexLoadFailed,
}: IndexControllerOptions): IndexController => {
  let getPluginsIndexLock = false;
  let pluginIndexCache: PluginInfo[] | undefined;
  let allPluginsCache: string[] | undefined;
  let categoryCache: Record<string, string[]> = {};
  let searchLock = false;
  const queryPluginLocks = new Set<string>();

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
      onIndexLoaded();
    } catch (error) {
      console.error(error);
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/getting-plugins-index',
        text: String(error),
      });
      onIndexLoadFailed(String(error || 'Failed to load plugin index'));
    } finally {
      getPluginsIndexLock = false;
    }
  };

  const handleQueryPlugin = async (event: RootWidgetEvent): Promise<void> => {
    const title = getEventParam(event, 'title');
    if (!title) {
      return;
    }

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
        suggestions = pluginIndexCache
          .filter(plugin => plugin.title !== title && plugin.tags)
          .map(plugin => {
            let weight = 0;

            for (const field of ['title', 'author', 'name'] as const) {
              const value = plugin[field];
              if (typeof value === 'string' && value.toLowerCase().includes(title.toLowerCase())) {
                weight += 10;
              }
            }

            const currentPluginTags = tw.utils.parseStringArray(data.tags || '');
            const candidateTags = new Set(
              tw.utils.parseStringArray(plugin.tags || '').map(tag => tag.toLowerCase()),
            );
            weight += currentPluginTags.reduce(
              (sum, tag) => sum + (candidateTags.has(tag.toLowerCase()) ? 1 : 0),
              0,
            );

            if (typeof plugin.description === 'string' && typeof data.description === 'string') {
              const currentDescriptionPatterns = data.description
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 10);
              for (const pattern of currentDescriptionPatterns) {
                if (plugin.description.toLowerCase().includes(pattern)) {
                  weight += 1;
                }
              }
            }

            return [plugin.title, weight] as const;
          })
          .filter(([, weight]) => weight > 0)
          .sort((left, right) => right[1] - left[1])
          .slice(0, 20)
          .map(([pluginTitle]) => pluginTitle);

        if (suggestions.length < 20 && data.category && data.category !== 'Unknown') {
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

  const handleSearchPlugins = (event: RootWidgetEvent): void => {
    try {
      if (searchLock || allPluginsCache === undefined || !pluginIndexCache) {
        return;
      }

      const mode = getEventParam(event, 'mode') ?? '';
      const text = getEventParam(event, 'text') ?? '';
      const saveTo = getEventParam(event, 'saveTo') ?? '';
      if (!saveTo) {
        return;
      }

      searchLock = true;

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
              .map(pattern => pattern.toLowerCase())
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
      searchLock = false;
    }
  };

  return {
    handleGetPluginsIndex,
    handleQueryPlugin,
    handleSearchPlugins,
    isBusy: () => getPluginsIndexLock,
  };
};