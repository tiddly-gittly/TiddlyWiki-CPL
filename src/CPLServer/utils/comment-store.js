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
    var suffix = Config.getServerSuffix();
    return path.join(COMMENTS_DIR, sanitized + suffix + '.json');
  }

  // Get all comment files for a plugin (across all servers)
  function getAllCommentsFiles(pluginTitle) {
    var sanitized = pluginTitle.replace(/[\\\/:?*"<>|]/g, '_');
    var files = [];
    
    if (!fs.existsSync(COMMENTS_DIR)) {
      return files;
    }
    
    var pattern = new RegExp('^' + sanitized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\.[^.]+)?\\.json$');
    fs.readdirSync(COMMENTS_DIR).forEach(function(file) {
      if (pattern.test(file)) {
        files.push(path.join(COMMENTS_DIR, file));
      }
    });
    
    return files;
  }

  // Aggregate comments from all server-specific files
  function aggregateComments(pluginTitle) {
    var files = getAllCommentsFiles(pluginTitle);
    var allComments = [];
    var seenIds = new Set();
    
    files.forEach(function(filePath) {
      try {
        if (fs.existsSync(filePath)) {
          var content = fs.readFileSync(filePath, 'utf-8');
          var data = JSON.parse(content);
          
          if (data.comments && Array.isArray(data.comments)) {
            data.comments.forEach(function(comment) {
              // Deduplicate by ID (first occurrence wins)
              if (!seenIds.has(comment.id)) {
                seenIds.add(comment.id);
                allComments.push(comment);
              }
            });
          }
        }
      } catch (e) {
        console.error('[CPL-Server] Error reading ' + filePath + ':', e.message);
      }
    });
    
    // Sort by timestamp (newest first)
    allComments.sort(function(a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    return allComments;
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
    // Get all comments for a plugin (aggregated from all servers, optionally filter by status)
    getComments: function(pluginTitle, status) {
      var comments = aggregateComments(pluginTitle);
      if (status) {
        return comments.filter(function(c) { return c.status === status; });
      }
      return comments;
    },

    // Add a new comment (writes to server-specific file)
    addComment: function(pluginTitle, comment) {
      ensureLoaded(pluginTitle);
      
      if (!commentsCache[pluginTitle].comments) {
        commentsCache[pluginTitle].comments = [];
      }

      commentsCache[pluginTitle].comments.push(comment);
      flushAsync(pluginTitle);
      return comment;
    },

    // Update comment status (updates in server-specific file where comment exists)
    updateCommentStatus: function(pluginTitle, commentId, status) {
      // Find which server file contains this comment
      var files = getAllCommentsFiles(pluginTitle);
      
      for (var i = 0; i < files.length; i++) {
        var filePath = files[i];
        try {
          var content = fs.readFileSync(filePath, 'utf-8');
          var data = JSON.parse(content);
          
          if (data.comments) {
            var comment = data.comments.find(function(c) { return c.id === commentId; });
            if (comment) {
              comment.status = status;
              comment.updatedAt = new Date().toISOString();
              fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
              return comment;
            }
          }
        } catch (e) {
          console.error('[CPL-Server] Error updating comment in ' + filePath + ':', e.message);
        }
      }
      
      return null;
    },

    // Delete a comment (deletes from server-specific file where comment exists)
    deleteComment: function(pluginTitle, commentId) {
      var files = getAllCommentsFiles(pluginTitle);
      
      for (var i = 0; i < files.length; i++) {
        var filePath = files[i];
        try {
          var content = fs.readFileSync(filePath, 'utf-8');
          var data = JSON.parse(content);
          
          if (data.comments) {
            var index = data.comments.findIndex(function(c) { return c.id === commentId; });
            if (index >= 0) {
              data.comments.splice(index, 1);
              fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
              return true;
            }
          }
        } catch (e) {
          console.error('[CPL-Server] Error deleting comment from ' + filePath + ':', e.message);
        }
      }
      
      return false;
    },

    // Get pending comments (aggregated from all servers)
    getPendingComments: function() {
      var pending = [];
      
      if (!fs.existsSync(COMMENTS_DIR)) {
        return pending;
      }
      
      // Get all comment files
      var allFiles = fs.readdirSync(COMMENTS_DIR).filter(function(f) {
        return f.endsWith('.json');
      });
      
      allFiles.forEach(function(file) {
        var filePath = path.join(COMMENTS_DIR, file);
        try {
          var content = fs.readFileSync(filePath, 'utf-8');
          var data = JSON.parse(content);
          
          if (data.comments) {
            data.comments.forEach(function(c) {
              if (c.status === 'pending') {
                pending.push({
                  pluginTitle: data.pluginTitle,
                  comment: c
                });
              }
            });
          }
        } catch (e) {
          console.error('[CPL-Server] Error reading ' + filePath + ':', e.message);
        }
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
