const fs = require('fs');
const paths = require('../paths');

module.exports = async () => {
  const files = ['stats.json', 'ratings.json', 'stats.test.json', 'ratings.test.json'];
  for (const file of files) {
    const filePath = paths.data + '/' + file;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // In test mode the server uses tmp/test-wiki. Wipe it before E2E tests
  // lifecycle is owned by scripts/server.ts, which prepares a fresh copy
  // with retry-aware cleanup for Windows.
};
