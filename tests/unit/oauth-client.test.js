function loadOAuth(clientId) {
  jest.resetModules();
  global.$tw = {
    utils: {
      httpRequest: jest.fn(),
    },
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
      addTiddler: jest.fn(),
    },
  };
  global.window = {
    location: {
      origin: 'https://cpl.tidgi.fun',
      href: 'https://cpl.tidgi.fun/#test-plugin',
      pathname: '/',
      search: '',
      hash: '#test-plugin',
      replace: jest.fn(),
    },
    history: {
      replaceState: jest.fn(),
    },
  };
  global.document = { title: 'CPL' };
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
    delete global.document;
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

  test('validates redirected state before exchanging the OAuth code', () => {
    const { handleOAuthCallback } = loadOAuth('github-client-123');
    global.window.location.href =
      'https://cpl.tidgi.fun/?cpl_oauth_code=valid-code&cpl_oauth_state=0123456789abcdef0123456789abcdef';
    global.window.location.search =
      '?cpl_oauth_code=valid-code&cpl_oauth_state=0123456789abcdef0123456789abcdef';
    global.sessionStorage.getItem.mockImplementation((key) => {
      if (key === 'cpl-oauth-state') {
        return '0123456789abcdef0123456789abcdef';
      }
      if (key === 'cpl-oauth-return') {
        return 'https://cpl.tidgi.fun/#test-plugin';
      }
      return null;
    });
    global.$tw.utils.httpRequest.mockImplementation(({ callback }) => {
      callback(
        null,
        JSON.stringify({
          success: true,
          user: { githubId: '1', username: 'tester', avatar: '' },
        })
      );
    });

    handleOAuthCallback();

    expect(global.$tw.utils.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://cpl.tidgi.fun/cpl/auth/github/callback?code=valid-code',
        type: 'GET',
      })
    );
    expect(global.window.history.replaceState).toHaveBeenCalled();
    expect(global.window.location.replace).toHaveBeenCalledWith(
      'https://cpl.tidgi.fun/#test-plugin'
    );
    expect(global.$tw.wiki.addTiddler).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '$:/temp/CPL-Server/user-status',
        text: 'authenticated',
      })
    );
  });

  test('does not exchange a code when OAuth state mismatches', () => {
    const { handleOAuthCallback } = loadOAuth('github-client-123');
    global.window.location.search =
      '?cpl_oauth_code=valid-code&cpl_oauth_state=attacker-state';
    global.sessionStorage.getItem.mockReturnValue('expected-state');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    handleOAuthCallback();

    expect(global.$tw.utils.httpRequest).not.toHaveBeenCalled();
    expect(global.window.location.replace).toHaveBeenCalledWith('/');
    consoleError.mockRestore();
  });

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
