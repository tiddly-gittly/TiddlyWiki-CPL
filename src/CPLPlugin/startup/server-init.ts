import { tw } from './types';
import { SERVER_PROBE_REFRESH_TITLE } from './constants';
import { handleGithubLogin, handleOAuthCallback } from './oauth';

export const name = 'cpl-server-api-client';
export const platforms = ['browser'];
export const after = ['startup'];
export const synchronous = true;

const CPL_LAYOUT_TITLE = '$:/plugins/Gk0Wk/CPL-Repo/layout/layout';
const AUTO_LOAD_TRIGGER_TITLE = '$:/temp/CPL-Repo/auto-load-trigger';
const PLUGINS_INDEX_TITLE = '$:/temp/CPL-Repo/plugins-index';

const setupGithubLoginRequest = (): void => {
  tw.rootWidget.addEventListener('cpl-github-login', () => {
    handleGithubLogin();
    return undefined;
  });
};

export const startup = (): void => {
  // Backward-compat stub: e2e tests wait for $tw.cpl to be defined.
  tw.cpl = {};

  // Trigger a server probe on startup. The current-static-repo and
  // current-server-repo config tiddlers are plugin shadow tiddlers; we do
  // NOT create them here, because doing so would turn them into regular
  // user tiddlers that get saved back to the wiki folder. The
  // auto-sync-mirror-type / auto-sync-server-repo BackgroundActions will
  // derive the initial temp state from those shadows on startup.
  tw.wiki.addTiddler({
    title: SERVER_PROBE_REFRESH_TITLE,
    text: String(Date.now()),
  });

  // Auto-load plugin database when the user starts in the CPL layout.
  // We only create a temporary trigger tiddler; the actual fetch is gated
  // inside the auto-fetch-plugin-index BackgroundAction by layout, the
  // auto-load config, and whether the index already exists.
  const autoLoadConfig = tw.wiki.getTiddlerText(
    '$:/plugins/Gk0Wk/CPL-Repo/config/auto-load-database-in-cpl-layout',
    'yes',
  );
  const currentLayout = tw.wiki.getTiddlerText('$:/layout', '');
  if (
    autoLoadConfig === 'yes' &&
    currentLayout === CPL_LAYOUT_TITLE &&
    !tw.wiki.getTiddler(PLUGINS_INDEX_TITLE)
  ) {
    tw.wiki.addTiddler({
      title: AUTO_LOAD_TRIGGER_TITLE,
      text: String(Date.now()),
    });
  }

  // Start Wikitext-driven server OAuth handling
  setupGithubLoginRequest();
  handleOAuthCallback();

  console.log('[CPL-Server] API Client initialized');
};
