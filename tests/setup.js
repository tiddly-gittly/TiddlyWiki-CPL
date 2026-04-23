/**
 * Test Setup
 * 
 * This file runs before each test file.
 */

// Clean up data files before tests
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const RATINGS_FILE = path.join(DATA_DIR, 'ratings.json');

// Clean up function
function cleanupDataFiles() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      fs.unlinkSync(STATS_FILE);
    }
    if (fs.existsSync(RATINGS_FILE)) {
      fs.unlinkSync(RATINGS_FILE);
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

// Clean up before all tests
cleanupDataFiles();

// Also clean up after all tests
afterAll(() => {
  cleanupDataFiles();
});
