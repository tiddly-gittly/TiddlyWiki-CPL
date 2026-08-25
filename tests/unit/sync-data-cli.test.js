const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '../../scripts/sync-data.ts');

const runScript = env =>
  spawnSync(process.execPath, ['--experimental-strip-types', SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });

describe('sync-data CLI entrypoint', () => {
  test('node type-stripping actually invokes main()', () => {
    const result = runScript({
      CPL_SERVER_ID: '',
      CPL_REPO_ROOT: os.tmpdir(),
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(
      /CPL_SERVER_ID is required/,
    );
  });
});
