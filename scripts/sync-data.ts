/**
 * sync-data.ts — Run on the HOST (not inside Docker) to open a Pull Request
 * that syncs the data/ directory back to GitHub.
 *
 * Why a PR instead of a direct push?
 *   - Provides a review step before stats/ratings/comments land on master
 *   - Avoids fast-forward conflicts when multiple mirrors write concurrently
 *   - Keeps the main branch clean; stale or conflicting data can be inspected
 *
 * Prerequisites: `gh` CLI must be installed and authenticated (`gh auth login`).
 *
 * Usage:
 *   pnpm run sync-data
 *
 * Suggested schedule: once a week (not more often — PRs accumulate).
 *   # crontab -e
 *   0 3 * * 1  cd /path/to/TiddlyWiki-CPL && pnpm run sync-data >> /var/log/cpl-sync.log 2>&1
 */

import { spawnSync } from 'child_process';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_ID = process.env.CPL_SERVER_ID ?? 'default';
const BRANCH_BASE = `data-sync/${SERVER_ID}`;

function run(cmd: string, args: string[], cwd = REPO_ROOT): { ok: boolean; stdout: string } {
  console.log(`[sync-data] $ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = (result.stdout ?? '').trim();
  const stderr = (result.stderr ?? '').trim();
  if (stderr) console.error(`[sync-data] stderr: ${stderr}`);
  return { ok: result.status === 0, stdout };
}

// 1. Make sure the working tree is clean except for data/.
const status = run('git', ['status', '--porcelain', '--', 'data/']);
if (!status.ok) {
  console.error('[sync-data] ERROR: git status failed.');
  process.exit(1);
}
if (!status.stdout) {
  console.log('[sync-data] No changes in data/ to sync.');
  process.exit(0);
}

// 2. Create (or reset) a dedicated sync branch.
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const branch = `${BRANCH_BASE}/${timestamp}`;
run('git', ['fetch', 'origin', '--quiet']);
run('git', ['checkout', '-B', branch, 'origin/master']);

// 3. Stage only data/.
run('git', ['add', 'data/']);

const diff = run('git', ['diff', '--cached', '--quiet']);
if (diff.ok) {
  console.log('[sync-data] Nothing staged after git add data/ — already up to date.');
  run('git', ['checkout', '-']);
  process.exit(0);
}

// 4. Commit.
const commitMsg = `chore(data): sync stats/ratings/comments from ${SERVER_ID} [${timestamp}]`;
const commit = run('git', ['commit', '-m', commitMsg]);
if (!commit.ok) {
  console.error('[sync-data] ERROR: git commit failed.');
  process.exit(1);
}

// 5. Push the branch.
const push = run('git', ['push', '--force-with-lease', 'origin', `${branch}:${branch}`]);
if (!push.ok) {
  console.error('[sync-data] ERROR: git push failed.');
  process.exit(1);
}

// 6. Open a PR via gh CLI.
const prTitle = `chore(data): sync from ${SERVER_ID} server (${new Date().toISOString().slice(0, 10)})`;
const prBody = [
  `Automated data sync from the **${SERVER_ID}** mirror server.`,
  '',
  'Changes include download stats, ratings, and/or comments written by the Docker container.',
  '',
  '**Review checklist:**',
  '- [ ] No unexpected files outside `data/`',
  '- [ ] Stats look reasonable (no sudden spikes that suggest scraping)',
  '- [ ] No merge conflicts with other mirror branches',
].join('\n');

const pr = run('gh', [
  'pr', 'create',
  '--title', prTitle,
  '--body', prBody,
  '--base', 'master',
  '--head', branch,
]);

if (pr.ok) {
  console.log('[sync-data] PR created successfully.');
  console.log(pr.stdout);
} else {
  console.error('[sync-data] ERROR: gh pr create failed. You can open the PR manually.');
  process.exit(1);
}

// 7. Return to original branch.
run('git', ['checkout', '-']);
