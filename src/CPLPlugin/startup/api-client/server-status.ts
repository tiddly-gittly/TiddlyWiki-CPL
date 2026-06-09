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

  if (mirrorType === 'static') {
    setApiAvailability(true);
    setApiStatus('available', 'static', 'Static mirror is available for plugin browsing.');
    setAnonymousUserStatus();
    return;
  }

  // Probe server availability — use server origin, not mirror origin
  setApiStatus('checking', 'unknown', 'Checking CPL server...');
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
          `CPL server ${getCurrentServerOrigin()} is unreachable.`,
        );
        setAnonymousUserStatus();
        return;
      }
      // Probe succeeded — server is available
      setApiAvailability(true);
      setApiStatus('available', 'server', 'CPL server is available.');

      // After successful probe, check auth status
      cplServerApi.getAuthConfig((configError, configData) => {
        if (!configError && configData?.githubClientId) {
          tw.wiki.addTiddler({
            title: '$:/temp/CPL-Server/github-client-id',
            text: String(configData.githubClientId),
          });
        }
      });

      cplServerApi.checkAuthStatus((authError, data) => {
        if (!authError && data?.authenticated) {
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
    },
    undefined,
    getCurrentServerOrigin() + '/cpl',
  );
};
