import { MIRROR_CONFIG_TITLE } from './constants';
import { tw } from './types';

export let apiAvailability: boolean | null = null;
export let lastMirrorEntry: string | null = null;

export const setApiAvailability = (value: boolean | null): void => {
  apiAvailability = value;
};

export const setLastMirrorEntry = (value: string | null): void => {
  lastMirrorEntry = value;
};

export const getCurrentMirrorEntry = (): string =>
  tw.wiki.getTiddlerText(MIRROR_CONFIG_TITLE, '');
