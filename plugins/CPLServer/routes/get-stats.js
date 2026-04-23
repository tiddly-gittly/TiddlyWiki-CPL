/*\
Title: $:/plugins/Gk0Wk/CPL-Server/routes/get-stats.js
Type: application/javascript
Module-Type: route

GET /cpl/api/stats/:pluginTitle - Get plugin statistics
\*/

(function() {
  'use strict';

  var DataStore = require('$:/plugins/Gk0Wk/CPL-Server/utils/data-store.js').DataStore;

  exports.method = 'GET';
  exports.path = /^\/cpl\/api\/stats\/(.+)$/;

  exports.handler = function(request, response, state) {
    // Get plugin title from URL
    var pluginTitle = decodeURIComponent(state.params[0]);
    
    // Get stats and ratings
    var stats = DataStore.getStats(pluginTitle);
    var ratings = DataStore.getRatings(pluginTitle);
    
    // Send response
    state.sendResponse(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60' // Cache for 1 minute
    }, JSON.stringify({
      pluginTitle: pluginTitle,
      downloadCount: stats.downloadCount,
      downloadLastUpdated: stats.lastUpdated,
      averageRating: ratings.averageRating,
      totalRatings: ratings.totalRatings
    }));
  };
})();
