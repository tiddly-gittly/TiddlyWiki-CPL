/**
 * GitHub OAuth flow handler with CSRF state validation.
 */

import { tw, type OAuthResponse } from './types';

const OAUTH_STATE_KEY = 'cpl-oauth-state';
const OAUTH_RETURN_KEY = 'cpl-oauth-return';

const getCurrentServerOrigin = (): string => {
  const configuredRepo = tw.wiki
    .getTiddlerText(
      '$:/plugins/Gk0Wk/CPL-Repo/config/current-server-repo',
      tw.wiki.getTiddlerText(
        '$:/plugins/Gk0Wk/CPL-Repo/config/current-server',
        '',
      ),
    )
    .trim();
  const fromTempApiBase = tw.wiki
    .getTiddlerText('$:/temp/CPL-Server/api-base', '')
    .trim();

  const candidates = [fromTempApiBase, configuredRepo];
  for (const value of candidates) {
    if (!value) {
      continue;
    }
    try {
      const url = new URL(value, window.location.origin);
      const pathname = url.pathname.replace(/\/$/, '');
      if (pathname.endsWith('/repo')) {
        url.pathname = pathname.slice(0, -'/repo'.length) || '/';
      }
      return url.toString().replace(/\/$/, '');
    } catch {
      // try next candidate
    }
  }

  return '';
};

const generateOAuthState = (): string => {
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

/** Initiate GitHub OAuth login with CSRF nonce. */
export const handleGithubLogin = (): void => {
  const githubClientId = tw.wiki.getTiddlerText(
    '$:/temp/CPL-Server/github-client-id',
    '',
  );
  if (!githubClientId) {
    console.error(
      '[CPL-Server] GitHub client ID not available. Server may not have OAuth configured.',
    );
    return;
  }
  const state = generateOAuthState();
  try {
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    sessionStorage.setItem(OAUTH_RETURN_KEY, window.location.href);
  } catch {
    // sessionStorage may be unavailable in some contexts; continue without CSRF protection
  }
  const redirectUri = `${getCurrentServerOrigin()}/cpl/auth/github/callback`;
  const githubAuthParams = new URLSearchParams({
    client_id: githubClientId,
    redirect_uri: redirectUri,
    scope: 'read:user',
    state,
  });
  const githubAuthUrl = `https://github.com/login/oauth/authorize?${githubAuthParams.toString()}`;
  window.location.href = githubAuthUrl;
};

/** Process OAuth callback: validate state, exchange code, set user tiddlers. */
export const handleOAuthCallback = (): void => {
  if (window.location.pathname !== '/cpl/auth/github/callback') {
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  let returnUrl = '/';
  let stateValid = false;

  try {
    const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    const storedReturn = sessionStorage.getItem(OAUTH_RETURN_KEY);
    if (storedState && state === storedState) {
      stateValid = true;
      if (storedReturn) {
        returnUrl = storedReturn;
      }
    }
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_RETURN_KEY);
  } catch {
    // sessionStorage unavailable; treat as invalid
  }

  if (!stateValid) {
    console.error('[CPL-Server] OAuth state mismatch. Possible CSRF attack.');
    tw.wiki.addTiddler({
      title: '$:/temp/CPL-Server/oauth-error',
      text: 'OAuth state mismatch. Please try logging in again.',
    });
    window.location.replace('/');
    return;
  }

  if (!code) {
    window.location.replace('/');
    return;
  }

  tw.utils.httpRequest({
    url: `${getCurrentServerOrigin()}/cpl/auth/github/callback?code=${encodeURIComponent(
      code,
    )}`,
    type: 'GET',
    headers: { 'Content-Type': 'application/json' },
    callback: (error: unknown, response: string) => {
      if (error || !response) {
        return;
      }
      try {
        const data = JSON.parse(response) as OAuthResponse;
        if (!data.success) {
          return;
        }
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
          title: '$:/temp/CPL-Server/auth-refresh-token',
          text: String(Date.now()),
        });
        window.location.replace(returnUrl);
      } catch (parseError) {
        console.error(
          '[CPL-Server] Failed to parse auth response:',
          parseError,
        );
      }
    },
  });
};
