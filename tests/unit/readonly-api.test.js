const {
  shouldUseReaderAuthorizationForCplApi,
} = require('../../src/CPLServer/startup/readonly-api.ts');

describe('CPL API readonly authorization patch', () => {
  test('uses reader authorization for CPL API write requests', () => {
    const shouldBypassWriterAcl = shouldUseReaderAuthorizationForCplApi(
      { method: 'POST', url: '/cpl/download/%24%3A%2Fplugins%2Fdemo' },
      { get: () => '' },
    );

    expect(shouldBypassWriterAcl).toBe(true);
  });

  test('keeps native TiddlyWiki write requests on writer authorization', () => {
    const shouldBypassWriterAcl = shouldUseReaderAuthorizationForCplApi(
      { method: 'PUT', url: '/recipes/default/tiddlers/%24%3A%2Fplugins%2Fdemo' },
      { get: () => '' },
    );

    expect(shouldBypassWriterAcl).toBe(false);
  });

  test('does not change read requests', () => {
    const shouldBypassWriterAcl = shouldUseReaderAuthorizationForCplApi(
      { method: 'GET', url: '/cpl/stats/%24%3A%2Fplugins%2Fdemo' },
      { get: () => '' },
    );

    expect(shouldBypassWriterAcl).toBe(false);
  });

  test('recognizes CPL API write requests behind a TiddlyWiki path prefix', () => {
    const shouldBypassWriterAcl = shouldUseReaderAuthorizationForCplApi(
      { method: 'PUT', url: '/wiki/cpl/comments/%24%3A%2Fplugins%2Fdemo/comment-id' },
      { get: name => (name === 'path-prefix' ? '/wiki' : '') },
    );

    expect(shouldBypassWriterAcl).toBe(true);
  });
});