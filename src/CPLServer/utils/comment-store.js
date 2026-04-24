/*\
title: $:/plugins/Gk0Wk/CPL-Server/utils/comment-store.js
type: application/javascript
module-type: library

Comment storage with in-memory cache and async flush.
Comments stored per-plugin in data/comments/{sanitized-plugin-title}.json
\*/

(function() {
  'use strict';

  var fs = require('fs');
  var path = require('path');
  var Config = require('$:/plugins/Gk0Wk/CPL-Server/utils/config.js').Config;

  var COMMENTS_DIR = Config.commentsDir;

  // In-memory cache: { pluginTitle: { comments: [...], loaded: boolean } }
  var commentsCache = {};
  var flushTimer = null;
  var pendingFlushes = new Set();

  function ensureCommentsDir() {
    if (!fs.existsSync(COMMENTS_DIR)) {
      fs.mkdirSync(COMMENTS_DIR, { recursive: true });
    }
  }

  function getCommentsFilePath(pluginTitle) {
    var sanitized = pluginTitle.replace(/[\\\/:?*"<>|]/g, '_');
    return path.join(COMMENTS_DIR, sanitized + '.json');
  }

  function loadCommentsFromDisk(pluginTitle) {
    var filePath = getCommentsFilePath(pluginTitle);
    try {
      if (fs.existsSync(filePath)) {
        var content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (e) {
      console.error('[CPL-Server] Error reading comments for ' + pluginTitle + ':', e.message);
    }
    return { pluginTitle: pluginTitle, comments: [] };
  }

  function ensureLoaded(pluginTitle) {
    if (!commentsCache[pluginTitle] || !commentsCache[pluginTitle].loaded) {
      commentsCache[pluginTitle] = loadCommentsFromDisk(pluginTitle);
      commentsCache[pluginTitle].loaded = true;
    }
  }

  function flushSync(pluginTitle) {
    try {
      ensureCommentsDir();
      var filePath = getCommentsFilePath(pluginTitle);
      var data = commentsCache[pluginTitle];
      if (data) {
        // Don't persist the 'loaded' flag
        var persistData = {
          pluginTitle: data.pluginTitle,
          comments: data.comments
        };
        fs.writeFileSync(filePath, JSON.stringify(persistData, null, 2), 'utf-8');
      }
    } catch (e) {
      console.error('[CPL-Server] Error flushing comments for ' + pluginTitle + ':', e.message);
    }
  }

  function flushAsync(pluginTitle) {
    pendingFlushes.add(pluginTitle);
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(function() {
      pendingFlushes.forEach(function(title) {
        flushSync(title);
      });
      pendingFlushes.clear();
    }, 3000); // Flush at most every 3 seconds
  }

  // Flush all on exit
  process.on('exit', function() {
    Object.keys(commentsCache).forEach(function(title) {
      flushSync(title);
    });
  });
  process.on('SIGINT', function() {
    Object.keys(commentsCache).forEach(function(title) {
      flushSync(title);
    });
    process.exit(0);
  });
  process.on('SIGTERM', function() {
    Object.keys(commentsCache).forEach(function(title) {
      flushSync(title);
    });
    process.exit(0);
  });

  var CommentStore = {
    // Get all comments for a plugin (optionally filter by status)
    getComments: function(pluginTitle, status) {
      ensureLoaded(pluginTitle);
      var comments = commentsCache[pluginTitle].comments || [];
      if (status) {
        return comments.filter(function(c) { return c.status === status; });
      }
      return comments;
    },

    // Add a new comment
    addComment: function(pluginTitle, comment) {
      ensureLoaded(pluginTitle);
      
      if (!commentsCache[pluginTitle].comments) {
        commentsCache[pluginTitle].comments = [];
      }

      commentsCache[pluginTitle].comments.push(comment);
      flushAsync(pluginTitle);
      return comment;
    },

    // Update comment status
    updateCommentStatus: function(pluginTitle, commentId, status) {
      ensureLoaded(pluginTitle);
      
      var comments = commentsCache[pluginTitle].comments || [];
      var comment = comments.find(function(c) { return c.id === commentId; });
      
      if (comment) {
        comment.status = status;
        comment.updatedAt = new Date().toISOString();
        flushAsync(pluginTitle);
        return comment;
      }
      
      return null;
    },

    // Delete a comment
    deleteComment: function(pluginTitle, commentId) {
      ensureLoaded(pluginTitle);
      
      var comments = commentsCache[pluginTitle].comments || [];
      var index = comments.findIndex(function(c) { return c.id === commentId; });
      
      if (index >= 0) {
        comments.splice(index, 1);
        flushAsync(pluginTitle);
        return true;
      }
      
      return false;
    },

    // Get pending comments (for admin moderation)
    getPendingComments: function() {
      var pending = [];
      Object.keys(commentsCache).forEach(function(pluginTitle) {
        ensureLoaded(pluginTitle);
        var comments = commentsCache[pluginTitle].comments || [];
        comments.forEach(function(c) {
          if (c.status === 'pending') {
            pending.push({
              pluginTitle: pluginTitle,
              comment: c
            });
          }
        });
      });
      return pending;
    },

    // Force flush all
    flushAllSync: function() {
      Object.keys(commentsCache).forEach(function(title) {
        flushSync(title);
      });
    }
  };

  exports.CommentStore = CommentStore;
})();
