/*\
title: $:/plugins/Gk0Wk/CPL-Server/routes/get-all-stats.js
type: application/javascript
module-type: route

GET /cpl/api/stats - Get all plugins statistics
\*/

(function() {
  'use strict';

  var DataStore = require('$:/plugins/Gk0Wk/CPL-Server/utils/data-store.js').DataStore;

  exports.method = 'GET';
  exports.path = /^\/cpl\/api\/stats$/;

  exports.handler = function(request, response, state) {
    try {
    // Get all stats
    var allStats = DataStore.getAllStats();
    var allRatings = DataStore.getAllRatings();
    
    // Combine into a simple format
    var result = {};
    
    for (var pluginTitle in allStats) {
      result[pluginTitle] = {
        downloadCount: allStats[pluginTitle].downloadCount || 0,
        averageRating: 0,
        totalRatings: 0
      };
    }
    
    for (var pluginTitle in allRatings) {
      if (!result[pluginTitle]) {
        result[pluginTitle] = {
          downloadCount: 0,
          averageRating: 0,
          totalRatings: 0
        };
      }
      result[pluginTitle].averageRating = allRatings[pluginTitle].averageRating || 0;
      result[pluginTitle].totalRatings = allRatings[pluginTitle].totalRatings || 0;
    }
    
    // Send response
    state.sendResponse(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60' // Cache for 1 minute
    }, JSON.stringify({
      count: Object.keys(result).length,
      plugins: result
    }));
    } catch (error) {
      console.error('[CPL-Server] Error in all-stats handler:', error);
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
