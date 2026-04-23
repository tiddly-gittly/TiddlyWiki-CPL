/*\
title: $:/plugins/Gk0Wk/CPL-Server/routes/get-download-plugin.js
type: application/javascript
module-type: route

GET /cpl/api/download-plugin/:pluginTitle - Download plugin file
Checks wiki/files/plugin-fetched/ first, then wiki/files/plugin-offline/
\*/

const fs = require('fs');
const path = require('path');
const { DataStore } = require('$:/plugins/Gk0Wk/CPL-Server/utils/data-store.js');
const { RateLimiter } = require('$:/plugins/Gk0Wk/CPL-Server/utils/rate-limiter.js');

exports.method = 'GET';
exports.path = /^\/cpl\/api\/download-plugin\/(.+)$/;

/** Sanitize plugin title to prevent directory traversal */
const sanitizeFilename = (title) => title.replace(/[\\\/:*?"<>|]/g, '_').replace(/\.+$/g, '');

const findPluginFile = (pluginTitle) => {
  const baseDir = path.resolve('wiki/files');
  const sanitized = sanitizeFilename(pluginTitle);
  
  // Try plugin-fetched first
  const fetchedPath = path.join(baseDir, 'plugin-fetched', `${sanitized}.json`);
  if (fs.existsSync(fetchedPath)) {
    return fetchedPath;
  }
  
  // Fallback to plugin-offline
  const offlinePath = path.join(baseDir, 'plugin-offline', `${sanitized}.json`);
  if (fs.existsSync(offlinePath)) {
    return offlinePath;
  }
  
  return null;
};

exports.handler = (request, response, state) => {
  try {
    const pluginTitle = decodeURIComponent(state.params[0]);
    const filePath = findPluginFile(pluginTitle);
    
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
    const ip = RateLimiter.getClientIp(request);
    if (RateLimiter.canDownload(pluginTitle, ip)) {
      RateLimiter.recordDownload(pluginTitle, ip);
      DataStore.updateDownloadStats(pluginTitle, ip);
    }
    
    // Read and serve the file
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    state.sendResponse(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(pluginTitle)}.json"`
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
