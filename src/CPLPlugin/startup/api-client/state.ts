import {
  CPL_API_BASE,
  MIRROR_CONFIG_TITLE,
  MIRROR_SERVER_REPOS_TITLE,
  MIRROR_STATIC_REPOS_TITLE,
  SERVER_CONFIG_TITLE,
  SERVER_LIST_TITLE,
} from './constants';
import { tw } from './types';

export type MirrorType = 'server' | 'static' | 'unknown';
export type ApiServerType = 'server' | 'unreachable' | 'unknown';

export let apiAvailability: boolean | null = null;
export let lastMirrorEntry: string | null = null;

const SERVER_REPO_PATH = '/repo';

const normalizeUrlEntry = (entry: string): string => {
  try {
    return new URL(entry, window.location.origin).toString().replace(/\/$/, '');
  } catch {
    return entry.trim().replace(/\/$/, '');
  }
};

const normalizeServerMirrorEntry = (entry: string): string => {
  const normalizedEntry = normalizeUrlEntry(entry);
  try {
    const url = new URL(normalizedEntry, window.location.origin);
    const pathname = url.pathname.replace(/\/$/, '');
    if (pathname.endsWith(SERVER_REPO_PATH)) {
      url.pathname = pathname.slice(0, -SERVER_REPO_PATH.length) || '/';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return normalizedEntry.replace(/\/repo$/, '');
  }
};

const getConfiguredMirrorEntries = (
  title: string,
  normalizer = normalizeUrlEntry,
): Set<string> =>
  new Set(
    tw.utils
      .parseStringArray(tw.wiki.getTiddlerText(title, ''))
      .map(normalizer),
  );

const getConfiguredServerEntries = (): string[] =>
  tw.utils.parseStringArray(tw.wiki.getTiddlerText(SERVER_LIST_TITLE, ''));

export const setApiAvailability = (value: boolean | null): void => {
  apiAvailability = value;
};

export const setLastMirrorEntry = (value: string | null): void => {
  lastMirrorEntry = value;
};

export const getCurrentMirrorEntry = (): string =>
  tw.wiki.getTiddlerText(MIRROR_CONFIG_TITLE, '');

export const getCurrentServerEntry = (): string =>
  tw.wiki.getTiddlerText(
    SERVER_CONFIG_TITLE,
    getConfiguredServerEntries()[0] ?? '',
  );

export const getMirrorOrigin = (entry = getCurrentMirrorEntry()): string => {
  try {
    return new URL(entry, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
};

export const getServerOrigin = (entry = getCurrentServerEntry()): string => {
  try {
    return new URL(entry, window.location.origin).origin;
  } catch {
    return '';
  }
};

export const getCurrentMirrorOrigin = (): string => getMirrorOrigin();

export const getCurrentServerOrigin = (): string => getServerOrigin();

export const getCurrentMirrorApiBase = (): string =>
  `${getCurrentServerOrigin()}${CPL_API_BASE}`;

export const getConfiguredMirrorType = (
  entry = getCurrentMirrorEntry(),
): MirrorType => {
  const normalizedEntry = normalizeUrlEntry(entry);
  if (
    getConfiguredMirrorEntries(
      MIRROR_SERVER_REPOS_TITLE,
      normalizeServerMirrorEntry,
    ).has(normalizeServerMirrorEntry(entry))
  ) {
    return 'server';
  }

  if (
    getConfiguredMirrorEntries(MIRROR_STATIC_REPOS_TITLE).has(normalizedEntry)
  ) {
    return 'static';
  }

  return 'unknown';
};
