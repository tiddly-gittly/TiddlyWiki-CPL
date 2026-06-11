import {
  LEGACY_MIRROR_CONFIG_TITLE,
  STATIC_REPO_CONFIG_TITLE,
} from './constants';
import { tw } from './types';

export const DEFAULT_REPO_ENTRY = 'https://tw-cpl.netlify.app/repo';
export const CURRENT_REPO_TITLE = STATIC_REPO_CONFIG_TITLE;

export const getCurrentRepoEntry = (): string => {
  if (!tw.wiki || typeof tw.wiki.getTiddlerText !== 'function') {
    return DEFAULT_REPO_ENTRY;
  }

  for (const includeShadow of [false, true]) {
    for (const title of [CURRENT_REPO_TITLE, LEGACY_MIRROR_CONFIG_TITLE]) {
      const value = tw.wiki.getTiddlerText(title, '').trim();
      if (!value) {
        continue;
      }
      if (!includeShadow && !tw.wiki.tiddlerExists(title)) {
        continue;
      }
      return value;
    }
  }

  return DEFAULT_REPO_ENTRY;
};

/**
 * Transform a TiddlyWiki plugin title into the filename used by the static
 * library, matching the build-time formatTitle() in scripts/utils/tiddler.ts.
 */
export const formatPluginTitle = (title: string): string =>
  encodeURIComponent(
    title
      .replace('$:/plugins/', '')
      .replace('$:/languages/', 'languages_')
      .replace('$:/themes/', 'themes_')
      .replace(/[:/<>"|?*]/g, '_'),
  );
