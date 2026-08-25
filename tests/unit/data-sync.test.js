const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '../..');
const syncScript = path.join(projectRoot, 'scripts', 'sync-data.sh');

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

function shellPath(filePath) {
  if (process.platform !== 'win32') {
    return filePath;
  }
  return filePath
    .replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`)
    .replace(/\\/g, '/');
}

function shellExecutable() {
  if (process.platform !== 'win32') {
    return 'sh';
  }
  const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
  if (!fs.existsSync(gitBash)) {
    throw new Error('Git Bash is required to test scripts/sync-data.sh');
  }
  return gitBash;
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
      '{"downloadCount":3,"lastUpdated":"2026-08-22T00:00:00.000Z"}\n',
    );
    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/download-stats/plugin.us.tid'),
      '{"downloadCount":9,"lastUpdated":"2026-08-22T00:00:00.000Z"}\n',
    );
    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/comments/approved/old.china.tid'),
      'approved\n',
    );
    run('git', ['add', '.'], { cwd: live });
    run('git', ['commit', '-m', 'baseline'], { cwd: live });
    run('git', ['branch', '-M', 'master'], { cwd: live });
    run('git', ['push', 'origin', 'master'], { cwd: live });

    // Stale PVC: this server's count went backwards, and it also holds an
    // outdated copy of the other mirror's file.
    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/download-stats/plugin.china.tid'),
      '{"downloadCount":1,"lastUpdated":"2026-08-01T00:00:00.000Z"}\n',
    );
    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/download-stats/plugin.us.tid'),
      '{"downloadCount":1,"lastUpdated":"2026-08-02T00:00:00.000Z"}\n',
    );

    run(shellExecutable(), [shellPath(syncScript)], {
      env: {
        ...process.env,
        CPL_REPO_ROOT: shellPath(live),
        CPL_SERVER_ID: 'china',
        CPL_SYNC_REPO: shellPath(remote),
        CPL_SYNC_BRANCH: 'master',
      },
    });

    const staleBranch = spawnSync(
      'git',
      ['ls-remote', '--exit-code', '--heads', remote, 'refs/heads/data-sync/china'],
      { encoding: 'utf8' },
    );
    expect(staleBranch.status).not.toBe(0);

    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/download-stats/plugin.china.tid'),
      '{"downloadCount":4,"lastUpdated":"2026-08-25T00:00:00.000Z"}\n',
    );
    fs.rmSync(
      path.join(live, 'wiki/tiddlers/comments/approved/old.china.tid'),
    );
    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/ratings/new.china.tid'),
      'rating\n',
    );

    run(shellExecutable(), [shellPath(syncScript)], {
      env: {
        ...process.env,
        CPL_REPO_ROOT: shellPath(live),
        CPL_SERVER_ID: 'china',
        CPL_SYNC_REPO: shellPath(remote),
        CPL_SYNC_BRANCH: 'master',
      },
    });

    run('git', ['clone', '--branch', 'data-sync/china', remote, verify]);
    expect(
      fs.readFileSync(
        path.join(verify, 'wiki/tiddlers/download-stats/plugin.china.tid'),
        'utf8',
      ),
    ).toBe(
      '{"downloadCount":4,"lastUpdated":"2026-08-25T00:00:00.000Z"}\n',
    );
    expect(
      fs.readFileSync(
        path.join(verify, 'wiki/tiddlers/download-stats/plugin.us.tid'),
        'utf8',
      ),
    ).toBe(
      '{"downloadCount":9,"lastUpdated":"2026-08-22T00:00:00.000Z"}\n',
    );
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
