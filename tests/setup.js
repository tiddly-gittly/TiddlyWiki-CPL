/**
 * Test Setup
 *
 * This file runs before each test file.
 */

// Provide a minimal $tw global for CPL-Server modules that reference $tw.cplServerState
global.$tw = global.$tw || {};

// Clean up data files before tests
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../data');
const DATA_FILES = [
  'stats.json',
  'ratings.json',
  'stats.test.json',
  'ratings.test.json',
  'stats.china.json',
  'stats.us.json',
  'ratings.china.json',
  'ratings.us.json',
];

const TEST_WIKI_ROOT = path.resolve(__dirname, '../tmp/test-wiki');
const COMMENTS_PENDING_DIR = path.join(TEST_WIKI_ROOT, 'tiddlers/comments/pending');
const COMMENTS_APPROVED_DIR = path.join(TEST_WIKI_ROOT, 'tiddlers/comments/approved');

// Clean up function
function cleanupDataFiles() {
  try {
    for (const file of DATA_FILES) {
      const filePath = path.join(DATA_DIR, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    // Clean up test comment tiddlers
    for (const dir of [COMMENTS_PENDING_DIR, COMMENTS_APPROVED_DIR]) {
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir)) {
          if (file.includes('comment-test') || file.includes('e2e-test-comment')) {
            fs.unlinkSync(path.join(dir, file));
          }
        }
      }
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

beforeEach(() => {
  cleanupDataFiles();
});

// Also clean up after all tests
afterAll(() => {
  cleanupDataFiles();
});
