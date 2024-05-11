import type { ITiddlyWiki, ITiddlerFields } from 'tiddlywiki';
import { mergePluginInfo } from './merge';

export const buildCPLPlugin = (
  $tw: ITiddlyWiki,
): [
  Record<string, string>,
  ReturnType<typeof mergePluginInfo>['newInfoTiddler'],
] => {
  const cplPluginTiddlers: Record<string, ITiddlerFields> = {};
  $tw.wiki
    .filterTiddlers(
      '[tag[$:/tags/PluginLibrary/CPL]] [prefix[$:/plugins/Gk0Wk/CPL-Repo/]] -$:/plugins/Gk0Wk/CPL-Repo/config/popup-readme-at-startup -$:/plugins/Gk0Wk/CPL-Repo/config/auto-update-intervals-minutes',
    )
    .map(title => ({
      ...$tw.wiki.getTiddler(title)!.fields,
      created: undefined,
      creator: undefined,
      modified: undefined,
      modifier: undefined,
      revision: undefined,
      bag: undefined,
    }))
    .forEach(tiddler => {
      cplPluginTiddlers[tiddler.title] = tiddler as any;
    });
  const plugin = {
    version: $tw.wiki.getTiddlerText('CPL-Repo-Version')!.trim(),
    type: 'application/json',
    title: '$:/plugins/Gk0Wk/CPL-Repo',
    'plugin-type': 'plugin',
    name: 'CPL Repo',
    description: 'Essential and powerful plugin manager and library',
    author: 'Gk0Wk',
    list: 'readme tree',
    text: JSON.stringify({ tiddlers: cplPluginTiddlers }),
  };
  return [
    plugin,
    {
      title: plugin.title,
      name: plugin.name,
      author: plugin.author,
      version: plugin.version,
      'plugin-type': plugin['plugin-type'],
      icon: '',
      'core-version': '>=5.3.0',
      dependents: '',
      'parent-plugin': '',
      'requires-reload': true,
      category: 'Functional',
      tags: 'CPL [[Plugin Libaray]] Network Essential',
      description: plugin.description,
      readme: $tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/readme')!,
    },
  ];
};
