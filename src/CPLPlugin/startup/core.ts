import { formatPluginTitle, getCurrentRepoEntry } from './core/bridge';
import './core/index';
import './core/install';
import './core/update';
import { tw } from './core/types';

export const name = 'cpl-repo-init';
export const platforms = ['browser'];
export const after = ['render'];
export const synchronous = true;

const DOWNLOAD_PLUGIN_REQUEST_TITLE =
  '$:/temp/CPL-Repo/download-plugin-request';

const getRequestFields = (
  changes: Record<string, unknown>,
  title: string,
): Record<string, string> | null => {
  if (!tw.utils.hop(changes, title)) {
    return null;
  }
  const fields = tw.wiki.getTiddler(title)?.fields;
  if (!fields || typeof fields.text !== 'string' || fields.text.length === 0) {
    return null;
  }
  const result: Record<string, string> = {};
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value === 'string') {
      result[field] = value;
    }
  }
  return result;
};

const clearRequest = (title: string): void => {
  tw.wiki.addTiddler({ title, text: '' });
};

const downloadPlugin = async (
  fields: Record<string, string>,
): Promise<void> => {
  const { plugin: pluginTitle, version } = fields;
  if (!pluginTitle) {
    return;
  }
  try {
    const response = await fetch(
      `${getCurrentRepoEntry()}/plugins/${formatPluginTitle(pluginTitle)}/${version ?? 'latest'}.json`,
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();

    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pluginTitle.replace(/[:/$]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('[CPL] Failed to download plugin:', error);
    tw.wiki.addTiddler({
      title: '$:/temp/CPL-Repo/download-plugin-status',
      text: String(error),
      plugin: pluginTitle,
    });
  }
};

export const startup = (): void => {
  tw.wiki.addEventListener('change', changes => {
    if (tw.titleWidgetNode?.refresh(changes, tw.titleContainer ?? null, null)) {
      document.title = tw.titleContainer?.textContent ?? document.title;
    }

    const downloadRequest = getRequestFields(
      changes,
      DOWNLOAD_PLUGIN_REQUEST_TITLE,
    );
    if (downloadRequest) {
      clearRequest(DOWNLOAD_PLUGIN_REQUEST_TITLE);
      void downloadPlugin(downloadRequest);
    }
  });
};
