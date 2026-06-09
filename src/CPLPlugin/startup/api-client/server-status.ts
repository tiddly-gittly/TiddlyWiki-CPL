import { tw, type CPLServerApi } from './types';
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

const TOUCH_PROBE_TOKEN_TITLE = '$:/temp/CPL-Server/probe-refresh-token';

/** Touch the probe token so the declarative BackgroundAction fires tm-http-request. */
const triggerProbe = (): void => {
  tw.wiki.addTiddler({
    title: TOUCH_PROBE_TOKEN_TITLE,
    text: String(Date.now()),
  });
};

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

/**
 * Sync the JS apiAvailability flag from the wikitext-maintained
 * $:/temp/CPL-Repo/server-type tiddler.
 */
const syncApiAvailabilityFromTiddler = (): void => {
  const type = tw.wiki.getTiddlerText('$:/temp/CPL-Repo/server-type', '');
  if (type === 'server') {
    setApiAvailability(true);
  } else if (type === 'unreachable' || type === 'unknown') {
    setApiAvailability(false);
  } else {
    // Still checking or no tiddler — keep current value
  }
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

  // Expose API base URL so declarative tm-http-request widgets can get it
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

  // Probe server availability via declarative wikitext BackgroundAction
  setApiStatus('checking', 'unknown', 'Checking CPL server...');
  triggerProbe();
};

export const setupStatusSync = (cplServerApi: CPLServerApi): void => {
  // When the declarative background action sets server-type, sync apiAvailability
  tw.wiki.addEventListener('change', changes => {
    if ($tw.utils.hop(changes, '$:/temp/CPL-Repo/server-type')) {
      syncApiAvailabilityFromTiddler();

      const type = tw.wiki.getTiddlerText('$:/temp/CPL-Repo/server-type', '');
      if (type === 'server') {
        // Server probe succeeded — check auth
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
      } else {
        setAnonymousUserStatus();
      }
    }
  });
};
