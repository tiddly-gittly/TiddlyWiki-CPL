/*\
title: $:/plugins/Gk0Wk/CPL-Server/utils/data-store.js
type: application/javascript
module-type: library

Data storage utilities for CPL Server
\*/

(function() {
  'use strict';

  var fs = require('fs');
  var path = require('path');
  // TiddlyWiki instance for utility functions (optional)
  var $tw = null;
  try {
    $tw = require('tiddlywiki').TiddlyWiki();
  } catch (e) {
    // Not running in TiddlyWiki context
  }

  // Data directory path
  var DATA_DIR = path.resolve(process.cwd(), 'data');
  var STATS_FILE = path.join(DATA_DIR, 'stats.json');
  var RATINGS_FILE = path.join(DATA_DIR, 'ratings.json');

  // Ensure data directory exists
  function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  // Read JSON file with default
  function readJsonFile(filePath, defaultValue) {
    try {
      if (fs.existsSync(filePath)) {
        var content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (e) {
      console.error('[CPL-Server] Error reading ' + filePath + ':', e.message);
    }
    return defaultValue || {};
  }

  // Write JSON file
  function writeJsonFile(filePath, data) {
    try {
      ensureDataDir();
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[CPL-Server] Error writing ' + filePath + ':', e.message);
      return false;
    }
  }

  // Data Store API
  var DataStore = {
    // Get download stats for a plugin
    getStats: function(pluginTitle) {
      var stats = readJsonFile(STATS_FILE, {});
      return stats[pluginTitle] || {
        downloadCount: 0,
        lastUpdated: null,
        downloadsByIp: {}
      };
    },

    // Update download stats for a plugin
    updateDownloadStats: function(pluginTitle, ip) {
      var stats = readJsonFile(STATS_FILE, {});
      
      if (!stats[pluginTitle]) {
        stats[pluginTitle] = {
          downloadCount: 0,
          lastUpdated: null,
          downloadsByIp: {}
        };
      }

      stats[pluginTitle].downloadCount++;
      stats[pluginTitle].lastUpdated = new Date().toISOString();
      stats[pluginTitle].downloadsByIp[ip] = new Date().toISOString();

      writeJsonFile(STATS_FILE, stats);
      return stats[pluginTitle];
    },

    // Get ratings for a plugin
    getRatings: function(pluginTitle) {
      var ratings = readJsonFile(RATINGS_FILE, {});
      return ratings[pluginTitle] || {
        ratings: [],
        averageRating: 0,
        totalRatings: 0
      };
    },

    // Add a rating for a plugin
    addRating: function(pluginTitle, ip, rating) {
      var ratings = readJsonFile(RATINGS_FILE, {});
      
      if (!ratings[pluginTitle]) {
        ratings[pluginTitle] = {
          ratings: [],
          averageRating: 0,
          totalRatings: 0
        };
      }

      var pluginRatings = ratings[pluginTitle];
      
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

      writeJsonFile(RATINGS_FILE, ratings);
      return pluginRatings;
    },

    // Check if IP has rated a plugin
    hasRated: function(pluginTitle, ip) {
      var ratings = readJsonFile(RATINGS_FILE, {});
      var pluginRatings = ratings[pluginTitle];
      
      if (!pluginRatings || !pluginRatings.ratings) {
        return false;
      }

      return pluginRatings.ratings.some(function(r) {
        return r.ip === ip;
      });
    },

    // Get all stats (for admin purposes)
    getAllStats: function() {
      return readJsonFile(STATS_FILE, {});
    },

    // Get all ratings (for admin purposes)
    getAllRatings: function() {
      return readJsonFile(RATINGS_FILE, {});
    }
  };

  exports.DataStore = DataStore;
})();
