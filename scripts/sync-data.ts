/**
 * sync-data.ts — Run on the HOST (not inside Docker) to commit and push the
 * data/ directory back to GitHub.
 *
 * The Docker container writes stats/ratings/comments into the bind-mounted
 * data/ directory on the host in real time (a bind mount is the same
 * filesystem path — no copying involved).  This script stages those changes,
 * commits them with a timestamped message, and pushes using the host's
 * existing git credentials.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/sync-data.ts
 *   # or via package.json script:
 *   pnpm run sync-data
 *
 * Suggested cron (every hour, from the repo root):
 *   0 * * * * cd /path/to/TiddlyWiki-CPL && pnpm run sync-data >> /var/log/cpl-sync.log 2>&1
 */

import { spawnSync } from 'child_process';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_ID = process.env.CPL_SERVER_ID ?? 'default';

function git(...args: string[]): { ok: boolean; stdout: string } {
  const label = `git ${args.join(' ')}`;
  console.log(`[sync-data] $ ${label}`);
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = (result.stdout ?? '').trim();
  const stderr = (result.stderr ?? '').trim();
  if (stderr) console.error(`[sync-data] stderr: ${stderr}`);
  return { ok: result.status === 0, stdout };
}

// 1. Pull first to avoid non-fast-forward push failures when multiple mirrors
//    are writing data concurrently.
const pull = git('pull', '--ff-only', '--quiet');
if (!pull.ok) {
  console.warn('[sync-data] WARNING: git pull failed (conflict or network issue). Skipping push.');
  process.exit(0);
}

// 2. Stage only the data/ directory.
//    Never stage plugin-fetched/, plugin-fetched-history/, or repo-cache/
//    — those are gitignored and should stay that way.
git('add', 'data/');

// 3. Check if there is anything to commit.
const diff = git('diff', '--cached', '--quiet');
if (diff.ok) {
  console.log('[sync-data] No changes in data/ to commit.');
  process.exit(0);
}

// 4. Commit with a timestamped message.
const timestamp = new Date().toISOString();
git('commit', '-m', `chore(data): sync stats/ratings/comments from ${SERVER_ID} server [${timestamp}]`);

// 5. Push.
const push = git('push', 'origin', 'master');
if (!push.ok) {
  console.error('[sync-data] ERROR: git push failed.');
  process.exit(1);
}

console.log('[sync-data] Done.');
