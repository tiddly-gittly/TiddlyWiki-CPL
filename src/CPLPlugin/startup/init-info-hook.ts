type UpdatePluginMap = Record<string, [string, ...unknown[]]>;

type CplBridge = (type: string, payload?: Record<string, unknown>) => Promise<string>;

const browserRuntime = globalThis as typeof globalThis & {
  __tiddlywiki_cpl__: CplBridge;
};

export const name = 'cpl-info-hook';
export const platforms = ['browser'];
export const after = ['render', 'cpl-repo-init'];
export const synchronous = true;

export const startup = (): void => {
  browserRuntime.__tiddlywiki_cpl__('Update').then(text => {
    const updatePlugins = JSON.parse(text) as UpdatePluginMap;
    const pluginVersions: Record<string, string> = {};

    for (const [title, [version]] of Object.entries(updatePlugins)) {
      pluginVersions[title] = version;
    }

    $tw.wiki.addTiddler({
      title: '$:/temp/CPL/plugin-infos.json',
      text: JSON.stringify(pluginVersions),
      type: 'application/json',
    });
  });
};