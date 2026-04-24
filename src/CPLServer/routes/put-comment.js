/*\
title: $:/plugins/Gk0Wk/CPL-Server/routes/put-comment.js
type: application/javascript
module-type: route

PUT /cpl/api/comments/:pluginTitle/:commentId - Update comment status (admin only)
Used for moderation: approve, reject, or delete comments.
\*/

(function() {
  'use strict';

  var CommentStore = require('$:/plugins/Gk0Wk/CPL-Server/utils/comment-store.js').CommentStore;
  var Auth = require('$:/plugins/Gk0Wk/CPL-Server/utils/auth.js').Auth;

  exports.method = 'PUT';
  exports.path = /^\/cpl\/api\/comments\/(.+)\/([^\/]+)$/;
  exports.bodyFormat = 'string';

  function parseBody(body) {
    try {
      return JSON.parse(body);
    } catch (e) {
      return null;
    }
  }

  exports.handler = function(request, response, state) {
    try {
      var pluginTitle = decodeURIComponent(state.params[0]);
      var commentId = decodeURIComponent(state.params[1]);
      var body = parseBody(state.data);

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

      // Validate action
      if (!body || !body.status) {
        state.sendResponse(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'Missing status field. Expected: approved, rejected, or deleted'
        }));
        return;
      }

      var status = body.status;
      if (['approved', 'rejected', 'deleted'].indexOf(status) === -1) {
        state.sendResponse(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'Invalid status. Must be approved, rejected, or deleted'
        }));
        return;
      }

      // Handle delete action
      if (status === 'deleted') {
        var deleted = CommentStore.deleteComment(pluginTitle, commentId);
        if (deleted) {
          state.sendResponse(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }, JSON.stringify({
            success: true,
            message: 'Comment deleted'
          }));
        } else {
          state.sendResponse(404, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }, JSON.stringify({
            success: false,
            error: 'Comment not found'
          }));
        }
        return;
      }

      // Update status (approve/reject)
      var comment = CommentStore.updateCommentStatus(pluginTitle, commentId, status);
      
      if (comment) {
        state.sendResponse(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: true,
          message: 'Comment ' + status,
          comment: comment
        }));
      } else {
        state.sendResponse(404, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          success: false,
          error: 'Comment not found'
        }));
      }
    } catch (error) {
      console.error('[CPL-Server] Error in put-comment handler:', error);
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
