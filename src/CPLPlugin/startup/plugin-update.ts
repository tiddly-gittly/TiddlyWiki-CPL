import { tw } from './types';

export const name = 'cpl-update-check';
export const platforms = ['browser'];
export const after = ['startup'];
export const synchronous = true;

export const startup = (): void => {
  tw.rootWidget.addEventListener(
    'cpl-process-update-json',
    (event: unknown) => {
      const e = event as { paramObject?: Record<string, string> };
      const raw = e.paramObject?.data;
      if (!raw) {
        return undefined;
      }
      try {
        tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/updating', text: 'yes' });
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
          const lv = updatePlugins[title];
          if (!lv) {
            return false;
          }
          if (lv[1] && tw.utils.compareVersions(tw.version, lv[1].trim()) < 0) {
            return false;
          }
          const v = tw.wiki.getTiddler(title)?.fields.version;
          return !(
            typeof v === 'string' &&
            lv[0] &&
            tw.utils.compareVersions(v.trim(), lv[0].trim()) >= 0
          );
        });
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Repo/update-plugins',
          type: 'application/json',
          text: JSON.stringify(pluginsToShow.length > 0 ? pluginsToShow : []),
        });
        if (pluginsToShow.length > 0) {
          tw.wiki.addTiddler({
            title: '$:/temp/CPL-Repo/update-notification',
            text: 'yes',
            count: String(pluginsToShow.length),
          });
        }
      } catch (error) {
        console.error(error);
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Repo/updating',
          text: String(error),
        });
      }
      tw.wiki.deleteTiddler('$:/temp/CPL-Repo/updating');
      return undefined;
    },
  );
};
