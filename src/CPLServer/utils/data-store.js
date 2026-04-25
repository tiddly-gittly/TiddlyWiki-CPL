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
      dataDir: path.resolve(process.cwd(), 'data'),
      getServerSuffix: function() { return ''; }
    };
  }

  var DATA_DIR = Config.dataDir;
  
  // Get file paths with server suffix
  function getStatsFile() {
    return path.join(DATA_DIR, 'stats' + Config.getServerSuffix() + '.json');
  }
  
  function getRatingsFile() {
    return path.join(DATA_DIR, 'ratings' + Config.getServerSuffix() + '.json');
  }
  
  var STATS_FILE = getStatsFile();
  var RATINGS_FILE = getRatingsFile();

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

  // Aggregate data from all server-specific files
  function aggregateStats() {
    var aggregated = {};
    var files = fs.readdirSync(DATA_DIR).filter(function(f) {
      return f.match(/^stats(\.[^.]+)?\.json$/);
    });
    
    files.forEach(function(file) {
      var filePath = path.join(DATA_DIR, file);
      var data = loadFromDisk(filePath);
      
      Object.keys(data).forEach(function(pluginTitle) {
        if (!aggregated[pluginTitle]) {
          aggregated[pluginTitle] = {
            downloadCount: 0,
            lastUpdated: null,
            downloadsByIp: {}
          };
        }
        
        // Sum download counts
        aggregated[pluginTitle].downloadCount += data[pluginTitle].downloadCount || 0;
        
        // Merge downloadsByIp
        if (data[pluginTitle].downloadsByIp) {
          Object.assign(aggregated[pluginTitle].downloadsByIp, data[pluginTitle].downloadsByIp);
        }
        
        // Keep most recent lastUpdated
        if (data[pluginTitle].lastUpdated) {
          if (!aggregated[pluginTitle].lastUpdated || 
              data[pluginTitle].lastUpdated > aggregated[pluginTitle].lastUpdated) {
            aggregated[pluginTitle].lastUpdated = data[pluginTitle].lastUpdated;
          }
        }
      });
    });
    
    return aggregated;
  }

  function aggregateRatings() {
    var aggregated = {};
    var files = fs.readdirSync(DATA_DIR).filter(function(f) {
      return f.match(/^ratings(\.[^.]+)?\.json$/);
    });
    
    files.forEach(function(file) {
      var filePath = path.join(DATA_DIR, file);
      var data = loadFromDisk(filePath);
      
      Object.keys(data).forEach(function(pluginTitle) {
        if (!aggregated[pluginTitle]) {
          aggregated[pluginTitle] = {
            ratings: [],
            averageRating: 0,
            totalRatings: 0
          };
        }
        
        // Merge ratings arrays (deduplicate by IP)
        if (data[pluginTitle].ratings) {
          data[pluginTitle].ratings.forEach(function(rating) {
            var existingIndex = aggregated[pluginTitle].ratings.findIndex(function(r) {
              return r.ip === rating.ip;
            });
            
            if (existingIndex >= 0) {
              // Keep the most recent rating for this IP
              if (rating.timestamp > aggregated[pluginTitle].ratings[existingIndex].timestamp) {
                aggregated[pluginTitle].ratings[existingIndex] = rating;
              }
            } else {
              aggregated[pluginTitle].ratings.push(rating);
            }
          });
        }
      });
    });
    
    // Recalculate averages
    Object.keys(aggregated).forEach(function(pluginTitle) {
      var ratings = aggregated[pluginTitle].ratings;
      if (ratings.length > 0) {
        var total = ratings.reduce(function(sum, r) { return sum + r.rating; }, 0);
        aggregated[pluginTitle].averageRating = Math.round((total / ratings.length) * 10) / 10;
        aggregated[pluginTitle].totalRatings = ratings.length;
      }
    });
    
    return aggregated;
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
    // Get download stats for a plugin (aggregated from all servers)
    getStats: function(pluginTitle) {
      var aggregated = aggregateStats();
      return aggregated[pluginTitle] || {
        downloadCount: 0,
        lastUpdated: null,
        downloadsByIp: {}
      };
    },

    // Update download stats for a plugin (writes to server-specific file)
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

    // Get ratings for a plugin (aggregated from all servers)
    getRatings: function(pluginTitle) {
      var aggregated = aggregateRatings();
      return aggregated[pluginTitle] || {
        ratings: [],
        averageRating: 0,
        totalRatings: 0
      };
    },

    // Add a rating for a plugin (writes to server-specific file)
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

    // Check if IP has rated a plugin (checks aggregated data)
    hasRated: function(pluginTitle, ip) {
      var aggregated = aggregateRatings();
      var pluginRatings = aggregated[pluginTitle];
      
      if (!pluginRatings || !pluginRatings.ratings) {
        return false;
      }

      return pluginRatings.ratings.some(function(r) {
        return r.ip === ip;
      });
    },

    // Get all stats (aggregated from all servers)
    getAllStats: function() {
      return JSON.parse(JSON.stringify(aggregateStats()));
    },

    // Get all ratings (aggregated from all servers)
    getAllRatings: function() {
      return JSON.parse(JSON.stringify(aggregateRatings()));
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
