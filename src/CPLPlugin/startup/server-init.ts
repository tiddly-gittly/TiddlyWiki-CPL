import { tw } from './types';
import { SERVER_PROBE_REFRESH_TITLE } from './constants';
import { setupCommentJsonProcessor } from './comment-processor';
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

  // Process comment JSON into individual tiddlers for safe filter iteration
  setupCommentJsonProcessor();
  setupGithubLoginRequest();
  handleOAuthCallback();

  console.log('[CPL-Server] API Client initialized');
};
