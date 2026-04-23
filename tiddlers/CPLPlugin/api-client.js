/*\
Title: $:/plugins/Gk0Wk/CPL-Repo/api-client.js
Type: application/javascript
Module-Type: startup

CPL Server API Client - Standard TiddlyWiki startup module
Provides HTTP API access for download stats, ratings, and changelogs.
\*/

(function() {
  'use strict';

  exports.name = 'cpl-server-api-client';
  exports.platforms = ['browser'];
  exports.after = ['startup'];
  exports.synchronous = true;

  var CPL_API_BASE = '/cpl/api';

  /**
   * Make an HTTP request to the CPL Server API
   */
  function apiRequest(method, endpoint, body, callback) {
    var url = CPL_API_BASE + endpoint;
    var options = {
      url: url,
      type: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (body) {
      options.data = JSON.stringify(body);
    }

    $tw.utils.httpRequest(options).then(function(response) {
      try {
        var data = JSON.parse(response);
        callback(null, data);
      } catch (e) {
        callback(new Error('Invalid JSON response'), null);
      }
    }).catch(function(error) {
      callback(error, null);
    });
  }

  /**
   * CPL Server API - exposed on $tw.cplServerAPI
   */
  var CPLServerAPI = {
    /**
     * Record a plugin download
     */
    recordDownload: function(pluginTitle, callback) {
      var encodedTitle = encodeURIComponent(pluginTitle);
      apiRequest('POST', '/download/' + encodedTitle, null, callback);
    },

    /**
     * Get plugin statistics
     */
    getStats: function(pluginTitle, callback) {
      var encodedTitle = encodeURIComponent(pluginTitle);
      apiRequest('GET', '/stats/' + encodedTitle, null, callback);
    },

    /**
     * Get all statistics
     */
    getAllStats: function(callback) {
      apiRequest('GET', '/stats', null, callback);
    },

    /**
     * Submit a rating
     */
    submitRating: function(pluginTitle, rating, callback) {
      var encodedTitle = encodeURIComponent(pluginTitle);
      apiRequest('POST', '/rate/' + encodedTitle, { rating: rating }, callback);
    },

    /**
     * Get changelog
     */
    getChangelog: function(pluginTitle, callback) {
      var encodedTitle = encodeURIComponent(pluginTitle);
      apiRequest('GET', '/changelog/' + encodedTitle, null, callback);
    }
  };

  /**
   * Fetch and cache plugin stats into a temp tiddler
   */
  function fetchPluginStats(pluginTitle) {
    if (!pluginTitle) return;
    
    var tempTitle = '$:/temp/CPL-Server/plugin-stats/' + pluginTitle;
    
    CPLServerAPI.getStats(pluginTitle, function(err, data) {
      if (err) {
        console.error('[CPL-Server] Failed to fetch stats for', pluginTitle, err);
        return;
      }
      
      $tw.wiki.addTiddler({
        title: tempTitle,
        text: JSON.stringify(data),
        type: 'application/json',
        'plugin-title': pluginTitle,
        timestamp: Date.now().toString()
      });
    });
  }

  /**
   * Fetch and cache plugin changelog into a temp tiddler
   */
  function fetchPluginChangelog(pluginTitle) {
    if (!pluginTitle) return;
    
    var tempTitle = '$:/temp/CPL-Server/plugin-changelog/' + pluginTitle;
    
    CPLServerAPI.getChangelog(pluginTitle, function(err, data) {
      if (err) {
        console.error('[CPL-Server] Failed to fetch changelog for', pluginTitle, err);
        return;
      }
      
      $tw.wiki.addTiddler({
        title: tempTitle,
        text: JSON.stringify(data),
        type: 'application/json',
        'plugin-title': pluginTitle,
        timestamp: Date.now().toString()
      });
    });
  }

  exports.startup = function() {
    // Expose API on $tw namespace
    $tw.cplServerAPI = CPLServerAPI;

    // Listen for navigation to plugin pages and fetch stats automatically
    $tw.wiki.addEventListener('change', function(changes) {
      // Check if current tiddler changed to a plugin
      var currentTiddler = $tw.wiki.getTiddler('$:/HistoryList');
      if (currentTiddler && currentTiddler.fields && currentTiddler.fields['current-tiddler']) {
        var title = currentTiddler.fields['current-tiddler'];
        var tiddler = $tw.wiki.getTiddler(title);
        
        if (tiddler && tiddler.fields.tags && tiddler.fields.tags.indexOf('$:/tags/PluginWiki') !== -1) {
          var pluginTitle = tiddler.fields['cpl.title'];
          if (pluginTitle) {
            fetchPluginStats(pluginTitle);
            fetchPluginChangelog(pluginTitle);
          }
        }
      }
    });

    // Also fetch when a specific temp tiddler is accessed (lazy loading)
    $tw.rootWidget.addEventListener('cpl-fetch-stats', function(event) {
      var pluginTitle = event.paramObject && event.paramObject.pluginTitle;
      if (pluginTitle) {
        fetchPluginStats(pluginTitle);
      }
    });

    $tw.rootWidget.addEventListener('cpl-fetch-changelog', function(event) {
      var pluginTitle = event.paramObject && event.paramObject.pluginTitle;
      if (pluginTitle) {
        fetchPluginChangelog(pluginTitle);
      }
    });

    // Rating submission handler
    $tw.rootWidget.addEventListener('cpl-submit-rating', function(event) {
      var paramObject = event.paramObject || {};
      var pluginTitle = paramObject.pluginTitle;
      var rating = parseInt(paramObject.rating, 10);
      
      if (!pluginTitle || isNaN(rating) || rating < 1 || rating > 5) {
        console.error('[CPL-Server] Invalid rating submission');
        return;
      }
      
      var tempTitle = '$:/temp/CPL-Server/rating-status/' + pluginTitle;
      
      $tw.wiki.addTiddler({
        title: tempTitle,
        text: 'submitting',
        'plugin-title': pluginTitle
      });
      
      CPLServerAPI.submitRating(pluginTitle, rating, function(err, data) {
        if (err) {
          $tw.wiki.addTiddler({
            title: tempTitle,
            text: 'error: ' + err.message,
            'plugin-title': pluginTitle
          });
          return;
        }
        
        $tw.wiki.addTiddler({
          title: tempTitle,
          text: 'success',
          'plugin-title': pluginTitle,
          'average-rating': String(data.averageRating || 0),
          'total-ratings': String(data.totalRatings || 0)
        });
        
        // Refresh stats after rating
        fetchPluginStats(pluginTitle);
      });
    });

    // Listen for plugin installation events and record downloads
    $tw.rootWidget.addEventListener('cpl-install-plugin', function(event) {
      var paramObject = event.paramObject || {};
      var response = paramObject.response;
      
      if (!response || !$tw.wiki.tiddlerExists(response)) return;
      
      try {
        var responseTiddler = $tw.wiki.getTiddler(response).fields;
        var data = JSON.parse(responseTiddler.text);
        var rootPlugin = data.title;
        
        if (rootPlugin && $tw.cplServerAPI) {
          // Record download after a short delay to ensure installation has started
          setTimeout(function() {
            $tw.cplServerAPI.recordDownload(rootPlugin, function(err, result) {
              if (err) {
                console.error('[CPL-Server] Failed to record download:', err);
              } else {
                console.log('[CPL-Server] Download recorded for', rootPlugin);
              }
            });
          }, 100);
        }
      } catch (e) {
        console.error('[CPL-Server] Error recording download:', e);
      }
    });

    console.log('[CPL-Server] API Client initialized');
  };
})();
