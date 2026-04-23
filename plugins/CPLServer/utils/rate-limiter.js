/*\
Title: $:/plugins/Gk0Wk/CPL-Server/utils/rate-limiter.js
Type: application/javascript
Module-Type: library

IP-based rate limiting for CPL Server
\*/

(function() {
  'use strict';

  // Rate limiter state
  var downloadLimits = {};
  var ratingLimits = {};

  // Configuration
  var DOWNLOAD_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  var CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  // Get client IP from request
  function getClientIp(request) {
    // Check for forwarded IP (if behind proxy)
    var forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    // Check other headers
    var realIp = request.headers['x-real-ip'];
    if (realIp) {
      return realIp;
    }

    // Fall back to connection remote address
    return request.connection.remoteAddress || 
           request.socket.remoteAddress ||
           'unknown';
  }

  // Clean up old entries periodically
  function cleanup() {
    var now = Date.now();
    
    // Clean download limits
    for (var plugin in downloadLimits) {
      for (var ip in downloadLimits[plugin]) {
        if (now - downloadLimits[plugin][ip] > DOWNLOAD_WINDOW_MS) {
          delete downloadLimits[plugin][ip];
        }
      }
    }

    // Clean rating limits (keep forever in memory, but clean empty plugins)
    for (var plugin in ratingLimits) {
      if (Object.keys(ratingLimits[plugin]).length === 0) {
        delete ratingLimits[plugin];
      }
    }
  }

  // Start cleanup interval
  setInterval(cleanup, CLEANUP_INTERVAL_MS);

  // Rate Limiter API
  var RateLimiter = {
    // Get client IP
    getClientIp: getClientIp,

    // Check if download is allowed (one per IP per hour per plugin)
    canDownload: function(pluginTitle, ip) {
      if (!downloadLimits[pluginTitle]) {
        downloadLimits[pluginTitle] = {};
      }

      var lastDownload = downloadLimits[pluginTitle][ip];
      if (!lastDownload) {
        return true;
      }

      var now = Date.now();
      return (now - lastDownload) > DOWNLOAD_WINDOW_MS;
    },

    // Record a download
    recordDownload: function(pluginTitle, ip) {
      if (!downloadLimits[pluginTitle]) {
        downloadLimits[pluginTitle] = {};
      }
      downloadLimits[pluginTitle][ip] = Date.now();
    },

    // Check if rating is allowed (one per IP per plugin, forever)
    canRate: function(pluginTitle, ip, dataStore) {
      // Check in-memory cache first
      if (ratingLimits[pluginTitle] && ratingLimits[pluginTitle][ip]) {
        return false;
      }

      // Check persistent storage
      if (dataStore && dataStore.hasRated(pluginTitle, ip)) {
        // Cache the result
        if (!ratingLimits[pluginTitle]) {
          ratingLimits[pluginTitle] = {};
        }
        ratingLimits[pluginTitle][ip] = true;
        return false;
      }

      return true;
    },

    // Record a rating
    recordRating: function(pluginTitle, ip) {
      if (!ratingLimits[pluginTitle]) {
        ratingLimits[pluginTitle] = {};
      }
      ratingLimits[pluginTitle][ip] = true;
    },

    // Get rate limit status for debugging
    getStatus: function() {
      var downloadCount = 0;
      for (var plugin in downloadLimits) {
        downloadCount += Object.keys(downloadLimits[plugin]).length;
      }

      var ratingCount = 0;
      for (var plugin in ratingLimits) {
        ratingCount += Object.keys(ratingLimits[plugin]).length;
      }

      return {
        trackedDownloads: downloadCount,
        trackedRatings: ratingCount
      };
    }
  };

  exports.RateLimiter = RateLimiter;
})();
