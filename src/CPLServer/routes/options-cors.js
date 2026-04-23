/*\
title: $:/plugins/Gk0Wk/CPL-Server/routes/options-cors.js
type: application/javascript
module-type: route

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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400'
    }, '');
  };
})();
