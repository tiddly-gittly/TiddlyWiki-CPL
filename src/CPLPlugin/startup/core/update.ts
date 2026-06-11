import { tw } from './types';

const PLUGIN_UPDATE_RAW_TITLE = '$:/temp/CPL-Repo/plugin-update-raw';
const UPDATE_CHECK_REQUEST = '$:/temp/CPL-Repo/update-check-request';

export interface UpdateController {
  rescheduleAutoUpdate: () => void;
  initializeAutoUpdate: () => void;
}

export const createUpdateController = (): UpdateController => {
  let lastUpdateTime = -1;
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

  tw.wiki.addEventListener('change', changes => {
    if (!tw.utils.hop(changes, PLUGIN_UPDATE_RAW_TITLE)) {
      return;
    }
    const raw = tw.wiki.getTiddlerText(PLUGIN_UPDATE_RAW_TITLE, '');
    if (!raw) {
      return;
    }
    tw.wiki.deleteTiddler(PLUGIN_UPDATE_RAW_TITLE);
    try {
      tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/updaing', text: 'yes' });

      const updatePlugins = JSON.parse(raw) as Record<
        string,
        [string, string?]
      >;
      const plugins = tw.wiki.filterTiddlers(
        tw.wiki.getTiddlerText(
          '$:/plugins/Gk0Wk/CPL-Repo/config/update-filter',
          '',
        ),
      );

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
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Repo/update-notification',
          text: 'yes',
          count: String(pluginsToShow.length),
        });
      } else {
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Repo/update-plugins',
          type: 'application/json',
          text: JSON.stringify([]),
        });
      }
    } catch (error) {
      console.error(error);
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Repo/updaing',
        text: String(error),
      });
      return;
    }
    tw.wiki.deleteTiddler('$:/temp/CPL-Repo/updaing');
  });

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
          tw.wiki.addTiddler({
            title: UPDATE_CHECK_REQUEST,
            text: String(Date.now()),
          });
          autoUpdateInterval = setInterval(() => {
            tw.wiki.addTiddler({
              title: UPDATE_CHECK_REQUEST,
              text: String(Date.now()),
            });
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
        tw.wiki.addTiddler({
          title: UPDATE_CHECK_REQUEST,
          text: String(Date.now()),
        });
        autoUpdateInterval = setInterval(() => {
          tw.wiki.addTiddler({
            title: UPDATE_CHECK_REQUEST,
            text: String(Date.now()),
          });
        }, time * 60_000);
      }
    }, 3_000);
  };

  return {
    rescheduleAutoUpdate,
    initializeAutoUpdate,
  };
};
