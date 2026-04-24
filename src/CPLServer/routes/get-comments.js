/*\
title: $:/plugins/Gk0Wk/CPL-Server/routes/get-comments.js
type: application/javascript
module-type: route

GET /cpl/api/comments/:pluginTitle - Get comments for a plugin
Returns only approved comments for regular users.
\*/

(function() {
  'use strict';

  var CommentStore = require('$:/plugins/Gk0Wk/CPL-Server/utils/comment-store.js').CommentStore;
  var Auth = require('$:/plugins/Gk0Wk/CPL-Server/utils/auth.js').Auth;

  exports.method = 'GET';
  exports.path = /^\/cpl\/api\/comments\/(.+)$/;

  exports.handler = function(request, response, state) {
    try {
      var pluginTitle = decodeURIComponent(state.params[0]);
      var user = Auth.getUserFromRequest(request);
      var isAdmin = user && Auth.isAdmin(user);

      // Admins can see all comments including pending
      // Regular users only see approved comments
      var status = isAdmin ? null : 'approved';
      var comments = CommentStore.getComments(pluginTitle, status);

      state.sendResponse(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }, JSON.stringify({
        success: true,
        pluginTitle: pluginTitle,
        comments: comments
      }));
    } catch (error) {
      console.error('[CPL-Server] Error in get-comments handler:', error);
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
