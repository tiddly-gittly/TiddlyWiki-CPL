import * as fs from 'fs';
import * as path from 'path';
import { paths } from '../src/CPLServer/lib/paths';

interface CommentEntry {
  id?: string;
  githubId?: string | number;
  content?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface CommentFile {
  pluginTitle?: string;
  comments?: CommentEntry[];
}

interface CommentWithSource extends CommentEntry {
  sourceFile: string;
}

interface StaleFile {
  path: string;
  age: number;
}

interface DuplicateComment {
  pluginTitle: string;
  comment1: { id?: string; file: string; createdAt?: string };
  comment2: { id?: string; file: string; createdAt?: string };
}

interface IdCollision {
  id?: string;
  file1: string;
  file2: string;
  pluginTitle?: string;
}

const COMMENTS_DIR = path.join(paths.data, 'comments');
const STALE_THRESHOLD_DAYS = 30;
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

const args = process.argv.slice(2);
const CLEAN_STALE = args.includes('--clean-stale');
const DRY_RUN = !(args.includes('--fix') || CLEAN_STALE);

console.log('=== CPL Data Reconciliation ===');
console.log(
  'Mode:',
  DRY_RUN ? 'DRY RUN (no changes)' : 'FIX MODE (will modify files)',
);
console.log('Data directory:', DATA_DIR);
console.log('');

function getFileAge(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return Date.now() - stats.mtimeMs;
  } catch {
    return 0;
  }
}

function checkStaleFiles(): StaleFile[] {
  console.log('--- Checking for stale mirror files ---');

  const staleFiles: StaleFile[] = [];
  const thresholdMs = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  if (fs.existsSync(DATA_DIR)) {
    const statsFiles = fs
      .readdirSync(DATA_DIR)
      .filter(fileName => /^stats\.[^.]+\.json$/.test(fileName));
    for (const fileName of statsFiles) {
      const filePath = path.join(DATA_DIR, fileName);
      const age = getFileAge(filePath);
      if (age > thresholdMs) {
        staleFiles.push({
          path: filePath,
          age: Math.floor(age / (24 * 60 * 60 * 1000)),
        });
      }
    }

    const ratingsFiles = fs
      .readdirSync(DATA_DIR)
      .filter(fileName => /^ratings\.[^.]+\.json$/.test(fileName));
    for (const fileName of ratingsFiles) {
      const filePath = path.join(DATA_DIR, fileName);
      const age = getFileAge(filePath);
      if (age > thresholdMs) {
        staleFiles.push({
          path: filePath,
          age: Math.floor(age / (24 * 60 * 60 * 1000)),
        });
      }
    }
  }

  if (fs.existsSync(COMMENTS_DIR)) {
    const commentFiles = fs
      .readdirSync(COMMENTS_DIR)
      .filter(fileName => /\.[^.]+\.json$/.test(fileName));
    for (const fileName of commentFiles) {
      const filePath = path.join(COMMENTS_DIR, fileName);
      const age = getFileAge(filePath);
      if (age > thresholdMs) {
        staleFiles.push({
          path: filePath,
          age: Math.floor(age / (24 * 60 * 60 * 1000)),
        });
      }
    }
  }

  if (staleFiles.length === 0) {
    console.log('✓ No stale files found');
  } else {
    console.log(`⚠ Found ${staleFiles.length} stale file(s):`);
    for (const staleFile of staleFiles) {
      console.log(`  - ${staleFile.path} (${staleFile.age} days old)`);
    }

    if (CLEAN_STALE && !DRY_RUN) {
      console.log('Removing stale files...');
      for (const staleFile of staleFiles) {
        fs.unlinkSync(staleFile.path);
        console.log(`  ✓ Removed ${staleFile.path}`);
      }
    }
  }

  console.log('');
  return staleFiles;
}

