import { tw } from './api-client/types';
import { SERVER_PROBE_REFRESH_TITLE } from './api-client/constants';
import { setupCommentJsonProcessor } from './api-client/comment-processor';
import { handleGithubLogin, handleOAuthCallback } from './api-client/oauth';
import { startBuildStatusPolling } from './build-status-poll';

export const name = 'cpl-server-api-client';
export const platforms = ['browser'];
export const after = ['startup'];
export const synchronous = true;

const GITHUB_LOGIN_REQUEST_TITLE = '$:/temp/CPL-Server/github-login-request';

const setupGithubLoginRequest = (): void => {
  tw.wiki.addEventListener('change', changes => {
    if (!tw.utils.hop(changes, GITHUB_LOGIN_REQUEST_TITLE)) {
      return;
    }
    const request = tw.wiki.getTiddlerText(GITHUB_LOGIN_REQUEST_TITLE, '');
    if (!request) {
      return;
    }
    tw.wiki.addTiddler({ title: GITHUB_LOGIN_REQUEST_TITLE, text: '' });
    handleGithubLogin();
  });
};

export const startup = (): void => {
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

  // Start polling build status for the badge widget
  startBuildStatusPolling();

  // Process comment JSON into individual tiddlers for safe filter iteration
  setupCommentJsonProcessor();
  setupGithubLoginRequest();
  handleOAuthCallback();

  console.log('[CPL-Server] API Client initialized');
};
