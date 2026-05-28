import { resolve } from 'path';
import fs from 'fs-extra';
import type { ITiddlyWiki, ITiddlerFields } from 'tiddlywiki';
import { getTiddlerFromFile } from '../utils/tiddler';
import { getRuntimePluginTiddlers } from '../runtime-plugins';
import { mergePluginInfo } from './merge';

interface SourcePluginInfo {
  title?: string;
  description?: string;
  author?: string;
  version?: string;
  'core-version'?: string;
  'plugin-type'?: string;
  dependents?: string;
  list?: string;
}

const pluginInfoPath = resolve('src/CPLPlugin/plugin.info');
const repoVersionTiddlerPath = resolve('src/CPLPlugin/config/repo-version.tid');
const readmeTiddlerPath = resolve('src/CPLPlugin/docs/readme.tid');

const requireNonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required CPL plugin metadata: ${label}`);
  }

  return value.trim();
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`Missing required CPL plugin metadata: ${label}`);
  }

  return value.trim();
};

const rawSourcePluginInfo = fs.readJSONSync(pluginInfoPath) as SourcePluginInfo;

const sourcePluginInfo = {
  title: requireNonEmptyString(
    rawSourcePluginInfo.title,
    `${pluginInfoPath}#title`,
  ),
  description: requireNonEmptyString(
    rawSourcePluginInfo.description,
    `${pluginInfoPath}#description`,
  ),
  author: requireNonEmptyString(
    rawSourcePluginInfo.author,
    `${pluginInfoPath}#author`,
  ),
  version: requireNonEmptyString(
    rawSourcePluginInfo.version,
    `${pluginInfoPath}#version`,
  ),
  coreVersion: requireNonEmptyString(
    rawSourcePluginInfo['core-version'],
    `${pluginInfoPath}#core-version`,
  ),
  pluginType: requireNonEmptyString(
    rawSourcePluginInfo['plugin-type'],
    `${pluginInfoPath}#plugin-type`,
  ),
  dependents: requireString(
    rawSourcePluginInfo.dependents,
    `${pluginInfoPath}#dependents`,
  ),
  list: requireNonEmptyString(
    rawSourcePluginInfo.list,
    `${pluginInfoPath}#list`,
  ),
};

const getBuiltPluginVersion = ($tw: ITiddlyWiki): string => {
  const repoVersionTiddler = getTiddlerFromFile(
    $tw,
    repoVersionTiddlerPath,
    'CPL-Repo-Version',
  );
  const builtVersion = requireNonEmptyString(
    repoVersionTiddler?.text,
    repoVersionTiddlerPath,
  );

  if (builtVersion !== sourcePluginInfo.version) {
    throw new Error(
      `CPL-Repo-Version (${builtVersion}) does not match src/CPLPlugin/plugin.info version (${sourcePluginInfo.version})`,
    );
  }

  return builtVersion;
};

const getBuiltPluginReadme = ($tw: ITiddlyWiki): string =>
  requireNonEmptyString(
    getTiddlerFromFile(
      $tw,
      readmeTiddlerPath,
      '$:/plugins/Gk0Wk/CPL-Repo/docs/readme',
    )?.text,
    readmeTiddlerPath,
  );

export const buildCPLPlugin = (
  $tw: ITiddlyWiki,
): [
  Record<string, string>,
  ReturnType<typeof mergePluginInfo>['newInfoTiddler'],
] => {
  const pluginVersion = getBuiltPluginVersion($tw);
  const pluginReadme = getBuiltPluginReadme($tw);
  const sourceRuntimeTiddlers = getRuntimePluginTiddlers('repo');
  const cplPluginTiddlers: Record<string, ITiddlerFields> = {};
  Object.values(sourceRuntimeTiddlers)
    .filter(
      ({ title }) =>
        ![
          '$:/plugins/Gk0Wk/CPL-Repo/config/popup-readme-at-startup',
          '$:/plugins/Gk0Wk/CPL-Repo/config/auto-update-intervals-minutes',
        ].includes(title),
    )
    .map(tiddler => ({
      ...tiddler,
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

  if (Object.keys(cplPluginTiddlers).length === 0) {
    throw new Error(
      'No CPL plugin source tiddlers were loaded for buildCPLPlugin',
    );
  }

  const plugin = {
    version: pluginVersion,
    type: 'application/json',
    title: sourcePluginInfo.title,
    'plugin-type': sourcePluginInfo.pluginType,
    name: 'CPL Repo',
    description: sourcePluginInfo.description,
    author: sourcePluginInfo.author,
    list: sourcePluginInfo.list,
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
      'core-version': sourcePluginInfo.coreVersion,
      dependents: sourcePluginInfo.dependents,
      'parent-plugin': '',
      'requires-reload': true,
      category: 'Functional',
      tags: 'CPL [[Plugin Libaray]] Network Essential',
      description: plugin.description,
      readme: pluginReadme,
    },
  ];
};
