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

// Clean up function
function cleanupDataFiles() {
  try {
    for (const file of DATA_FILES) {
      const filePath = path.join(DATA_DIR, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
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
