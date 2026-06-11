import { tw, type RootWidgetEvent } from './types';
import {
  API_STATUS_TIDDLER,
  API_TYPE_TIDDLER,
  API_MESSAGE_TIDDLER,
  REPO_TYPE_TIDDLER,
} from './constants';

export const getEventParam = (
  event: RootWidgetEvent,
  name: string,
): string | undefined => {
  const value = event.paramObject?.[name];
  return typeof value === 'string' ? value : undefined;
};

export const clearServerTempState = (): void => {
  for (const title of tw.wiki.filterTiddlers('[prefix[$:/temp/CPL-Server/]]')) {
    tw.wiki.deleteTiddler(title);
  }
};

export const setApiStatus = (
  status: string,
  type: string,
  message: string,
): void => {
  const timestamp = String(Date.now());

  tw.wiki.addTiddler({
    title: API_STATUS_TIDDLER,
    text: status,
    timestamp,
  });
  tw.wiki.addTiddler({
    title: API_TYPE_TIDDLER,
    text: type || 'unknown',
    timestamp,
  });
  tw.wiki.addTiddler({
    title: API_MESSAGE_TIDDLER,
    text: message || '',
    timestamp,
  });
};

export const setRepoType = (type: string): void => {
  tw.wiki.addTiddler({
    title: REPO_TYPE_TIDDLER,
    text: type || 'unknown',
    timestamp: String(Date.now()),
  });
};
