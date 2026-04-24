/*\
title: $:/plugins/Gk0Wk/CPL-Server/utils/auth.js
type: application/javascript
module-type: library

Authentication utilities for CPL Server
GitHub OAuth + JWT token management.
\*/

(function() {
  'use strict';

  var jwt = require('jsonwebtoken');
  var Config = require('$:/plugins/Gk0Wk/CPL-Server/utils/config.js').Config;

  var JWT_SECRET = Config.jwtSecret;
  var JWT_EXPIRY = Config.jwtExpiryDays + 'd';

  var Auth = {
    // Generate JWT token for authenticated user
    generateToken: function(user) {
      return jwt.sign(
        {
          githubId: user.githubId,
          username: user.username,
          avatar: user.avatar
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );
    },

    // Verify JWT token from request
    verifyToken: function(token) {
      try {
        return jwt.verify(token, JWT_SECRET);
      } catch (e) {
        return null;
      }
    },

    // Extract and verify token from request headers
    getUserFromRequest: function(request) {
      var authHeader = request.headers['authorization'] || '';
      var match = authHeader.match(/^Bearer\s+(.+)$/);
      if (!match) return null;
      
      var token = match[1];
      return Auth.verifyToken(token);
    },

    // Exchange GitHub OAuth code for access token
    exchangeGitHubCode: function(code, callback) {
      var https = require('https');
      var querystring = require('querystring');
      
      var postData = querystring.stringify({
        client_id: Config.githubClientId,
        client_secret: Config.githubClientSecret,
        code: code
      });

      var options = {
        hostname: 'github.com',
        path: '/login/oauth/access_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      var req = https.request(options, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          try {
            var result = JSON.parse(data);
            callback(null, result);
          } catch (e) {
            callback(e, null);
          }
        });
      });

      req.on('error', function(err) {
        callback(err, null);
      });

      req.write(postData);
      req.end();
    },

    // Fetch GitHub user profile with access token
    fetchGitHubUser: function(accessToken, callback) {
      var https = require('https');
      
      var options = {
        hostname: 'api.github.com',
        path: '/user',
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'User-Agent': 'TiddlyWiki-CPL-Server',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      var req = https.request(options, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          try {
            var user = JSON.parse(data);
            callback(null, user);
          } catch (e) {
            callback(e, null);
          }
        });
      });

      req.on('error', function(err) {
        callback(err, null);
      });

      req.end();
    },

    // Check if user is admin
    isAdmin: function(user) {
      if (!user || !user.githubId) return false;
      return Config.isAdmin(user.githubId);
    }
  };

  exports.Auth = Auth;
})();