function checkDuplicateComments(): DuplicateComment[] {
  console.log('--- Checking for duplicate comments ---');

  if (!fs.existsSync(COMMENTS_DIR)) {
    console.log('✓ No comments directory found');
    console.log('');
    return [];
  }

  const duplicates: DuplicateComment[] = [];
  const allComments = new Map<string, CommentWithSource[]>();

  const files = fs
    .readdirSync(COMMENTS_DIR)
    .filter(fileName => fileName.endsWith('.json'));
  for (const fileName of files) {
    const filePath = path.join(COMMENTS_DIR, fileName);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as CommentFile;

      if (data.pluginTitle && data.comments) {
        if (!allComments.has(data.pluginTitle)) {
          allComments.set(data.pluginTitle, []);
        }

        for (const comment of data.comments) {
          allComments.get(data.pluginTitle)?.push({
            ...comment,
            sourceFile: filePath,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error reading ${filePath}:`, message);
    }
  }

  for (const [pluginTitle, comments] of allComments.entries()) {
    for (let index = 0; index < comments.length; index += 1) {
      for (
        let compareIndex = index + 1;
        compareIndex < comments.length;
        compareIndex += 1
      ) {
        const firstComment = comments[index];
        const secondComment = comments[compareIndex];
        const firstCreatedAt = firstComment.createdAt
          ? new Date(firstComment.createdAt).getTime()
          : Number.NaN;
        const secondCreatedAt = secondComment.createdAt
          ? new Date(secondComment.createdAt).getTime()
          : Number.NaN;

        if (
          firstComment.githubId === secondComment.githubId &&
          firstComment.content === secondComment.content &&
          Number.isFinite(firstCreatedAt) &&
          Number.isFinite(secondCreatedAt) &&
          Math.abs(firstCreatedAt - secondCreatedAt) < DUPLICATE_WINDOW_MS
        ) {
          duplicates.push({
            pluginTitle,
            comment1: {
              id: firstComment.id,
              file: firstComment.sourceFile,
              createdAt: firstComment.createdAt,
            },
            comment2: {
              id: secondComment.id,
              file: secondComment.sourceFile,
              createdAt: secondComment.createdAt,
            },
          });
        }
      }
    }
  }

  if (duplicates.length === 0) {
    console.log('✓ No duplicate comments found');
  } else {
    console.log(`⚠ Found ${duplicates.length} potential duplicate(s):`);
    for (const duplicate of duplicates) {
      console.log(`  Plugin: ${duplicate.pluginTitle}`);
      console.log(
        `    - ${duplicate.comment1.id} (${
          duplicate.comment1.createdAt
        }) in ${path.basename(duplicate.comment1.file)}`,
      );
      console.log(
        `    - ${duplicate.comment2.id} (${
          duplicate.comment2.createdAt
        }) in ${path.basename(duplicate.comment2.file)}`,
      );
    }
    console.log('  Note: Manual review recommended before deletion');
  }

  console.log('');
  return duplicates;
}

function checkIdCollisions(): IdCollision[] {
  console.log('--- Checking for comment ID collisions ---');

  if (!fs.existsSync(COMMENTS_DIR)) {
    console.log('✓ No comments directory found');
    console.log('');
    return [];
  }

  const seenIds = new Map<string, { file: string; pluginTitle?: string }>();
  const collisions: IdCollision[] = [];

  const files = fs
    .readdirSync(COMMENTS_DIR)
    .filter(fileName => fileName.endsWith('.json'));
  for (const fileName of files) {
    const filePath = path.join(COMMENTS_DIR, fileName);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as CommentFile;

      if (!data.comments) {
        continue;
      }

      for (const comment of data.comments) {
        if (!comment.id) {
          continue;
        }

        if (seenIds.has(comment.id)) {
          collisions.push({
            id: comment.id,
            file1: seenIds.get(comment.id)?.file ?? '',
            file2: filePath,
            pluginTitle: data.pluginTitle,
          });
          continue;
        }

        seenIds.set(comment.id, {
          file: filePath,
          pluginTitle: data.pluginTitle,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error reading ${filePath}:`, message);
    }
  }

  if (collisions.length === 0) {
    console.log('✓ No ID collisions found');
  } else {
    console.log(`⚠ Found ${collisions.length} ID collision(s):`);
    for (const collision of collisions) {
      console.log(`  ID: ${collision.id} (plugin: ${collision.pluginTitle})`);
      console.log(`    - ${path.basename(collision.file1)}`);
      console.log(`    - ${path.basename(collision.file2)}`);
    }
    console.log(
      '  Note: This should not happen with server-specific IDs. Manual investigation required.',
    );
  }

  console.log('');
  return collisions;
}

function main(): void {
  const staleFiles = checkStaleFiles();
  const duplicates = checkDuplicateComments();
  const collisions = checkIdCollisions();

  console.log('=== Summary ===');
  console.log(`Stale files: ${staleFiles.length}`);
  console.log(`Duplicate comments: ${duplicates.length}`);
  console.log(`ID collisions: ${collisions.length}`);

  if (
    DRY_RUN &&
    (staleFiles.length > 0 || duplicates.length > 0 || collisions.length > 0)
  ) {
    console.log('');
    console.log('Run with --fix to apply automatic fixes');
    console.log('Run with --clean-stale to remove stale mirror files');
  }

  process.exit(
    staleFiles.length + duplicates.length + collisions.length > 0 ? 1 : 0,
  );
}

main();
