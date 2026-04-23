/*\
title: $:/plugins/Gk0Wk/CPL-Server/routes/post-rate.js
type: application/javascript
module-type: route

POST /cpl/api/rate/:pluginTitle - Submit a plugin rating
\*/

(function() {
  'use strict';

  var DataStore = require('$:/plugins/Gk0Wk/CPL-Server/utils/data-store.js').DataStore;
  var RateLimiter = require('$:/plugins/Gk0Wk/CPL-Server/utils/rate-limiter.js').RateLimiter;

  exports.method = 'POST';
  exports.path = /^\/cpl\/api\/rate\/(.+)$/;
  exports.bodyFormat = 'string'; // Receive body as string

  function parseBody(body) {
    try {
      return JSON.parse(body);
    } catch (e) {
      return null;
    }
  }

  function validateRating(rating) {
    var num = parseInt(rating, 10);
    return !isNaN(num) && num >= 1 && num <= 5;
  }

  exports.handler = function(request, response, state) {
    try {
    // Get plugin title from URL
    var pluginTitle = decodeURIComponent(state.params[0]);
    
    // Parse request body
    var body = parseBody(state.data);
    
    if (!body || typeof body.rating === 'undefined') {
      state.sendResponse(400, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }, JSON.stringify({
        success: false,
        error: 'Missing rating field. Expected: { rating: number(1-5) }'
      }));
      return;
    }

    // Validate rating
    if (!validateRating(body.rating)) {
      state.sendResponse(400, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }, JSON.stringify({
        success: false,
        error: 'Invalid rating. Must be an integer between 1 and 5.'
      }));
      return;
    }

    // Get client IP
    var ip = RateLimiter.getClientIp(request);
    
    // Check if already rated
    var canRate = RateLimiter.canRate(pluginTitle, ip, DataStore);
    
    if (!canRate) {
      state.sendResponse(429, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }, JSON.stringify({
        success: false,
        error: 'You have already rated this plugin.'
      }));
      return;
    }

    // Record the rating
    RateLimiter.recordRating(pluginTitle, ip);
    var ratings = DataStore.addRating(pluginTitle, ip, parseInt(body.rating, 10));

    // Send success response
    state.sendResponse(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }, JSON.stringify({
      success: true,
      message: 'Rating submitted successfully',
      plugintitle: pluginTitle,
      averageRating: ratings.averageRating,
      totalRatings: ratings.totalRatings
    }));
    } catch (error) {
      console.error('[CPL-Server] Error in rate handler:', error);
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
