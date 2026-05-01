import { cpl } from './bridge';
import { tw } from './types';

export interface UpdateController {
  update: (notify?: boolean) => void;
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

  const update = (notify?: boolean): void => {
    try {
      if (updateLock) {
        return;
      }

      updateLock = true;
      lastUpdateTime = Date.now();
      tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/updaing', text: 'yes' });

      const updatePromise = cpl('Update');
      const plugins = tw.wiki.filterTiddlers(
        tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/config/update-filter', ''),
      );

      updatePromise
        .then(text => {
          const updatePlugins = JSON.parse(text) as Record<string, [string, string?]>;
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
              tw.utils.compareVersions(version.trim(), latestVersion[0].trim()) >= 0
            );
          });

          if (pluginsToShow.length > 0) {
            tw.wiki.addTiddler({
              title: '$:/temp/CPL-Repo/update-plugins',
              type: 'application/json',
              text: JSON.stringify(pluginsToShow),
            });
            if (notify !== false) {
              const notificationDuration = tw.config.preferences.notificationDuration;
              tw.config.preferences.notificationDuration = 10_000;
              tw.notifier.display('$:/plugins/Gk0Wk/CPL-Repo/notifications/update-notify-template', {
                variables: { updateCount: pluginsToShow.length },
              });
              tw.config.preferences.notificationDuration = notificationDuration;
            }
          }

          tw.wiki.deleteTiddler('$:/temp/CPL-Repo/updaing');
          updateLock = false;
        })
        .catch(error => {
          console.error(error);
          tw.wiki.addTiddler({
            title: '$:/temp/CPL-Repo/updaing',
            text: String(error),
          });
          updateLock = false;
        });
    } catch (error) {
      console.error(error);
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/updaing',
        text: String(error),
      });
      updateLock = false;
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
      autoTimeout = setTimeout(() => {
        update();
        autoUpdateInterval = setInterval(() => {
          update();
        }, time * 60_000);
      }, lastUpdateTime === -1 ? 0 : time * 60_000 + lastUpdateTime - Date.now());
    }
  };

  const initializeAutoUpdate = (): void => {
    autoTimeout = setTimeout(() => {
      const time = getAutoUpdateTime();
      if (time > 0) {
        update();
        autoUpdateInterval = setInterval(() => {
          update();
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