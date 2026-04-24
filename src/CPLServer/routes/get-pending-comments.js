/*\
title: $:/plugins/Gk0Wk/CPL-Server/routes/get-pending-comments.js
type: application/javascript
module-type: route

GET /cpl/api/comments/pending - Get all pending comments (admin only)
\*/

(function() {
  'use strict';

  var CommentStore = require('$:/plugins/Gk0Wk/CPL-Server/utils/comment-store.js').CommentStore;
  var Auth = require('$:/plugins/Gk0Wk/CPL-Server/utils/auth.js').Auth;

  exports.method = 'GET';
  exports.path = /^\/cpl\/api\/comments\/pending$/;

  exports.handler = function(request, response, state) {
    try {
      // Verify authentication
      var user = Auth.getUserFromRequest(request);
      if (!user) {
        state.sendResponse(401, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'Authentication required'
        }));
        return;
      }

      // Verify admin privilege
      if (!Auth.isAdmin(user)) {
        state.sendResponse(403, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'Admin privileges required'
        }));
        return;
      }

      var pending = CommentStore.getPendingComments();

      state.sendResponse(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }, JSON.stringify({
        success: true,
        comments: pending
      }));
    } catch (error) {
      console.error('[CPL-Server] Error in get-pending-comments handler:', error);
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
