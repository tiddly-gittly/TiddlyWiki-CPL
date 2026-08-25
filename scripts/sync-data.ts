/**
 * Overlay this mirror's runtime tiddlers onto a fresh clone of GitHub master
 * and force-update data-sync/{serverId}. Never touches the live wiki worktree.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const SYNC_PATHS = [
  'wiki/tiddlers/comments',
  'wiki/tiddlers/ratings',
  'wiki/tiddlers/compatibility',
  'wiki/tiddlers/download-stats',
] as const;

export const DOWNLOAD_STATS_PATH = 'wiki/tiddlers/download-stats';

export type DownloadStats = {
  downloadCount: number;
  lastUpdated: string | null;
  downloadsByIp: Record<string, string>;
};

export type SyncDataOptions = {
  repoRoot: string;
  serverId: string;
  syncRepo: string;
  baseBranch: string;
  debug?: boolean;
};

export type SyncDataResult = 'pushed' | 'unchanged' | 'reset';

type GitResult = {
  status: number;
  stdout: string;
  stderr: string;
};

const log = (message: string): void => {
  console.log(`[sync-data] ${message}`);
};

export const serverTidSuffix = (serverId: string): string => `.${serverId}.tid`;

export const parseStatsTiddler = (raw: string): DownloadStats | null => {
  const normalized = raw.replace(/\r\n/g, '\n');
  const blank = normalized.indexOf('\n\n');
  const body = (blank === -1 ? normalized : normalized.slice(blank + 2)).trim();
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as DownloadStats;
    if (typeof parsed.downloadCount === 'number') {
      return {
        downloadCount: parsed.downloadCount,
        lastUpdated: parsed.lastUpdated ?? null,
        downloadsByIp: parsed.downloadsByIp ?? {},
      };
    }
  } catch {
    // Fall through to plaintext count.
  }

  const count = Number.parseInt(body, 10);
  if (Number.isNaN(count)) {
    return null;
  }
  return { downloadCount: count, lastUpdated: null, downloadsByIp: {} };
};

export const splitTiddler = (raw: string): { header: string; body: string } => {
  const normalized = raw.replace(/\r\n/g, '\n');
  const blank = normalized.indexOf('\n\n');
  if (blank === -1) {
    return { header: normalized.trimEnd(), body: '' };
  }
  return {
    header: normalized.slice(0, blank).trimEnd(),
    body: normalized.slice(blank + 2),
  };
};

export const laterTimestamp = (
  left: string | null,
  right: string | null,
): string | null => {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return left > right ? left : right;
};

export const mergeDownloadStats = (
  local: DownloadStats,
  remote: DownloadStats,
): DownloadStats => {
  const downloadsByIp = { ...remote.downloadsByIp };
  for (const [ip, timestamp] of Object.entries(local.downloadsByIp)) {
    const existing = downloadsByIp[ip];
    downloadsByIp[ip] =
      laterTimestamp(existing ?? null, timestamp) ?? timestamp;
  }

  const uniqueIps = Object.keys(downloadsByIp).length;
  return {
    downloadCount: Math.max(
      local.downloadCount,
      remote.downloadCount,
      uniqueIps,
    ),
    lastUpdated: laterTimestamp(local.lastUpdated, remote.lastUpdated),
    downloadsByIp,
  };
};

export const statsEqual = (
  left: DownloadStats,
  right: DownloadStats,
): boolean => JSON.stringify(left) === JSON.stringify(right);

const walkTidFiles = (dir: string, suffix: string): string[] => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTidFiles(fullPath, suffix));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(suffix)) {
      files.push(fullPath);
    }
  }
  return files;
};

export const overlayServerTiddlers = ({
  sourceRoot,
  destinationRoot,
  serverId,
}: {
  sourceRoot: string;
  destinationRoot: string;
  serverId: string;
}): void => {
  const suffix = serverTidSuffix(serverId);

  for (const relativePath of SYNC_PATHS) {
    const sourceDir = path.join(sourceRoot, relativePath);
    const destinationDir = path.join(destinationRoot, relativePath);
    if (!fs.existsSync(sourceDir)) {
      continue;
    }
    fs.mkdirSync(destinationDir, { recursive: true });

    for (const sourceFile of walkTidFiles(sourceDir, suffix)) {
      const relativeFile = path.relative(sourceDir, sourceFile);
      const destinationFile = path.join(destinationDir, relativeFile);
      fs.mkdirSync(path.dirname(destinationFile), { recursive: true });

      if (relativePath !== DOWNLOAD_STATS_PATH) {
        fs.copyFileSync(sourceFile, destinationFile);
        continue;
      }

      const localRaw = fs.readFileSync(sourceFile, 'utf8');
      const localStats = parseStatsTiddler(localRaw);
      if (!localStats) {
        fs.copyFileSync(sourceFile, destinationFile);
        continue;
      }

      if (!fs.existsSync(destinationFile)) {
        fs.copyFileSync(sourceFile, destinationFile);
        continue;
      }

      const remoteRaw = fs.readFileSync(destinationFile, 'utf8');
      const remoteStats = parseStatsTiddler(remoteRaw);
      if (!remoteStats) {
        fs.copyFileSync(sourceFile, destinationFile);
        continue;
      }

      const merged = mergeDownloadStats(localStats, remoteStats);
      if (statsEqual(merged, remoteStats)) {
        continue;
      }

      const { header } = splitTiddler(remoteRaw);
      const looksLikeTiddler = /^title:/im.test(header);
      const serialized = looksLikeTiddler
        ? `${header}\n\n${JSON.stringify(merged)}`
        : JSON.stringify(merged);
      fs.writeFileSync(destinationFile, serialized);
    }
  }
};

const runGit = (args: string[], cwd: string, allowFail = false): GitResult => {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  });
  const stdout = (result.stdout ?? '').trim();
  const stderr = (result.stderr ?? '').trim();
  const status = result.status ?? 1;
  if (status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(' ')} failed (${status}): ${stderr}`);
  }
  return { status, stdout, stderr };
};

const sleepSync = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const acquireLock = (lockDir: string): void => {
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      fs.writeFileSync(path.join(lockDir, 'timestamp'), String(Date.now()));
      return;
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code !== 'EEXIST') {
        throw error;
      }
      let lockTime = 0;
      try {
        lockTime = Number(
          fs.readFileSync(path.join(lockDir, 'timestamp'), 'utf8'),
        );
      } catch {
        lockTime = 0;
      }
      if (Date.now() - lockTime > 60 * 60 * 1000) {
        fs.rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      sleepSync(2000);
    }
  }
};

const applyOwnDeletions = (
  repoRoot: string,
  checkoutDir: string,
  serverId: string,
): void => {
  const suffix = serverTidSuffix(serverId);
  const deleted = runGit(
    ['diff', '--name-only', '--diff-filter=D', '--', ...SYNC_PATHS],
    repoRoot,
    true,
  );
  for (const deletedPath of deleted.stdout.split(/\r?\n/)) {
    if (!deletedPath.endsWith(suffix)) {
      continue;
    }
    fs.rmSync(path.join(checkoutDir, deletedPath), {
      recursive: true,
      force: true,
    });
  }
};

export const syncRuntimeData = (options: SyncDataOptions): SyncDataResult => {
  const repoRoot = path.resolve(options.repoRoot);
  const { serverId } = options;
  const syncBranch = `data-sync/${serverId}`;
  const lockDir = path.join(repoRoot, '.cpl-sync-lock');

  if (!serverId) {
    throw new Error('CPL_SERVER_ID is required');
  }
  if (!fs.existsSync(path.join(repoRoot, '.git'))) {
    throw new Error(`${repoRoot} is not a Git repository`);
  }

  acquireLock(lockDir);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpl-data-sync-'));
  const checkoutDir = path.join(tempDir, 'repository');

  try {
    runGit(
      [
        'clone',
        '--quiet',
        '--depth',
        '1',
        '--branch',
        options.baseBranch,
        options.syncRepo,
        checkoutDir,
      ],
      repoRoot,
    );
    runGit(['checkout', '-B', syncBranch], checkoutDir);
    runGit(['config', 'user.name', `CPL Data Sync (${serverId})`], checkoutDir);
    runGit(
      ['config', 'user.email', 'cpl-data-sync@users.noreply.github.com'],
      checkoutDir,
    );

    overlayServerTiddlers({
      sourceRoot: repoRoot,
      destinationRoot: checkoutDir,
      serverId,
    });
    applyOwnDeletions(repoRoot, checkoutDir, serverId);

    if (options.debug) {
      log(
        `Working tree after overlay:\n${
          runGit(['status', '--short', '--', ...SYNC_PATHS], checkoutDir, true)
            .stdout
        }`,
      );
    }

    for (const relativePath of SYNC_PATHS) {
      runGit(['add', '-A', '-f', '--', relativePath], checkoutDir, true);
    }

    if (options.debug) {
      log(
        `Staged changes:\n${
          runGit(['diff', '--cached', '--stat'], checkoutDir, true).stdout
        }`,
      );
    }

    const staged = runGit(['diff', '--cached', '--quiet'], checkoutDir, true);
    if (staged.status === 0) {
      const remoteBranch = runGit(
        [
          'ls-remote',
          '--exit-code',
          '--heads',
          'origin',
          `refs/heads/${syncBranch}`,
        ],
        checkoutDir,
        true,
      );
      if (remoteBranch.status === 0) {
        runGit(
          ['push', '--force', 'origin', `HEAD:refs/heads/${syncBranch}`],
          checkoutDir,
        );
        log(
          `Reset ${syncBranch} to ${options.baseBranch} because no runtime data changes remain`,
        );
        return 'reset';
      }
      log('No runtime data changes to sync');
      return 'unchanged';
    }

    const timestamp = new Date().toISOString();
    runGit(
      ['commit', '-m', `chore(data): sync from ${serverId} [${timestamp}]`],
      checkoutDir,
    );
    runGit(
      ['push', '--force', 'origin', `HEAD:refs/heads/${syncBranch}`],
      checkoutDir,
    );
    log(
      `Updated ${syncBranch}; GitHub Actions will create or refresh the Pull Request`,
    );
    return 'pushed';
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
};

export const main = (): number => {
  try {
    syncRuntimeData({
      repoRoot: process.env.CPL_REPO_ROOT ?? path.resolve(__dirname, '..'),
      serverId: process.env.CPL_SERVER_ID ?? '',
      syncRepo:
        process.env.CPL_SYNC_REPO ??
        'git@github.com:tiddly-gittly/TiddlyWiki-CPL.git',
      baseBranch: process.env.CPL_SYNC_BRANCH ?? 'master',
      debug: process.env.CPL_SYNC_DEBUG === 'true',
    });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sync-data] ${message}`);
    return 1;
  }
};

const invokedAsCli = (): boolean => {
  const entry = process.argv[1];
  return Boolean(entry && path.basename(entry) === 'sync-data.ts');
};

// Node 22 `--experimental-strip-types` re-parses this file as ESM, so
// `require.main === module` never fires and the sidecar would exit 0
// without overlaying or pushing.
if (invokedAsCli()) {
  process.exit(main());
}
