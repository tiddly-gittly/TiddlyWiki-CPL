import { cpl } from './core/bridge';
import { fetchPluginFromStaticMirrors } from './core/static-mirror-fetch';
import { browserRuntime, tw, type RootWidgetEvent } from './core/types';
import { createIndexController } from './core/index';
import { createInstallController } from './core/install';
import { createUpdateController } from './core/update';

export const name = 'cpl-repo-init';
export const platforms = ['browser'];
export const after = ['render'];
export const synchronous = true;

export const startup = (): void => {
  browserRuntime.__tiddlywiki_cpl__ = cpl;

  const installController = createInstallController();
  let indexController: ReturnType<typeof createIndexController> | undefined;

  const updateController = createUpdateController();
  indexController = createIndexController();

  tw.wiki.addEventListener('change', changes => {
    if (
      tw.utils.hop(
        changes,
        '$:/plugins/Gk0Wk/CPL-Repo/config/auto-update-intervals-minutes',
      )
    ) {
      updateController.rescheduleAutoUpdate();
    }

    if (tw.titleWidgetNode?.refresh(changes, tw.titleContainer ?? null, null)) {
      document.title = tw.titleContainer?.textContent ?? document.title;
    }
  });

  updateController.initializeAutoUpdate();

  tw.rootWidget.addEventListener(
    'cpl-update-check',
    (_event: RootWidgetEvent): undefined => {
      void updateController.update();
      return undefined;
    },
  );
  tw.rootWidget.addEventListener(
    'cpl-install-plugin-request',
    (event: RootWidgetEvent): undefined => {
      void installController.handleInstallPluginRequest(event);
      return undefined;
    },
  );
  tw.rootWidget.addEventListener(
    'cpl-install-plugin',
    (event: RootWidgetEvent): undefined => {
      void installController.handleInstallPlugin(event);
      return undefined;
    },
  );
  tw.rootWidget.addEventListener(
    'cpl-get-plugins-index',
    (_event: RootWidgetEvent): undefined => {
      void indexController?.handleGetPluginsIndex();
      return undefined;
    },
  );
  tw.rootWidget.addEventListener(
    'cpl-query-plugin',
    (event: RootWidgetEvent): undefined => {
      void indexController?.handleQueryPlugin(event);
      return undefined;
    },
  );
  tw.rootWidget.addEventListener(
    'cpl-search-plugins',
    (event: RootWidgetEvent): undefined => {
      indexController?.handleSearchPlugins(event);
      return undefined;
    },
  );
  tw.rootWidget.addEventListener(
    'cpl-download-plugin',
    (event: RootWidgetEvent): undefined => {
      const pluginTitle = event.paramObject?.plugin as string | undefined;
      const version = event.paramObject?.version as string | undefined;
      if (!pluginTitle) {
        return undefined;
      }
      void (async (): Promise<void> => {
        try {
          // Static mirrors first; fall back to bridge (may be server) if both fail.
          let text: string;
          try {
            text = await fetchPluginFromStaticMirrors(pluginTitle);
          } catch {
            text = await cpl('Install', {
              plugin: pluginTitle,
              version: version ?? 'latest',
            });
          }

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
      })();
      return undefined;
    },
  );
};
