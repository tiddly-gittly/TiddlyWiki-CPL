/*\
title: $:/plugins/Gk0Wk/CPL-Server/utils/config.js
type: application/javascript
module-type: library

Environment configuration loader for CPL Server
Loads .env file and exposes typed configuration values.
\*/

(function() {
  'use strict';

  // Load .env file in Node.js context
  try {
    var dotenv = require('dotenv');
    dotenv.config();
  } catch (e) {
    console.warn('[CPL-Server] dotenv not available, using process.env directly');
  }

  function env(key, defaultValue) {
    var value = process.env[key];
    return value !== undefined ? value : defaultValue;
  }

  function envInt(key, defaultValue) {
    var value = process.env[key];
    return value !== undefined ? parseInt(value, 10) : defaultValue;
  }

  function envList(key) {
    var value = process.env[key];
    if (!value) return [];
    return value.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
  }

  var Config = {
    // JWT
    jwtSecret: env('CPL_JWT_SECRET', 'default-dev-secret-change-me'),
    jwtExpiryDays: envInt('CPL_JWT_EXPIRY_DAYS', 30),

    // GitHub OAuth
    githubClientId: env('CPL_GITHUB_CLIENT_ID', ''),
    githubClientSecret: env('CPL_GITHUB_CLIENT_SECRET', ''),

    // Admin
    adminGithubIds: envList('CPL_ADMIN_GITHUB_IDS'),

    // Rate Limiting
    commentRateLimit: envInt('CPL_COMMENT_RATE_LIMIT', 10),

    // Data directories
    dataDir: require('path').resolve(process.cwd(), 'data'),
    commentsDir: require('path').resolve(process.cwd(), 'data', 'comments'),

    // Helpers
    isAdmin: function(githubId) {
      if (!githubId) return false;
      return Config.adminGithubIds.indexOf(String(githubId)) !== -1;
    }
  };

  exports.Config = Config;
})();
