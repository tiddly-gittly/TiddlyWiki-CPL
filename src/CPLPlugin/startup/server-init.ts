import { tw } from './types';
import { SERVER_PROBE_REFRESH_TITLE } from './constants';
import { handleGithubLogin, handleOAuthCallback } from './oauth';

export const name = 'cpl-server-api-client';
export const platforms = ['browser'];
export const after = ['startup'];
export const synchronous = true;

const setupGithubLoginRequest = (): void => {
  tw.rootWidget.addEventListener('cpl-github-login', () => {
    handleGithubLogin();
    return undefined;
  });
};

export const startup = (): void => {
  // Backward-compat stub: e2e tests wait for $tw.cpl to be defined.
  // CPL now uses rootWidget.addEventListener() messages instead of
  // this API, so this is a minimal stub only.
  tw.cpl = {};

  // Force initial Wikitext-driven server config sync on startup.
  tw.wiki.addTiddler({
    title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo',
    text: tw.wiki.getTiddlerText(
      '$:/plugins/Gk0Wk/CPL-Repo/config/current-static-repo',
      '',
    ),
  });
  tw.wiki.addTiddler({
    title: '$:/plugins/Gk0Wk/CPL-Repo/config/current-server-repo',
    text: tw.wiki.getTiddlerText(
      '$:/plugins/Gk0Wk/CPL-Repo/config/current-server-repo',
      '',
    ),
  });

  tw.wiki.addTiddler({
    title: SERVER_PROBE_REFRESH_TITLE,
    text: String(Date.now()),
  });

  // Start Wikitext-driven server OAuth handling
  setupGithubLoginRequest();
  handleOAuthCallback();

  console.log('[CPL-Server] API Client initialized');
};
