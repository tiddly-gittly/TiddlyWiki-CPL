import type { ITiddlerFields, ITiddlyWiki } from 'tiddlywiki';
import { getReadmeFromPlugin, ifPluginRequiresReload } from './tiddler-utils';

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
    title: infoTiddler['cpl.title'],
    author: infoTiddler['cpl.author'],
    name: infoTiddler['cpl.name'],
    description: infoTiddler['cpl.description'],
    readme: infoTiddler['cpl.readme'],
    version: infoTiddler['cpl.version'],
    'plugin-type': infoTiddler['cpl.type'],
    icon: infoTiddler['cpl.icon'],
    dependents:
      (infoTiddler['cpl.dependents'] as any)?.split?.('\n')?.join?.(' ') ?? '',
    'parent-plugin': infoTiddler['cpl.parent-plugin'],
    'core-version': infoTiddler['cpl.core-version'],
    'requires-reload': ifPluginRequiresReload(pluginTiddler),
  } as Record<string, unknown>;
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
  const fields = Object.keys(newInfoTiddler);
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
