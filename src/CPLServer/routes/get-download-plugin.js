/*\
title: $:/plugins/Gk0Wk/CPL-Server/routes/get-download-plugin.js
type: application/javascript
module-type: route

GET /cpl/api/download-plugin/:pluginTitle - Download plugin file
Checks wiki/files/plugin-fetched/ first, then wiki/files/plugin-offline/
\*/

(function() {
  'use strict';

  var fs = require('fs');
  var path = require('path');
  var DataStore = require('$:/plugins/Gk0Wk/CPL-Server/utils/data-store.js').DataStore;
  var RateLimiter = require('$:/plugins/Gk0Wk/CPL-Server/utils/rate-limiter.js').RateLimiter;

  exports.method = 'GET';
  exports.path = /^\/cpl\/api\/download-plugin\/(.+)$/;

  // Sanitize plugin title to prevent directory traversal
  function sanitizeFilename(title) {
    // Remove path separators and parent directory references
    return title.replace(/[\\\/:*?"<>|]/g, '_').replace(/\.+$/g, '');
  }

  function findPluginFile(pluginTitle) {
    var baseDir = path.resolve('wiki/files');
    var sanitized = sanitizeFilename(pluginTitle);
    
    // Try plugin-fetched first
    var fetchedPath = path.join(baseDir, 'plugin-fetched', sanitized + '.json');
    if (fs.existsSync(fetchedPath)) {
      return fetchedPath;
    }
    
    // Fallback to plugin-offline
    var offlinePath = path.join(baseDir, 'plugin-offline', sanitized + '.json');
    if (fs.existsSync(offlinePath)) {
      return offlinePath;
    }
    
    return null;
  }

  exports.handler = function(request, response, state) {
    try {
      var pluginTitle = decodeURIComponent(state.params[0]);
      var filePath = findPluginFile(pluginTitle);
      
      if (!filePath) {
        state.sendResponse(404, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'Plugin file not found'
        }));
        return;
      }
      
      // Track download (with rate limiting)
      var ip = RateLimiter.getClientIp(request);
      if (RateLimiter.canDownload(pluginTitle, ip)) {
        RateLimiter.recordDownload(pluginTitle, ip);
        DataStore.updateDownloadStats(pluginTitle, ip);
      }
      
      // Stream the file
      var fileContent = fs.readFileSync(filePath, 'utf-8');
      state.sendResponse(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': 'attachment; filename="' + sanitizeFilename(pluginTitle) + '.json"'
      }, fileContent);
      
    } catch (error) {
      console.error('[CPL-Server] Error in download-plugin handler:', error);
      state.sendResponse(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }, JSON.stringify({
        success: false,
        error: 'Internal server error'
      }));
    }
  };
})();
