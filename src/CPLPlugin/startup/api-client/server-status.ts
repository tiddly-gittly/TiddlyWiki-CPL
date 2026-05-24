import { tw, type CPLServerApi, type JsonObject } from './types';
import { rawApiRequest } from './http';
import { setApiStatus, clearServerTempState } from './utilities';
import {
  getConfiguredMirrorType,
  getCurrentMirrorEntry,
  getMirrorOrigin,
  apiAvailability,
  lastMirrorEntry,
  setApiAvailability,
  setLastMirrorEntry,
  type MirrorType,
} from './state';

const setAnonymousUserStatus = (): void => {
  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Server/user-status',
    text: 'anonymous',
  });
};

const getMirrorLabel = (): string => {
  const entry = getCurrentMirrorEntry();
  try {
    return new URL(entry, window.location.origin).host || entry;
  } catch {
    return entry;
  }
};

export const probeApiAvailability = (callback: (mirrorType: MirrorType) => void): void => {
  const configuredMirrorType = getConfiguredMirrorType();
  if (configuredMirrorType === 'static') {
    setApiAvailability(false);
    setApiStatus(
      'unavailable',
      'static',
      'Selected mirror is a static mirror without CPL server features.',
    );
    callback('static');
    return;
  }

  setApiStatus(
    'checking',
    configuredMirrorType === 'server' ? 'server' : 'unknown',
    configuredMirrorType === 'server'
      ? `Checking server mirror ${getMirrorLabel()}...`
      : 'Checking mirror capabilities...',
  );
  rawApiRequest<JsonObject>(
    'GET',
    `/stats/${encodeURIComponent('$:/plugins/Gk0Wk/CPL-Repo/__probe__')}`,
    null,
    error => {
      if (error) {
        const mirrorType = configuredMirrorType === 'server' ? 'unreachable' : 'unknown';
        setApiAvailability(false);
        setApiStatus(
          'unavailable',
          mirrorType,
          configuredMirrorType === 'server'
            ? `Configured server mirror ${getMirrorOrigin()} is currently unreachable or unavailable.`
            : `Mirror ${getMirrorLabel()} does not expose CPL server features or is currently unreachable.`,
        );
        callback(mirrorType);
        return;
      }

      setApiAvailability(true);
      setApiStatus('available', 'server', 'Full CPL server features are available on this mirror.');
      callback('server');
    },
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
  probeApiAvailability(mirrorType => {
    if (mirrorType !== 'server') {
      setAnonymousUserStatus();
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

      setAnonymousUserStatus();
    });
  });
};
