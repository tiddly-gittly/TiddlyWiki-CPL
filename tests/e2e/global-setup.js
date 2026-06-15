const fs = require('fs');
const path = require('path');
const paths = require('../paths');

module.exports = async () => {
  const files = ['stats.json', 'ratings.json', 'stats.test.json', 'ratings.test.json'];
  for (const file of files) {
    const filePath = path.join(paths.data, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
};
