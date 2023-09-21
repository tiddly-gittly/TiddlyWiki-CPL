import type { ITiddlyWiki, ITiddlerFields } from 'tiddlywiki';

export const buildCPLPlugin = ($tw: ITiddlyWiki): ITiddlerFields => {
  const cplPluginTiddlers: Record<string, ITiddlerFields> = {};
  $tw.wiki
    .filterTiddlers('[tag[$:/tags/PluginLibrary/CPL]]')
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
  return {
    version: $tw.wiki.getTiddlerText('CPL-Repo-Version'),
    type: 'application/json',
    title: '$:/plugins/Gk0Wk/CPL-Repo',
    'plugin-type': 'plugin',
    name: 'CPL Repo',
    description: 'Repos for CPL',
    author: 'Gk0Wk',
    text: JSON.stringify({ tiddlers: cplPluginTiddlers }),
  } as any;
};
