import { tw, type CPLServerApi, type JsonObject } from './types';
import { rawApiRequest } from './http';
import { setApiStatus, clearServerTempState, setRepoType } from './utilities';
import {
  getConfiguredMirrorType,
  getCurrentMirrorEntry,
  getCurrentServerEntry,
  getCurrentServerOrigin,
  apiAvailability,
  lastMirrorEntry,
  setApiAvailability,
  setLastMirrorEntry,
  type ApiServerType,
} from './state';

const setAnonymousUserStatus = (): void => {
  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Server/user-status',
    text: 'anonymous',
  });
  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Server/is-admin',
    text: 'no',
  });
};

const getMirrorLabel = (): string => {
  const entry = getCurrentServerEntry();
  try {
    return new URL(entry, window.location.origin).host || entry;
  } catch {
    return entry;
  }
};

export const probeApiAvailability = (
  callback: (serverType: ApiServerType) => void,
): void => {
  if (!getCurrentServerEntry()) {
    setApiAvailability(false);
    setApiStatus('unavailable', 'unknown', 'No CPL server is configured.');
    callback('unknown');
    return;
  }

  setApiStatus(
    'checking',
    'unknown',
    `Checking CPL server ${getMirrorLabel()}...`,
  );
  rawApiRequest<JsonObject>(
    'GET',
    `/stats/${encodeURIComponent('$:/plugins/Gk0Wk/CPL-Repo/__probe__')}`,
    null,
    error => {
      if (error) {
        setApiAvailability(false);
        setApiStatus(
          'unavailable',
          'unreachable',
          `Configured CPL server ${getCurrentServerOrigin()} is currently unreachable or unavailable.`,
        );
        callback('unreachable');
        return;
      }

      setApiAvailability(true);
      setApiStatus(
        'available',
        'server',
        `CPL server ${getMirrorLabel()} is available.`,
      );
      callback('server');
    },
  );
};

export const refreshMirrorCapabilityState = (
  cplServerApi: CPLServerApi,
): void => {
  const signature = `${getCurrentMirrorEntry()}|${getCurrentServerEntry()}`;
  if (signature === lastMirrorEntry && apiAvailability !== null) {
    return;
  }

  setLastMirrorEntry(signature);
  setApiAvailability(null);
  setRepoType(getConfiguredMirrorType());
  clearServerTempState();

  // Expose API base URL for Wikitext tm-http-request widgets
  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Server/api-base',
    text: getCurrentServerOrigin(),
  });

  probeApiAvailability(mirrorType => {
    if (mirrorType !== 'server') {
      setAnonymousUserStatus();
      return;
    }

    cplServerApi.getAuthConfig((configError, configData) => {
      if (!configError && configData?.githubClientId) {
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Server/github-client-id',
          text: String(configData.githubClientId),
        });
      }
    });

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
        tw.wiki.addTiddler({
          title: '$:/temp/CPL-Server/is-admin',
          text: data.isAdmin ? 'yes' : 'no',
        });
        return;
      }

      setAnonymousUserStatus();
    });
  });
};
