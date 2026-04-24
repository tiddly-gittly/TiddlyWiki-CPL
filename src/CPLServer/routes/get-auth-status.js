/*\
title: $:/plugins/Gk0Wk/CPL-Server/routes/get-auth-status.js
type: application/javascript
module-type: route

GET /cpl/api/auth/status - Check current authentication status
Returns user info if valid JWT is provided.
\*/

(function() {
  'use strict';

  var Auth = require('$:/plugins/Gk0Wk/CPL-Server/utils/auth.js').Auth;

  exports.method = 'GET';
  exports.path = /^\/cpl\/api\/auth\/status$/;

  exports.handler = function(request, response, state) {
    try {
      var user = Auth.getUserFromRequest(request);
      
      if (!user) {
        state.sendResponse(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          authenticated: false
        }));
        return;
      }

      state.sendResponse(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }, JSON.stringify({
        authenticated: true,
        user: {
          githubId: user.githubId,
          username: user.username,
          avatar: user.avatar
        },
        isAdmin: Auth.isAdmin(user)
      }));
    } catch (error) {
      console.error('[CPL-Server] Error in auth-status handler:', error);
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
