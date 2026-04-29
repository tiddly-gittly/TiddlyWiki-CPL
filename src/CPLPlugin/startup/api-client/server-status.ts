import { tw, type CPLServerApi, type JsonObject } from './types';
import { rawApiRequest } from './http';
import { setApiStatus, clearServerTempState } from './utilities';
import { getCurrentMirrorEntry, apiAvailability, lastMirrorEntry, setApiAvailability, setLastMirrorEntry } from './state';

const getMirrorBaseUrl = (): string | undefined => {
  const entry = getCurrentMirrorEntry();
  if (!entry) {
    return undefined;
  }
  try {
    return new URL(entry).origin;
  } catch {
    return undefined;
  }
};

export const probeApiAvailability = (callback: (available: boolean) => void): void => {
  setApiStatus('checking', 'unknown', 'Checking mirror capabilities...');
  const baseUrl = getMirrorBaseUrl();
  rawApiRequest<JsonObject>(
    'GET',
    `/stats/${encodeURIComponent('$:/plugins/Gk0Wk/CPL-Repo/__probe__')}`,
    null,
    error => {
      if (error) {
        setApiAvailability(false);
        setApiStatus(
          'unavailable',
          'static',
          'Static mirror detected. Stats, ratings, comments, and login are unavailable here.',
        );
        callback(false);
        return;
      }

      setApiAvailability(true);
      setApiStatus('available', 'server', 'Full CPL server features are available on this mirror.');
      callback(true);
    },
    undefined,
    baseUrl,
  );
};

export const refreshMirrorCapabilityState = (cplServerApi: CPLServerApi): void => {
  const entry = getCurrentMirrorEntry();
  if (entry === lastMirrorEntry && apiAvailability !== null) {
    return;
  }

  setLastMirrorEntry(entry);
  setApiAvailability(null);
  clearServerTempState();
  probeApiAvailability(available => {
    if (!available) {
      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/user-status',
        text: 'anonymous',
      });
      return;
    }

    cplServerApi.checkAuthStatus((error, data) => {
      if (!error && data?.authenticated) {
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Server/user-status',
          text: 'authenticated',
        });
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Server/user',
          text: JSON.stringify(data.user),
          type: 'application/json',
        });
        return;
      }

      tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/user-status',
        text: 'anonymous',
      });
    });
  });
};
