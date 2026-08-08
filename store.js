const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Store {
  constructor(opts) {
    // Determine the user data path
    const userDataPath = app ? app.getPath('userData') : __dirname;
    this.path = path.join(userDataPath, opts.configName + '.json');
    this.data = parseDataFile(this.path, opts.defaults);
  }

  get(key) {
    return this.data[key];
  }

  set(key, val) {
    this.data[key] = val;
    try {
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('Error writing config file:', err);
    }
  }

  // Helper to append a history item
  addHistory(item) {
    const history = this.get('history') || [];
    history.unshift(item); // Add to the beginning
    // Cap history size to 200 items to avoid bloating
    if (history.length > 200) {
      history.pop();
    }
    this.set('history', history);
  }

  // Update statistics
  updateStats(fileCount, byteCount, categoryStats) {
    const stats = this.get('stats') || { totalFiles: 0, totalBytes: 0, categoryCounts: {} };
    stats.totalFiles += fileCount;
    stats.totalBytes += byteCount;
    
    if (categoryStats) {
      for (const [cat, count] of Object.entries(categoryStats)) {
        stats.categoryCounts[cat] = (stats.categoryCounts[cat] || 0) + count;
      }
    }
    this.set('stats', stats);
  }
}

function parseDataFile(filePath, defaults) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.error('Error parsing config file, using defaults:', error);
  }
  return defaults;
}

module.exports = Store;
