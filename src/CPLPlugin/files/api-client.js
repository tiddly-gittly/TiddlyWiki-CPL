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
  var API_STATUS_TIDDLER = '$:/temp/CPL-Repo/api-status';
  var API_TYPE_TIDDLER = '$:/temp/CPL-Repo/mirror-type';
  var API_MESSAGE_TIDDLER = '$:/temp/CPL-Repo/mirror-message';
  var apiAvailability = null;
  var mirrorConfigTitle = '$:/plugins/Gk0Wk/CPL-Repo/config/current-repo';
  var lastMirrorEntry = null;

  function getCurrentMirrorEntry() {
    return $tw.wiki.getTiddlerText(mirrorConfigTitle, '');
  }

  function clearServerTempState() {
    for (var title of $tw.wiki.filterTiddlers('[prefix[$:/temp/CPL-Server/]]')) {
      $tw.wiki.deleteTiddler(title);
    }
  }

  function setApiStatus(status, type, message) {
    $tw.wiki.addTiddler({
      title: API_STATUS_TIDDLER,
      text: status,
      timestamp: String(Date.now())
    });
    $tw.wiki.addTiddler({
      title: API_TYPE_TIDDLER,
      text: type || 'unknown',
      timestamp: String(Date.now())
    });
    $tw.wiki.addTiddler({
      title: API_MESSAGE_TIDDLER,
      text: message || '',
      timestamp: String(Date.now())
    });
  }

  function refreshMirrorCapabilityState() {
    var entry = getCurrentMirrorEntry();
    if (entry === lastMirrorEntry && apiAvailability !== null) {
      return;
    }
    lastMirrorEntry = entry;
    apiAvailability = null;
    clearServerTempState();
    probeApiAvailability(function(available) {
      if (available) {
        CPLServerAPI.checkAuthStatus(function(err, data) {
          if (!err && data && data.authenticated) {
            $tw.wiki.addTiddler({
              title: '$:/temp/CPL-Server/user-status',
              text: 'authenticated'
            });
            $tw.wiki.addTiddler({
              title: '$:/temp/CPL-Server/user',
              text: JSON.stringify(data.user),
              type: 'application/json'
            });
          } else {
            $tw.wiki.addTiddler({
              title: '$:/temp/CPL-Server/user-status',
              text: 'anonymous'
            });
          }
        });
      } else {
        $tw.wiki.addTiddler({
          title: '$:/temp/CPL-Server/user-status',
          text: 'anonymous'
        });
      }
    });
  }

  function getUnavailableMessage() {
    return 'This mirror does not provide CPL server API features.';
  }

  /**
   * Make an HTTP request to the CPL Server API
   */
  function rawApiRequest(method, endpoint, body, callback, extraHeaders) {
    var url = CPL_API_BASE + endpoint;
    var options = {
      url: url,
      type: method,
      headers: {
        'Content-Type': 'application/json'
      },
      callback: function(err, response) {
        if (err) {
          var errorMessage = 'Request failed';
          if (err.message) {
            errorMessage = err.message;
          } else if (typeof err === 'string') {
            errorMessage = err;
          } else if (err.status !== undefined) {
            errorMessage = 'HTTP ' + err.status + (err.statusText ? ' ' + err.statusText : '');
          } else {
            try {
              errorMessage = JSON.stringify(err);
            } catch (e) {
              errorMessage = String(err);
            }
          }
          callback(errorMessage, null);
          return;
        }
        try {
          var data = JSON.parse(response);
          callback(null, data);
        } catch (e) {
          callback('Invalid JSON response', null);
        }
      }
    };

    if (extraHeaders) {
      Object.keys(extraHeaders).forEach(function(key) {
        options.headers[key] = extraHeaders[key];
      });
    }

    if (body) {
      options.data = JSON.stringify(body);
    }

    $tw.utils.httpRequest(options);
  }

  function apiRequest(method, endpoint, body, callback) {
    if (apiAvailability === false) {
      callback(getUnavailableMessage(), null);
      return;
    }
    rawApiRequest(method, endpoint, body, callback);
  }

  // JWT Token management
  var JWT_TOKEN_KEY = 'cpl_jwt_token';

  function getJwtToken() {
    try {
      return localStorage.getItem(JWT_TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function setJwtToken(token) {
    try {
      if (token) {
        localStorage.setItem(JWT_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(JWT_TOKEN_KEY);
      }
    } catch (e) {
      console.error('[CPL-Server] Failed to access localStorage:', e);
    }
  }

  /**
   * Make an authenticated HTTP request to the CPL Server API
   */
  function authenticatedRequest(method, endpoint, body, callback) {
    if (apiAvailability === false) {
      callback(getUnavailableMessage(), null);
      return;
    }

    // Add JWT token if available
    var token = getJwtToken();
    var extraHeaders = token ? { Authorization: 'Bearer ' + token } : null;
    rawApiRequest(method, endpoint, body, callback, extraHeaders);
  }

  function probeApiAvailability(callback) {
    setApiStatus('checking', 'unknown', 'Checking mirror capabilities...');
    rawApiRequest('GET', '/stats/' + encodeURIComponent('$:/plugins/Gk0Wk/CPL-Repo/__probe__'), null, function(err) {
      if (err) {
        apiAvailability = false;
        setApiStatus('unavailable', 'static', 'Static mirror detected. Stats, ratings, comments, and login are unavailable here.');
        callback(false);
        return;
      }

      apiAvailability = true;
      setApiStatus('available', 'server', 'Full CPL server features are available on this mirror.');
      callback(true);
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
    },

    // ===== Comment API =====

    /**
     * Get comments for a plugin
     */
    getComments: function(pluginTitle, callback) {
      var encodedTitle = encodeURIComponent(pluginTitle);
      authenticatedRequest('GET', '/comments/' + encodedTitle, null, callback);
    },

    /**
     * Submit a comment
     */
    submitComment: function(pluginTitle, content, callback) {
      var encodedTitle = encodeURIComponent(pluginTitle);
      authenticatedRequest('POST', '/comments/' + encodedTitle, { content: content }, callback);
    },

    // ===== Auth API =====

    /**
     * Check authentication status
     */
    checkAuthStatus: function(callback) {
      authenticatedRequest('GET', '/auth/status', null, callback);
    },

    /**
     * Logout (clear token)
     */
    logout: function() {
      setJwtToken(null);
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
    refreshMirrorCapabilityState();

    // Listen for navigation to plugin pages and fetch stats automatically
    $tw.wiki.addEventListener('change', function(changes) {
      if ($tw.utils.hop(changes, mirrorConfigTitle)) {
        refreshMirrorCapabilityState();
      }

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
          text: 'error: ' + (err || 'Unknown error'),
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

    // ===== Comment Event Handlers =====

    // Load and cache comments for a plugin
    function fetchPluginComments(pluginTitle) {
      if (!pluginTitle) return;

      var tempTitle = '$:/temp/CPL-Server/comments/' + pluginTitle;

      CPLServerAPI.getComments(pluginTitle, function(err, data) {
        if (err) {
          console.error('[CPL-Server] Failed to fetch comments for', pluginTitle, err);
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

    // GitHub Login handler
    $tw.rootWidget.addEventListener('cpl-github-login', function(event) {
      var githubClientId = '';
      // Redirect to GitHub OAuth
      var redirectUri = window.location.origin + '/cpl/api/auth/github/callback';
      var githubAuthUrl = 'https://github.com/login/oauth/authorize?client_id=' + encodeURIComponent(githubClientId) +
        '&redirect_uri=' + encodeURIComponent(redirectUri) +
        '&scope=user:read';
      window.location.href = githubAuthUrl;
    });

    // Handle OAuth callback
    if (window.location.pathname === '/cpl/api/auth/github/callback') {
      var urlParams = new URLSearchParams(window.location.search);
      var code = urlParams.get('code');
      if (code) {
        // The callback route returns JSON with token
        // We need to fetch it properly
        $tw.utils.httpRequest({
          url: '/cpl/api/auth/github/callback?code=' + encodeURIComponent(code),
          type: 'GET',
          headers: { 'Content-Type': 'application/json' },
          callback: function(err, response) {
            if (!err && response) {
              try {
                var data = JSON.parse(response);
                if (data.success && data.token) {
                  setJwtToken(data.token);
                  $tw.wiki.addTiddler({
                    title: '$:/temp/CPL-Server/user-status',
                    text: 'authenticated'
                  });
                  $tw.wiki.addTiddler({
                    title: '$:/temp/CPL-Server/user',
                    text: JSON.stringify(data.user),
                    type: 'application/json'
                  });
                  // Redirect back to previous page or home
                  window.history.replaceState({}, document.title, '/');
                }
              } catch (e) {
                console.error('[CPL-Server] Failed to parse auth response:', e);
              }
            }
          }
        });
      }
    }

    // Submit comment handler
    $tw.rootWidget.addEventListener('cpl-submit-comment', function(event) {
      var paramObject = event.paramObject || {};
      var pluginTitle = paramObject.pluginTitle;
      
      if (!pluginTitle) {
        console.error('[CPL-Server] Missing pluginTitle for comment submission');
        return;
      }

      var draftTiddler = $tw.wiki.getTiddler('$:/temp/CPL-Server/comment-draft');
      var content = draftTiddler ? draftTiddler.fields.text : '';
      
      if (!content || content.trim().length === 0) {
        $tw.wiki.addTiddler({
          title: '$:/temp/CPL-Server/comment-status/' + pluginTitle,
          text: 'error: Comment content cannot be empty'
        });
        return;
      }

      $tw.wiki.addTiddler({
        title: '$:/temp/CPL-Server/comment-status/' + pluginTitle,
        text: 'submitting'
      });

      CPLServerAPI.submitComment(pluginTitle, content.trim(), function(err, data) {
        if (err) {
          $tw.wiki.addTiddler({
            title: '$:/temp/CPL-Server/comment-status/' + pluginTitle,
            text: 'error: ' + (err || 'Failed to submit comment')
          });
          return;
        }

        // Clear draft
        $tw.wiki.addTiddler({
          title: '$:/temp/CPL-Server/comment-draft',
          text: ''
        });

        $tw.wiki.addTiddler({
          title: '$:/temp/CPL-Server/comment-status/' + pluginTitle,
          text: 'success'
        });

        // Refresh comments
        fetchPluginComments(pluginTitle);
      });
    });

    // Fetch comments handler
    $tw.rootWidget.addEventListener('cpl-fetch-comments', function(event) {
      var pluginTitle = event.paramObject && event.paramObject.pluginTitle;
      if (pluginTitle) {
        fetchPluginComments(pluginTitle);
      }
    });

    // Also fetch comments when navigating to plugin pages
    $tw.wiki.addEventListener('change', function(changes) {
      var currentTiddler = $tw.wiki.getTiddler('$:/HistoryList');
      if (currentTiddler && currentTiddler.fields && currentTiddler.fields['current-tiddler']) {
        var title = currentTiddler.fields['current-tiddler'];
        var tiddler = $tw.wiki.getTiddler(title);
        
        if (tiddler && tiddler.fields.tags && tiddler.fields.tags.indexOf('$:/tags/PluginWiki') !== -1) {
          var pluginTitle = tiddler.fields['cpl.title'];
          if (pluginTitle) {
            fetchPluginComments(pluginTitle);
          }
        }
      }
    });

    console.log('[CPL-Server] API Client initialized');
  };
})();
