const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const dataDir = path.resolve(__dirname, '../../data');
  const files = ['stats.json', 'ratings.json'];
  for (const file of files) {
    const filePath = path.join(dataDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
};
