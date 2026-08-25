const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { syncRuntimeData } = require('../../scripts/sync-data.ts');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

test('runtime data sync overlays only this server and never decreases stats', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cpl-data-sync-'));
  const remote = path.join(tempRoot, 'remote.git');
  const live = path.join(tempRoot, 'live');
  const verify = path.join(tempRoot, 'verify');

  try {
    run('git', ['init', '--bare', remote]);
    run('git', ['clone', remote, live]);
    run('git', ['config', 'user.name', 'CPL Test'], { cwd: live });
    run('git', ['config', 'user.email', 'cpl-test@example.com'], {
      cwd: live,
    });

    fs.mkdirSync(path.join(live, 'wiki/tiddlers/download-stats'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(live, 'wiki/tiddlers/comments/approved'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(live, 'wiki/tiddlers/ratings'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(live, '.gitignore'),
      'wiki/tiddlers/ratings/*.tid\n',
    );
    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/download-stats/plugin.china.tid'),
      '{"downloadCount":3,"lastUpdated":"2026-08-22T00:00:00.000Z","downloadsByIp":{"8.8.8.8":"2026-08-22T00:00:00.000Z"}}\n',
    );
    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/download-stats/plugin.us.tid'),
      '{"downloadCount":9,"lastUpdated":"2026-08-22T00:00:00.000Z","downloadsByIp":{"8.8.8.8":"2026-08-22T00:00:00.000Z"}}\n',
    );
    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/comments/approved/old.china.tid'),
      'approved\n',
    );
    run('git', ['add', '.'], { cwd: live });
    run('git', ['commit', '-m', 'baseline'], { cwd: live });
    run('git', ['branch', '-M', 'master'], { cwd: live });
    run('git', ['push', 'origin', 'master'], { cwd: live });

    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/download-stats/plugin.china.tid'),
      '{"downloadCount":1,"lastUpdated":"2026-08-01T00:00:00.000Z","downloadsByIp":{"8.8.8.8":"2026-08-01T00:00:00.000Z"}}\n',
    );
    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/download-stats/plugin.us.tid'),
      '{"downloadCount":1,"lastUpdated":"2026-08-02T00:00:00.000Z","downloadsByIp":{"9.9.9.9":"2026-08-02T00:00:00.000Z"}}\n',
    );

    expect(
      syncRuntimeData({
        repoRoot: live,
        serverId: 'china',
        syncRepo: remote,
        baseBranch: 'master',
      }),
    ).toBe('unchanged');

    const staleBranch = spawnSync(
      'git',
      [
        'ls-remote',
        '--exit-code',
        '--heads',
        remote,
        'refs/heads/data-sync/china',
      ],
      { encoding: 'utf8' },
    );
    expect(staleBranch.status).not.toBe(0);

    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/download-stats/plugin.china.tid'),
      '{"downloadCount":4,"lastUpdated":"2026-08-25T00:00:00.000Z","downloadsByIp":{"8.8.8.8":"2026-08-22T00:00:00.000Z","9.9.9.9":"2026-08-25T00:00:00.000Z"}}\n',
    );
    fs.rmSync(path.join(live, 'wiki/tiddlers/comments/approved/old.china.tid'));
    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/ratings/new.china.tid'),
      'rating\n',
    );

    expect(
      syncRuntimeData({
        repoRoot: live,
        serverId: 'china',
        syncRepo: remote,
        baseBranch: 'master',
      }),
    ).toBe('pushed');

    run('git', ['clone', '--branch', 'data-sync/china', remote, verify]);
    expect(
      fs.readFileSync(
        path.join(verify, 'wiki/tiddlers/download-stats/plugin.china.tid'),
        'utf8',
      ),
    ).toContain('"downloadCount":4');
    expect(
      fs.readFileSync(
        path.join(verify, 'wiki/tiddlers/download-stats/plugin.us.tid'),
        'utf8',
      ),
    ).toContain('"downloadCount":9');
    expect(
      fs.existsSync(path.join(verify, 'wiki/tiddlers/ratings/new.china.tid')),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(verify, 'wiki/tiddlers/comments/approved/old.china.tid'),
      ),
    ).toBe(false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}, 60000);
