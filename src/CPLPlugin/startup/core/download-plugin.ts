import { formatPluginTitle, getCurrentRepoEntry } from './bridge';
import { tw } from './types';

export const name = 'cpl-download-plugin';
export const platforms = ['browser'];
export const after = ['startup'];
export const synchronous = true;

const DOWNLOAD_PLUGIN_REQUEST_TITLE = '$:/temp/CPL-Repo/download-plugin-request';

export const startup = (): void => {
  // Sync page title when StoryList changes.
  tw.wiki.addEventListener('change', changes => {
    if (tw.titleWidgetNode?.refresh(changes, tw.titleContainer ?? null, null)) {
      document.title = tw.titleContainer?.textContent ?? document.title;
    }
  });

  tw.wiki.addEventListener('change', changes => {
    if (!tw.utils.hop(changes, DOWNLOAD_PLUGIN_REQUEST_TITLE)) return;
    const tiddler = tw.wiki.getTiddler(DOWNLOAD_PLUGIN_REQUEST_TITLE);
    if (!tiddler || typeof tiddler.fields.text !== 'string' || !tiddler.fields.text) return;
    tw.wiki.addTiddler({ title: DOWNLOAD_PLUGIN_REQUEST_TITLE, text: '' });

    const pluginTitle = typeof tiddler.fields.plugin === 'string' ? tiddler.fields.plugin
      : typeof tiddler.fields.title === 'string' ? tiddler.fields.title : '';
    if (!pluginTitle) return;
    const version = typeof tiddler.fields.version === 'string' ? tiddler.fields.version : 'latest';

    const url = `${getCurrentRepoEntry()}/plugins/${formatPluginTitle(pluginTitle)}/${version}.json`;

    fetch(url).then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
      const text = await response.text();
      const blob = new Blob([text], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${pluginTitle.replace(/[:/$]/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }).catch(error => {
      console.error('[CPL] Failed to download plugin:', error);
      tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/download-plugin-status', text: String(error), plugin: pluginTitle });
    });
  });
};
