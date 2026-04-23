/*\
Title: $:/plugins/Gk0Wk/CPL-Server/routes/post-download.js
Type: application/javascript
Module-Type: route

POST /cpl/api/download/:pluginTitle - Record a plugin download
\*/

(function() {
  'use strict';

  var DataStore = require('$:/plugins/Gk0Wk/CPL-Server/utils/data-store.js').DataStore;
  var RateLimiter = require('$:/plugins/Gk0Wk/CPL-Server/utils/rate-limiter.js').RateLimiter;

  exports.method = 'POST';
  exports.path = /^\/cpl\/api\/download\/(.+)$/;

  exports.handler = function(request, response, state) {
    // Get plugin title from URL
    var pluginTitle = decodeURIComponent(state.params[0]);
    
    // Get client IP
    var ip = RateLimiter.getClientIp(request);
    
    // Check rate limit
    var canDownload = RateLimiter.canDownload(pluginTitle, ip);
    
    if (canDownload) {
      // Record the download
      RateLimiter.recordDownload(pluginTitle, ip);
      var stats = DataStore.updateDownloadStats(pluginTitle, ip);
      
      // Send success response
      state.sendResponse(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }, JSON.stringify({
        success: true,
        message: 'Download recorded',
        pluginTitle: pluginTitle,
        downloadCount: stats.downloadCount
      }));
    } else {
      // Return current stats without incrementing
      var stats = DataStore.getStats(pluginTitle);
      
      state.sendResponse(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }, JSON.stringify({
        success: true,
        message: 'Download rate limited (already counted recently)',
        pluginTitle: pluginTitle,
        downloadCount: stats.downloadCount
      }));
    }
  };
})();
