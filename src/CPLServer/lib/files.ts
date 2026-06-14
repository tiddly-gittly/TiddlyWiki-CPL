export const sanitizePluginFileName = (title: string): string =>
  title.replace(/[\\/:*?"<>|]/g, '_').replace(/\.+$/g, '');

export const isSafePluginVersionFileName = (version: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(version) &&
  !version.includes('..');

export const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
