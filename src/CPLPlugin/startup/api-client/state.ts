import {
  CPL_API_BASE,
  MIRROR_CONFIG_TITLE,
  MIRROR_SERVER_REPOS_TITLE,
  MIRROR_STATIC_REPOS_TITLE,
} from './constants';
import { tw } from './types';

export type MirrorType = 'server' | 'static' | 'unreachable' | 'unknown';

export let apiAvailability: boolean | null = null;
export let lastMirrorEntry: string | null = null;

const normalizeMirrorEntry = (entry: string): string => {
  try {
    return new URL(entry, window.location.origin).toString().replace(/\/$/, '');
  } catch {
    return entry.trim().replace(/\/$/, '');
  }
};

const getConfiguredMirrorEntries = (title: string): Set<string> =>
  new Set(
    tw.utils
      .parseStringArray(tw.wiki.getTiddlerText(title, ''))
      .map(normalizeMirrorEntry),
  );

export const setApiAvailability = (value: boolean | null): void => {
  apiAvailability = value;
};

export const setLastMirrorEntry = (value: string | null): void => {
  lastMirrorEntry = value;
};

export const getCurrentMirrorEntry = (): string =>
  tw.wiki.getTiddlerText(MIRROR_CONFIG_TITLE, '');

export const getMirrorOrigin = (entry = getCurrentMirrorEntry()): string => {
  try {
    return new URL(entry, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
};

export const getCurrentMirrorOrigin = (): string => getMirrorOrigin();

export const getCurrentMirrorApiBase = (): string => `${getCurrentMirrorOrigin()}${CPL_API_BASE}`;

export const getConfiguredMirrorType = (entry = getCurrentMirrorEntry()): MirrorType => {
  const normalizedEntry = normalizeMirrorEntry(entry);
  if (getConfiguredMirrorEntries(MIRROR_SERVER_REPOS_TITLE).has(normalizedEntry)) {
    return 'server';
  }

  if (getConfiguredMirrorEntries(MIRROR_STATIC_REPOS_TITLE).has(normalizedEntry)) {
    return 'static';
  }

  return 'unknown';
};
