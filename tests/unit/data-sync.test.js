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

test('runtime data sync preserves modifications, ignored files, and deletions', () => {
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
      'count=1\n',
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
      'count=2\n',
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
    ).toBe('count=2\n');
    expect(
      fs.existsSync(path.join(verify, 'wiki/tiddlers/ratings/new.china.tid')),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(verify, 'wiki/tiddlers/comments/approved/old.china.tid'),
      ),
    ).toBe(false);

    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/download-stats/plugin.china.tid'),
      'count=1\n',
    );
    fs.writeFileSync(
      path.join(live, 'wiki/tiddlers/comments/approved/old.china.tid'),
      'approved\n',
    );
    fs.rmSync(path.join(live, 'wiki/tiddlers/ratings/new.china.tid'));

    run(shellExecutable(), [shellPath(syncScript)], {
      env: {
        ...process.env,
        CPL_REPO_ROOT: shellPath(live),
        CPL_SERVER_ID: 'china',
        CPL_SYNC_REPO: shellPath(remote),
        CPL_SYNC_BRANCH: 'master',
      },
    });

    run('git', ['fetch', 'origin', 'data-sync/china'], { cwd: verify });
    run('git', ['reset', '--hard', 'origin/data-sync/china'], { cwd: verify });
    expect(
      fs.readFileSync(
        path.join(verify, 'wiki/tiddlers/download-stats/plugin.china.tid'),
        'utf8',
      ),
    ).toBe('count=1\n');
    expect(
      fs.existsSync(path.join(verify, 'wiki/tiddlers/ratings/new.china.tid')),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(verify, 'wiki/tiddlers/comments/approved/old.china.tid'),
      ),
    ).toBe(true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}, 60000);
