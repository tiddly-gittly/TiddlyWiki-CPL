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

  // Clean up test comment tiddlers
  const commentsPendingDir = path.resolve(__dirname, '../../wiki/tiddlers/comments/pending');
  const commentsApprovedDir = path.resolve(__dirname, '../../wiki/tiddlers/comments/approved');
  for (const dir of [commentsPendingDir, commentsApprovedDir]) {
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        if (file.includes('comment-test') || file.includes('e2e-test-comment')) {
          fs.unlinkSync(path.join(dir, file));
        }
      }
    }
  }
};
