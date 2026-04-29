import {
  cpl,
  CURRENT_REPO_TITLE,
  getCurrentRepoEntry,
  getPreviousRepoEntry,
  setPreviousRepoEntry,
} from './core/bridge';
import { browserRuntime, tw, type RootWidgetEvent } from './core/types';
import { createIndexController } from './core/index';
import { createInstallController } from './core/install';
import { createMirrorController } from './core/mirror';
import { createUpdateController } from './core/update';

export const name = 'cpl-repo-init';
export const platforms = ['browser'];
export const after = ['render'];
export const synchronous = true;

export const startup = (): void => {
  browserRuntime.__tiddlywiki_cpl__ = cpl;
  setPreviousRepoEntry(getCurrentRepoEntry());

  const installController = createInstallController();
  let indexController: ReturnType<typeof createIndexController> | undefined;

  const triggerMirrorRefresh = (): void => {
    tw.wiki.addTiddler({
      title: '$:/temp/CPL-Repo/plugins-index-refresh-requested',
      text: 'yes',
    });
    tw.rootWidget.dispatchEvent({
      type: 'cpl-get-plugins-index',
      paramObject: {},
      widget: tw.rootWidget,
    });
  };

  const mirrorController = createMirrorController({
    isBusy: () =>
      installController.isInstallRequestPending() ||
      installController.isInstallPending() ||
      indexController?.isBusy() === true,
    onSwitchRequested: triggerMirrorRefresh,
  });

  const updateController = createUpdateController();
  indexController = createIndexController({
    onIndexLoaded: mirrorController.completePendingSwitch,
    onIndexLoadFailed: mirrorController.failPendingSwitch,
  });

  mirrorController.setMirrorSwitchStatus('ready', '');

  tw.wiki.addEventListener('change', changes => {
    if (tw.utils.hop(changes, CURRENT_REPO_TITLE)) {
      const currentEntry = getCurrentRepoEntry();
      mirrorController.handleMirrorSwitch(
        currentEntry,
        getPreviousRepoEntry() ?? currentEntry,
      );
    }

    if (
      tw.utils.hop(changes, '$:/plugins/Gk0Wk/CPL-Repo/config/auto-update-intervals-minutes')
    ) {
      updateController.rescheduleAutoUpdate();
    }

    if (tw.titleWidgetNode?.refresh(changes, tw.titleContainer ?? null, null)) {
      document.title = tw.titleContainer?.textContent ?? document.title;
    }
  });

  updateController.initializeAutoUpdate();

  tw.rootWidget.addEventListener('cpl-update-check', (_event: RootWidgetEvent): undefined => {
    updateController.update();
    return undefined;
  });
  tw.rootWidget.addEventListener(
    'cpl-install-plugin-request',
    (event: RootWidgetEvent): undefined => {
      void installController.handleInstallPluginRequest(event);
      return undefined;
    },
  );
  tw.rootWidget.addEventListener('cpl-install-plugin', (event: RootWidgetEvent): undefined => {
    void installController.handleInstallPlugin(event);
    return undefined;
  });
  tw.rootWidget.addEventListener('cpl-get-plugins-index', (_event: RootWidgetEvent): undefined => {
    void indexController?.handleGetPluginsIndex();
    return undefined;
  });
  tw.rootWidget.addEventListener('cpl-query-plugin', (event: RootWidgetEvent): undefined => {
    void indexController?.handleQueryPlugin(event);
    return undefined;
  });
  tw.rootWidget.addEventListener('cpl-search-plugins', (event: RootWidgetEvent): undefined => {
    indexController?.handleSearchPlugins(event);
    return undefined;
  });
};
