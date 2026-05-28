import { cpl } from './bridge';
import { tw } from './types';

export interface UpdateController {
  update: (options?: {
    notify?: boolean;
    autoInstall?: boolean;
  }) => Promise<string[]>;
  rescheduleAutoUpdate: () => void;
  initializeAutoUpdate: () => void;
}

export const createUpdateController = (): UpdateController => {
  let lastUpdateTime = -1;
  let updateLock = false;
  let autoUpdateInterval: ReturnType<typeof setInterval> | undefined;
  let autoTimeout: ReturnType<typeof setTimeout> | undefined;

  const getAutoUpdateTime = (): number =>
    Number.parseInt(
      tw.wiki.getTiddlerText(
        '$:/plugins/Gk0Wk/CPL-Repo/config/auto-update-intervals-minutes',
        '-1',
      ),
      10,
    ) || -1;

  const update = async (options?: {
    notify?: boolean;
    autoInstall?: boolean;
  }): Promise<string[]> => {
    const notify = options?.notify;
    const autoInstall = options?.autoInstall === true;
    try {
      if (updateLock) {
        return [];
      }

      updateLock = true;
      lastUpdateTime = Date.now();
      tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/updaing', text: 'yes' });

      const updatePromise = cpl('Update');
      const plugins = tw.wiki.filterTiddlers(
        tw.wiki.getTiddlerText(
          '$:/plugins/Gk0Wk/CPL-Repo/config/update-filter',
          '',
        ),
      );

      return updatePromise
        .then(text => {
          const updatePlugins = JSON.parse(text) as Record<
            string,
            [string, string?]
          >;
          const pluginsToShow = plugins.filter(title => {
            const latestVersion = updatePlugins[title];
            if (!latestVersion) {
              return false;
            }
            if (
              latestVersion[1] &&
              tw.utils.compareVersions(tw.version, latestVersion[1].trim()) < 0
            ) {
              return false;
            }

            const version = tw.wiki.getTiddler(title)?.fields.version;
            return !(
              typeof version === 'string' &&
              latestVersion[0] &&
              tw.utils.compareVersions(
                version.trim(),
                latestVersion[0].trim(),
              ) >= 0
            );
          });

          if (pluginsToShow.length > 0) {
            tw.wiki.addTiddler({
              title: '$:/temp/CPL-Repo/update-plugins',
              type: 'application/json',
              text: JSON.stringify(pluginsToShow),
            });
            if (notify !== false) {
              tw.wiki.addTiddler({
                title: '$:/temp/CPL-Repo/update-notification',
                text: 'yes',
                count: String(pluginsToShow.length),
              });
            }

            if (autoInstall) {
              tw.rootWidget.dispatchEvent({
                type: 'cpl-install-plugin-request',
                paramObject: {
                  titles: tw.utils.stringifyList(pluginsToShow),
                  'auto-confirm': 'yes',
                  version: 'latest',
                },
                widget: tw.rootWidget,
              });
            }
          } else {
            tw.wiki.deleteTiddler('$:/temp/CPL-Repo/update-plugins');
          }

          tw.wiki.deleteTiddler('$:/temp/CPL-Repo/updaing');
          updateLock = false;
          return pluginsToShow;
        })
        .catch(error => {
          console.error(error);
          tw.wiki.addTiddler({
            title: '$:/temp/CPL-Repo/updaing',
            text: String(error),
          });
          updateLock = false;
          return [];
        });
    } catch (error) {
      console.error(error);
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/updaing',
        text: String(error),
      });
      updateLock = false;
      return [];
    }
  };

  const rescheduleAutoUpdate = (): void => {
    const time = getAutoUpdateTime();
    if (autoUpdateInterval !== undefined) {
      clearInterval(autoUpdateInterval);
    }
    if (autoTimeout !== undefined) {
      clearTimeout(autoTimeout);
    }
    autoUpdateInterval = undefined;
    autoTimeout = undefined;

    if (time > 0) {
      autoTimeout = setTimeout(
        () => {
          void update();
          autoUpdateInterval = setInterval(() => {
            void update();
          }, time * 60_000);
        },
        lastUpdateTime === -1 ? 0 : time * 60_000 + lastUpdateTime - Date.now(),
      );
    }
  };

  const initializeAutoUpdate = (): void => {
    autoTimeout = setTimeout(() => {
      const time = getAutoUpdateTime();
      if (time > 0) {
        void update();
        autoUpdateInterval = setInterval(() => {
          void update();
        }, time * 60_000);
      }
    }, 3_000);
  };

  return {
    update,
    rescheduleAutoUpdate,
    initializeAutoUpdate,
  };
};
