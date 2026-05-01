export const sanitizePluginFileName = (title: string): string =>
  title.replace(/[\\/:*?"<>|]/g, '_').replace(/\.+$/g, '');

export const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');