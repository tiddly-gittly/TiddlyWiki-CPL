import { tw } from './types';
import { setApiStatus, clearServerTempState, setRepoType } from './utilities';
import {
  AUTH_CONFIG_RESPONSE_TITLE,
  AUTH_REFRESH_TITLE,
  AUTH_STATUS_RESPONSE_TITLE,
  SERVER_PROBE_REFRESH_TITLE,
  SERVER_PROBE_SUCCESS_TITLE,
} from './constants';
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

const PROBE_TIMEOUT_MS = 6000;
let probeTimer: ReturnType<typeof setTimeout> | null = null;

const clearProbeTimer = (): void => {
  if (!probeTimer) {
    return;
  }
  clearTimeout(probeTimer);
  probeTimer = null;
};

const touchToken = (title: string): string => {
  const value = String(Date.now());
  tw.wiki.addTiddler({
    title,
    text: value,
  });
  return value;
};

const parseJson = <T>(text: string): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const syncAuthConfig = (): void => {
  const response = tw.wiki.getTiddlerText(AUTH_CONFIG_RESPONSE_TITLE, '');
  if (!response) {
    tw.wiki.deleteTiddler('$:/temp/CPL-Server/github-client-id');
    return;
  }

  const data = parseJson<{ githubClientId?: string | null }>(response);
  const githubClientId =
    typeof data?.githubClientId === 'string' ? data.githubClientId.trim() : '';
  if (!githubClientId) {
    tw.wiki.deleteTiddler('$:/temp/CPL-Server/github-client-id');
    return;
  }

  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Server/github-client-id',
    text: githubClientId,
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
  tw.wiki.deleteTiddler('$:/temp/CPL-Server/user');
};

const syncAuthStatus = (): void => {
  const response = tw.wiki.getTiddlerText(AUTH_STATUS_RESPONSE_TITLE, '');
  if (!response) {
    setAnonymousUserStatus();
    return;
  }

  const data = parseJson<{
    authenticated?: boolean;
    user?: unknown;
    isAdmin?: boolean;
  }>(response);
  if (!data?.authenticated) {
    setAnonymousUserStatus();
    return;
  }

  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Server/user-status',
    text: 'authenticated',
  });
  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Server/user',
    text: JSON.stringify(data.user ?? {}),
    type: 'application/json',
  });
  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Server/is-admin',
    text: data.isAdmin ? 'yes' : 'no',
  });
};

export const requestAuthRefresh = (): void => {
  touchToken(AUTH_REFRESH_TITLE);
};

export const refreshMirrorCapabilityState = (): void => {
  const signature = `${getCurrentMirrorEntry()}|${getCurrentServerEntry()}`;
  if (signature === lastMirrorEntry && apiAvailability !== null) {
    return;
  }

  setLastMirrorEntry(signature);
  setApiAvailability(null);
  const mirrorType = getConfiguredMirrorType();
  setRepoType(mirrorType);
  clearServerTempState();
  clearProbeTimer();

  // Expose API base URL for Wikitext tm-http-request widgets
  const serverOrigin = getCurrentServerOrigin();
  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Server/api-base',
    text: serverOrigin,
  });

  // Mirror type and server type are independent:
  //   - mirrorType controls database browsing (static vs server)
  //   - serverType controls feature server availability (comments, ratings, login)
  // Always probe the feature server regardless of mirror type.

  if (!serverOrigin) {
    // No server configured at all
    if (mirrorType === 'static') {
      setApiAvailability(true);
      setApiStatus(
        'available',
        'static',
        'Static mirror is available for plugin browsing.',
      );
    } else {
      setApiAvailability(false);
      setApiStatus('unavailable', 'unknown', 'No CPL server is configured.');
    }
    tw.wiki.deleteTiddler('$:/temp/CPL-Server/github-client-id');
    setAnonymousUserStatus();
    return;
  }

  // Probe server availability — use server origin, not mirror origin
  tw.wiki.deleteTiddler(SERVER_PROBE_SUCCESS_TITLE);
  setApiStatus('checking', 'unknown', 'Checking CPL server...');
  const probeToken = touchToken(SERVER_PROBE_REFRESH_TITLE);
  probeTimer = setTimeout(() => {
    const successToken = tw.wiki.getTiddlerText(SERVER_PROBE_SUCCESS_TITLE, '');
    if (successToken === probeToken) {
      return;
    }

    setApiAvailability(false);
    setApiStatus(
      'unavailable',
      'unreachable',
      `CPL server ${serverOrigin} is unreachable.`,
    );
    tw.wiki.deleteTiddler('$:/temp/CPL-Server/github-client-id');
    setAnonymousUserStatus();
  }, PROBE_TIMEOUT_MS);
};

export const setupStatusSync = (): void => {
  tw.wiki.addEventListener('change', changes => {
    if ($tw.utils.hop(changes, SERVER_PROBE_SUCCESS_TITLE)) {
      clearProbeTimer();
      setApiAvailability(true);
      setApiStatus('available', 'server', 'CPL server is available.');
      requestAuthRefresh();
    }

    if ($tw.utils.hop(changes, AUTH_CONFIG_RESPONSE_TITLE)) {
      syncAuthConfig();
    }

    if ($tw.utils.hop(changes, AUTH_STATUS_RESPONSE_TITLE)) {
      syncAuthStatus();
    }
  });
};
