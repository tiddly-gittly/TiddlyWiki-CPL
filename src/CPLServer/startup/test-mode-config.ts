// Override default CPL config tiddlers to point to localhost
// when running in test mode. This prevents the browser client from
// attempting external fetches on startup, which fail in CI due to
// CORS and network restrictions.
//
// This runs on *every* server startup (dev/prod/test) but only takes
// effect when the CPL_TEST_MODE environment variable is set.

export const name = 'cpl-server-test-mode-config';
export const platforms = ['node'];
export const before = ['commands'];
export const synchronous = true;

const TEST_MODE_CONFIG_TITLES = [
  '$:/plugins/Gk0Wk/CPL-Repo/config/current-repo',
  '$:/plugins/Gk0Wk/CPL-Repo/config/current-server',
  '$:/plugins/Gk0Wk/CPL-Repo/config/servers',
  '$:/plugins/Gk0Wk/CPL-Repo/config/repos',
];

export const startup = (): void => {
  if (process.env.CPL_TEST_MODE !== 'true') {
    return;
  }

  // Derive origin from the running server's host/port environment.
  const host = process.env.HOST || '127.0.0.1';
  const port = process.env.PORT || '8080';
  const origin = `http://${host}:${port}`;

  // Override remote URL defaults so the client never tries external fetches.
  for (const title of TEST_MODE_CONFIG_TITLES) {
    const existing = $tw.wiki.getTiddler(title);
    if (!existing || existing.fields.text === '' || existing.fields.text?.startsWith('https://')) {
      $tw.wiki.addTiddler({ title, text: origin });
    }
  }
};
