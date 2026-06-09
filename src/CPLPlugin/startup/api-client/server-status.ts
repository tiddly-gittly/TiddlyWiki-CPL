import { tw, type CPLServerApi } from './types';
import {
  ALL_PLUGIN_STATS_REFRESH_TITLE,
  PLUGIN_ACTIVITY_REFRESH_TITLE,
} from './constants';
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

const touchRefreshToken = (title: string): void => {
  tw.wiki.addTiddler({
    title,
    text: String(Date.now()),
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
  const serverEntry = getCurrentServerEntry();
  if (!serverEntry) {
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

  // Probe against the configured SERVER origin (dropdown #2), NOT the
  // static mirror origin (dropdown #1).  rawApiRequest uses
  // getCurrentMirrorApiBase() which derives from the static mirror —
  // that would probe Netlify/GitHub Pages which never have /cpl/ APIs.
  const probeUrl = `${getCurrentServerOrigin()}/cpl/stats/${encodeURIComponent('$:/plugins/Gk0Wk/CPL-Repo/__probe__')}`;
  fetch(probeUrl, { method: 'GET', credentials: 'include' })
    .then(async response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      // Consume body to avoid dangling promise warnings
      await response.text();

      setApiAvailability(true);
      setApiStatus(
        'available',
        'server',
        `CPL server ${getMirrorLabel()} is available.`,
      );
      touchRefreshToken(ALL_PLUGIN_STATS_REFRESH_TITLE);
      touchRefreshToken(PLUGIN_ACTIVITY_REFRESH_TITLE);
      callback('server');
    })
    .catch(error => {
      setApiAvailability(false);
      setApiStatus(
        'unavailable',
        'unreachable',
        `Configured CPL server ${getCurrentServerOrigin()} is currently unreachable or unavailable.`,
      );
      callback('unreachable');
    });
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
  const mirrorType = getConfiguredMirrorType();
  setRepoType(mirrorType);
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
