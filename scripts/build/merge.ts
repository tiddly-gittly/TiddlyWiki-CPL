import type { ITiddlerFields, ITiddlyWiki } from 'tiddlywiki';
import { getReadmeFromPlugin, ifPluginRequiresReload } from '../utils/tiddler';

const mergingFields = [
  'title',
  'dependents',
  'description',
  'source',
  'parent-plugin',
  'core-version',
  'icon',
];

export const mergeField = (
  fieldName: string,
  plugin: Record<string, unknown>,
  info: Record<string, unknown>,
  fallback?: unknown,
) => {
  const pluginEmpty =
    plugin[fieldName] === undefined ||
    plugin[fieldName] === null ||
    (typeof plugin[fieldName] === 'string' &&
      (plugin[fieldName] as string).trim() === '');
  const infoEmpty =
    info[fieldName] === undefined ||
    info[fieldName] === null ||
    (typeof info[fieldName] === 'string' &&
      (info[fieldName] as string).trim() === '');
  if (pluginEmpty && infoEmpty) {
    if (
      fallback !== undefined &&
      fallback !== null &&
      (typeof fallback !== 'string' || fallback.trim() !== '')
    ) {
      info[fieldName] = fallback;
      plugin[fieldName] = fallback;
    }
  } else if (pluginEmpty) {
    plugin[fieldName] = info[fieldName];
  } else if (infoEmpty) {
    info[fieldName] = plugin[fieldName];
  }
};

export const mergePluginInfo = (
  pluginTiddler: ITiddlerFields,
  infoTiddler: ITiddlerFields,
  $tw: ITiddlyWiki,
) => {
  const newInfoTiddler = {
    title: infoTiddler['cpl.title'] as string,
    author: infoTiddler['cpl.author'] as string,
    name: infoTiddler['cpl.name'] as string,
    description: infoTiddler['cpl.description'] as string,
    readme: infoTiddler['cpl.readme'] as string,
    version: infoTiddler['cpl.version'] as string,
    'plugin-type': infoTiddler['cpl.plugin-type'] as string,
    icon: infoTiddler['cpl.icon'] as string | undefined,
    dependents: ((infoTiddler['cpl.dependents'] as any)
      ?.split?.('\n')
      ?.join?.(' ') ?? '') as string | undefined,
    'parent-plugin': infoTiddler['cpl.parent-plugin'] as string | undefined,
    'core-version': infoTiddler['cpl.core-version'] as string | undefined,
    'requires-reload': ifPluginRequiresReload(pluginTiddler),
    category: (infoTiddler['cpl.category'] || 'Unknown') as string,
    tags: (infoTiddler['cpl.tags'] || '') as string,
    type: 'application/json',
  };
  mergeField('version', pluginTiddler, newInfoTiddler, $tw.version);
  mergeField('type', pluginTiddler, newInfoTiddler, 'application/json');
  mergeField('plugin-type', pluginTiddler, newInfoTiddler, 'plugin');
  mergeField(
    'author',
    pluginTiddler,
    newInfoTiddler,
    pluginTiddler.title.split('/')[2],
  );
  mergeField(
    'name',
    pluginTiddler,
    newInfoTiddler,
    pluginTiddler.title.split('/')[3],
  );
  $tw.utils.each(mergingFields, function (fieldName) {
    mergeField(fieldName, pluginTiddler, newInfoTiddler);
  });
  if (
    !newInfoTiddler.readme ||
    (newInfoTiddler.readme as string).trim() === ''
  ) {
    newInfoTiddler.readme = getReadmeFromPlugin(pluginTiddler);
  }
  if (
    infoTiddler['cpl.documentation'] &&
    infoTiddler['cpl.documentation'] !== ''
  ) {
    newInfoTiddler.readme = `<$button class="tc-btn-invisible" style="overflow: hidden;white-space: pre;width: 100%;" message="tm-open-external-window" param="${infoTiddler['cpl.documentation']}">{{$:/core/images/home-button}} <$text text="${infoTiddler['cpl.documentation']}"/></$button>\n\n${newInfoTiddler.readme}`;
  }
  if (infoTiddler['cpl.source'] && infoTiddler['cpl.source'] !== '') {
    newInfoTiddler.readme = `<$button class="tc-btn-invisible" style="overflow: hidden;white-space: pre;width: 100%;" message="tm-open-external-window" param="${infoTiddler['cpl.source']}">{{$:/core/images/github}} <$text text="${infoTiddler['cpl.source']}"/></$button>\n\n${newInfoTiddler.readme}`;
  }
  // 改成只保留指定的字段
  const fields = Object.keys(
    newInfoTiddler,
  ) as unknown as (keyof typeof newInfoTiddler)[];
  for (let i = 0, { length } = fields; i < length; i++) {
    const field = fields[i];
    if (
      newInfoTiddler[field] === undefined ||
      newInfoTiddler[field] === '' ||
      ['source'].indexOf(field) > -1
    ) {
      delete newInfoTiddler[field];
    }
  }
  return { pluginTiddler, newInfoTiddler };
};
