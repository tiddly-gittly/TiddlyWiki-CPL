import { tw, type RootWidgetEvent, type HttpErrorLike } from './types';
import { API_STATUS_TIDDLER, API_TYPE_TIDDLER, API_MESSAGE_TIDDLER } from './constants';

export const getEventParam = (event: RootWidgetEvent, name: string): string | undefined => {
  const value = event.paramObject?.[name];
  return typeof value === 'string' ? value : undefined;
};

export const clearServerTempState = (): void => {
  for (const title of tw.wiki.filterTiddlers('[prefix[$:/temp/CPL-Server/]]')) {
    tw.wiki.deleteTiddler(title);
  }
};

export const setApiStatus = (status: string, type: string, message: string): void => {
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

export const getErrorMessage = (error: unknown): string => {
  if (!error) {
    return 'Request failed';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const httpError = error as HttpErrorLike;
  if (httpError.message) {
    return httpError.message;
  }
  if (httpError.status !== undefined) {
    return `HTTP ${httpError.status}${httpError.statusText ? ` ${httpError.statusText}` : ''}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

export const hasPluginWikiTag = (tags: unknown): boolean => {
  if (Array.isArray(tags)) {
    return tags.includes('$:/tags/PluginWiki');
  }
  if (typeof tags === 'string') {
    return tw.utils.parseStringArray(tags).includes('$:/tags/PluginWiki');
  }

  return false;
};

export const getViewedPluginTitle = (): string | null => {
  const historyTiddler = tw.wiki.getTiddler('$:/HistoryList');
  const currentTitle = historyTiddler?.fields?.['current-tiddler'];

  if (typeof currentTitle !== 'string' || currentTitle.length === 0) {
    return null;
  }

  const tiddler = tw.wiki.getTiddler(currentTitle);
  if (!tiddler || !hasPluginWikiTag(tiddler.fields.tags)) {
    return null;
  }

  const pluginTitle = tiddler.fields['cpl.title'];
  return typeof pluginTitle === 'string' && pluginTitle.length > 0 ? pluginTitle : null;
};
