/*\
title: $:/plugins/Gk0Wk/CPL-Server/routes/get-auth-github.js
type: application/javascript
module-type: route

GET /cpl/api/auth/github/callback?code=... - GitHub OAuth callback
Exchanges code for access token, fetches user profile, returns JWT.
\*/

(function() {
  'use strict';

  var Auth = require('$:/plugins/Gk0Wk/CPL-Server/utils/auth.js').Auth;
  var Config = require('$:/plugins/Gk0Wk/CPL-Server/utils/config.js').Config;

  exports.method = 'GET';
  exports.path = /^\/cpl\/api\/auth\/github\/callback$/;

  exports.handler = function(request, response, state) {
    try {
      var url = require('url');
      var parsedUrl = url.parse(request.url, true);
      var code = parsedUrl.query.code;

      if (!code) {
        state.sendResponse(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'Missing authorization code'
        }));
        return;
      }

      if (!Config.githubClientId || !Config.githubClientSecret) {
        state.sendResponse(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'GitHub OAuth not configured. Set CPL_GITHUB_CLIENT_ID and CPL_GITHUB_CLIENT_SECRET.'
        }));
        return;
      }

      // Exchange code for access token
      Auth.exchangeGitHubCode(code, function(err, tokenData) {
        if (err || !tokenData || !tokenData.access_token) {
          console.error('[CPL-Server] GitHub OAuth token exchange failed:', err || tokenData);
          state.sendResponse(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }, JSON.stringify({
            success: false,
            error: 'Failed to exchange GitHub authorization code'
          }));
          return;
        }

        // Fetch user profile
        Auth.fetchGitHubUser(tokenData.access_token, function(err, githubUser) {
          if (err || !githubUser || !githubUser.id) {
            console.error('[CPL-Server] Failed to fetch GitHub user:', err || githubUser);
            state.sendResponse(400, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }, JSON.stringify({
              success: false,
              error: 'Failed to fetch GitHub user profile'
            }));
            return;
          }

          // Generate JWT
          var user = {
            githubId: String(githubUser.id),
            username: githubUser.login || githubUser.name || 'user' + githubUser.id,
            avatar: githubUser.avatar_url || ''
          };

          var token = Auth.generateToken(user);

          state.sendResponse(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }, JSON.stringify({
            success: true,
            token: token,
            user: user
          }));
        });
      });
    } catch (error) {
      console.error('[CPL-Server] Error in auth-github handler:', error);
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
