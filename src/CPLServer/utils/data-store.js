/*\
title: $:/plugins/Gk0Wk/CPL-Server/utils/data-store.js
type: application/javascript
module-type: library

Data storage utilities for CPL Server
Uses in-memory cache with async flush to disk to prevent race conditions.
\*/

(function() {
  'use strict';

  var fs = require('fs');
  var path = require('path');

  // Config may not be available in test environment
  var Config;
  try {
    Config = require('$:/plugins/Gk0Wk/CPL-Server/utils/config.js').Config;
  } catch (e) {
    Config = {
      dataDir: path.resolve(process.cwd(), 'data')
    };
  }

  var DATA_DIR = Config.dataDir;
  var STATS_FILE = path.join(DATA_DIR, 'stats.json');
  var RATINGS_FILE = path.join(DATA_DIR, 'ratings.json');

  // In-memory cache
  var statsCache = null;
  var ratingsCache = null;
  var flushTimer = null;
  var pendingFlush = false;

  // Ensure data directory exists
  function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  // Load JSON from disk into memory cache
  function loadFromDisk(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        var content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (e) {
      console.error('[CPL-Server] Error reading ' + filePath + ':', e.message);
    }
    return {};
  }

  // Synchronous flush to disk (used on process exit)
  function flushSync() {
    try {
      ensureDataDir();
      if (statsCache !== null) {
        fs.writeFileSync(STATS_FILE, JSON.stringify(statsCache, null, 2), 'utf-8');
      }
      if (ratingsCache !== null) {
        fs.writeFileSync(RATINGS_FILE, JSON.stringify(ratingsCache, null, 2), 'utf-8');
      }
      pendingFlush = false;
    } catch (e) {
      console.error('[CPL-Server] Error flushing data to disk:', e.message);
    }
  }

  // Async flush to disk (debounced)
  function flushAsync() {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    pendingFlush = true;
    flushTimer = setTimeout(function() {
      flushSync();
    }, 5000); // Flush at most every 5 seconds
  }

  // Initialize caches on first access
  function ensureStatsLoaded() {
    if (statsCache === null) {
      statsCache = loadFromDisk(STATS_FILE);
    }
  }

  function ensureRatingsLoaded() {
    if (ratingsCache === null) {
      ratingsCache = loadFromDisk(RATINGS_FILE);
    }
  }

  // Register process exit handler
  process.on('exit', flushSync);
  process.on('SIGINT', function() {
    flushSync();
    process.exit(0);
  });
  process.on('SIGTERM', function() {
    flushSync();
    process.exit(0);
  });

  // Data Store API
  var DataStore = {
    // Get download stats for a plugin
    getStats: function(pluginTitle) {
      ensureStatsLoaded();
      return statsCache[pluginTitle] || {
        downloadCount: 0,
        lastUpdated: null,
        downloadsByIp: {}
      };
    },

    // Update download stats for a plugin
    updateDownloadStats: function(pluginTitle, ip) {
      ensureStatsLoaded();
      
      if (!statsCache[pluginTitle]) {
        statsCache[pluginTitle] = {
          downloadCount: 0,
          lastUpdated: null,
          downloadsByIp: {}
        };
      }

      statsCache[pluginTitle].downloadCount++;
      statsCache[pluginTitle].lastUpdated = new Date().toISOString();
      statsCache[pluginTitle].downloadsByIp[ip] = new Date().toISOString();

      flushAsync();
      return statsCache[pluginTitle];
    },

    // Get ratings for a plugin
    getRatings: function(pluginTitle) {
      ensureRatingsLoaded();
      return ratingsCache[pluginTitle] || {
        ratings: [],
        averageRating: 0,
        totalRatings: 0
      };
    },

    // Add a rating for a plugin
    addRating: function(pluginTitle, ip, rating) {
      ensureRatingsLoaded();
      
      if (!ratingsCache[pluginTitle]) {
        ratingsCache[pluginTitle] = {
          ratings: [],
          averageRating: 0,
          totalRatings: 0
        };
      }

      var pluginRatings = ratingsCache[pluginTitle];
      
      // Check if IP already rated
      var existingIndex = pluginRatings.ratings.findIndex(function(r) {
        return r.ip === ip;
      });

      if (existingIndex >= 0) {
        // Update existing rating
        pluginRatings.ratings[existingIndex].rating = rating;
        pluginRatings.ratings[existingIndex].timestamp = new Date().toISOString();
      } else {
        // Add new rating
        pluginRatings.ratings.push({
          ip: ip,
          rating: rating,
          timestamp: new Date().toISOString()
        });
      }

      // Recalculate average
      var total = pluginRatings.ratings.reduce(function(sum, r) {
        return sum + r.rating;
      }, 0);
      pluginRatings.averageRating = Math.round((total / pluginRatings.ratings.length) * 10) / 10;
      pluginRatings.totalRatings = pluginRatings.ratings.length;

      flushAsync();
      return pluginRatings;
    },

    // Check if IP has rated a plugin
    hasRated: function(pluginTitle, ip) {
      ensureRatingsLoaded();
      var pluginRatings = ratingsCache[pluginTitle];
      
      if (!pluginRatings || !pluginRatings.ratings) {
        return false;
      }

      return pluginRatings.ratings.some(function(r) {
        return r.ip === ip;
      });
    },

    // Get all stats (for admin purposes)
    getAllStats: function() {
      ensureStatsLoaded();
      return JSON.parse(JSON.stringify(statsCache));
    },

    // Get all ratings (for admin purposes)
    getAllRatings: function() {
      ensureRatingsLoaded();
      return JSON.parse(JSON.stringify(ratingsCache));
    },

    // Force flush to disk (for testing or shutdown)
    flushSync: flushSync,

    // Reset in-memory cache (for testing only)
    _resetCache: function() {
      statsCache = null;
      ratingsCache = null;
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pendingFlush = false;
    }
  };

  exports.DataStore = DataStore;
})();
