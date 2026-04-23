/*\
Title: $:/plugins/Gk0Wk/CPL-Server/routes/get-changelog.js
Type: application/javascript
Module-Type: route

GET /cpl/api/changelog/:pluginTitle - Get plugin changelog
\*/

(function() {
  'use strict';

  exports.method = 'GET';
  exports.path = /^\/cpl\/api\/changelog\/(.+)$/;

  exports.handler = function(request, response, state) {
    try {
      var $tw = state.wiki;
      
      // Get plugin title from URL
      var pluginTitle = decodeURIComponent(state.params[0]);
      
      // Try to find changelog tiddler
      // Check multiple possible title formats
      var changelogTitles = [
        pluginTitle + '/changelog',
        pluginTitle + '/ChangeLog',
        pluginTitle + '/CHANGELOG',
        pluginTitle + '/history',
        pluginTitle + '/History',
        pluginTitle + '/HISTORY'
      ];
      
      var changelogContent = null;
      var changelogTiddler = null;
      
      for (var i = 0; i < changelogTitles.length; i++) {
        var tiddler = $tw.wiki.getTiddler(changelogTitles[i]);
        if (tiddler) {
          changelogTiddler = tiddler;
          changelogContent = tiddler.fields.text;
          break;
        }
      }

      // If not found as sub-tiddler, check if the plugin has changelog in fields
      if (!changelogContent) {
        var pluginTiddler = $tw.wiki.getTiddler(pluginTitle);
        if (pluginTiddler && pluginTiddler.fields.changelog) {
          changelogContent = pluginTiddler.fields.changelog;
        }
      }

      // Send response
      if (changelogContent) {
        state.sendResponse(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        }, JSON.stringify({
          pluginTitle: pluginTitle,
          hasChangelog: true,
          changelog: changelogContent,
          tiddlerTitle: changelogTiddler ? changelogTiddler.fields.title : null,
          modified: changelogTiddler ? changelogTiddler.fields.modified : null
        }));
      } else {
        state.sendResponse(404, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({
          pluginTitle: pluginTitle,
          hasChangelog: false,
          changelog: null,
          message: 'No changelog found for this plugin'
        }));
      }
    } catch (error) {
      console.error('[CPL-Server] Error in changelog handler:', error);
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
