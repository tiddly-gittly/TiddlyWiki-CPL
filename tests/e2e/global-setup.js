const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const dataDir = path.resolve(__dirname, '../../data');
  const files = ['stats.json', 'ratings.json', 'stats.test.json', 'ratings.test.json'];
  for (const file of files) {
    const filePath = path.join(dataDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // In test mode the server uses tmp/test-wiki. Wipe it before E2E tests
  // so the server starts from a clean copy of the production wiki.
  const testWikiRoot = path.resolve(__dirname, '../../tmp/test-wiki');
  if (fs.existsSync(testWikiRoot)) {
    fs.rmSync(testWikiRoot, { recursive: true, force: true });
  }
};
