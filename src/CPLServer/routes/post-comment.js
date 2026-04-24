/*\
title: $:/plugins/Gk0Wk/CPL-Server/routes/post-comment.js
type: application/javascript
module-type: route

POST /cpl/api/comments/:pluginTitle - Submit a comment
Requires JWT authentication. Comments default to 'pending' status.
\*/

(function() {
  'use strict';

  var CommentStore = require('$:/plugins/Gk0Wk/CPL-Server/utils/comment-store.js').CommentStore;
  var Auth = require('$:/plugins/Gk0Wk/CPL-Server/utils/auth.js').Auth;
  var WikitextFilter = require('$:/plugins/Gk0Wk/CPL-Server/utils/wikitext-filter.js').WikitextFilter;
  var RateLimiter = require('$:/plugins/Gk0Wk/CPL-Server/utils/rate-limiter.js').RateLimiter;
  var Config = require('$:/plugins/Gk0Wk/CPL-Server/utils/config.js').Config;
  var uuid = require('uuid');

  exports.method = 'POST';
  exports.path = /^\/cpl\/api\/comments\/(.+)$/;
  exports.bodyFormat = 'string';

  function parseBody(body) {
    try {
      return JSON.parse(body);
    } catch (e) {
      return null;
    }
  }

  // Simple in-memory rate limit for comments
  var commentLimits = {};
  var COMMENT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

  function canComment(githubId) {
    if (process.env.CPL_TEST_MODE === 'true') return true;
    
    var now = Date.now();
    var userLimit = commentLimits[githubId];
    if (!userLimit) return true;
    
    // Clean old entries
    var recent = userLimit.filter(function(t) { return now - t < COMMENT_WINDOW_MS; });
    commentLimits[githubId] = recent;
    
    return recent.length < Config.commentRateLimit;
  }

  function recordComment(githubId) {
    if (!commentLimits[githubId]) {
      commentLimits[githubId] = [];
    }
    commentLimits[githubId].push(Date.now());
  }

  exports.handler = function(request, response, state) {
    try {
      var pluginTitle = decodeURIComponent(state.params[0]);
      var body = parseBody(state.data);
      
      // Verify authentication
      var user = Auth.getUserFromRequest(request);
      if (!user) {
        state.sendResponse(401, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'Authentication required. Please login with GitHub.'
        }));
        return;
      }

      // Validate content
      if (!body || !body.content || typeof body.content !== 'string') {
        state.sendResponse(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'Missing content field'
        }));
        return;
      }

      var content = body.content.trim();
      if (content.length === 0) {
        state.sendResponse(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'Comment content cannot be empty'
        }));
        return;
      }

      if (content.length > 5000) {
        state.sendResponse(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'Comment content too long (max 5000 characters)'
        }));
        return;
      }

      // Rate limit check
      if (!canComment(user.githubId)) {
        state.sendResponse(429, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'Rate limit exceeded. Maximum ' + Config.commentRateLimit + ' comments per hour.'
        }));
        return;
      }

      // Sanitize wikitext content
      var sanitizedContent = WikitextFilter.sanitize(content);

      // Create comment
      var comment = {
        id: uuid.v4(),
        githubId: user.githubId,
        username: user.username,
        avatar: user.avatar,
        content: sanitizedContent,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      CommentStore.addComment(pluginTitle, comment);
      recordComment(user.githubId);

      state.sendResponse(201, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }, JSON.stringify({
        success: true,
        message: 'Comment submitted for moderation',
        comment: comment
      }));
    } catch (error) {
      console.error('[CPL-Server] Error in post-comment handler:', error);
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
