function loadOAuth(clientId) {
  jest.resetModules();
  global.$tw = {
    wiki: {
      getTiddlerText: jest.fn((title, fallback) => {
        if (title === '$:/temp/CPL-Server/github-client-id') {
          return clientId;
        }
        if (title === '$:/temp/CPL-Server/api-base') {
          return 'https://cpl.tidgi.fun';
        }
        return fallback;
      }),
    },
  };
  global.window = {
    location: {
      origin: 'https://cpl.tidgi.fun',
      href: 'https://cpl.tidgi.fun/#test-plugin',
      pathname: '/',
    },
  };
  global.sessionStorage = {
    setItem: jest.fn(),
    getItem: jest.fn(),
    removeItem: jest.fn(),
  };

  return require('../../src/CPLPlugin/startup/oauth');
}

describe('GitHub OAuth client', () => {
  afterEach(() => {
    delete global.window;
    delete global.sessionStorage;
  });

  test.each(['', '   ', 'null', ' NULL ', 'undefined']) (
    'does not redirect for invalid client ID %p',
    (clientId) => {
      const { handleGithubLogin } = loadOAuth(clientId);
      const originalUrl = global.window.location.href;
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      handleGithubLogin();

      expect(global.window.location.href).toBe(originalUrl);
      expect(global.sessionStorage.setItem).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    }
  );

  test('redirects with the configured client ID', () => {
    const { handleGithubLogin } = loadOAuth(' github-client-123 ');

    handleGithubLogin();

    const redirectUrl = new URL(global.window.location.href);
    expect(redirectUrl.origin).toBe('https://github.com');
    expect(redirectUrl.pathname).toBe('/login/oauth/authorize');
    expect(redirectUrl.searchParams.get('client_id')).toBe('github-client-123');
    expect(redirectUrl.searchParams.get('redirect_uri')).toBe(
      'https://cpl.tidgi.fun/cpl/auth/github/callback'
    );
    expect(global.sessionStorage.setItem).toHaveBeenCalledTimes(2);
  });
});
