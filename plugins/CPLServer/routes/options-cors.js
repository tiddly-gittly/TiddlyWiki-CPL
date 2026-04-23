/*\
Title: $:/plugins/Gk0Wk/CPL-Server/routes/options-cors.js
Type: application/javascript
Module-Type: route

OPTIONS /cpl/api/* - CORS preflight handler
\*/

(function() {
  'use strict';

  exports.method = 'OPTIONS';
  exports.path = /^\/cpl\/api\//;

  exports.handler = function(request, response, state) {
    state.sendResponse(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }, '');
  };
})();
