/*\
title: $:/plugins/Gk0Wk/CPL-Server/utils/wikitext-filter.js
type: application/javascript
module-type: library

Wikitext security filter - removes dangerous syntax before rendering.
\*/

(function() {
  'use strict';

  // Dangerous patterns to remove
  var DANGEROUS_PATTERNS = [
    // HTML script tags
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    // HTML iframe tags
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    // HTML object/embed tags
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed\b[^>]*>/gi,
    // TW action widgets (can execute side effects)
    /<(\$|\$\$)action-[a-z-]+\b[^>]*>/gi,
    /<\/(\$|\$\$)action-[a-z-]+>/gi,
    // TW macrocall widget
    /<(\$|\$\$)macrocall\b[^>]*>/gi,
    // TW import widget
    /<(\$|\$\$)importvariables\b[^>]*>/gi,
    // TW list widget with dangerous filters
    /<(\$|\$\$)list\b[^>]*filter="[^"]*(?:delete|remove|action)[^"]*"[^>]*>/gi,
    // JavaScript event handlers
    /\son\w+="[^"]*"/gi,
    /\son\w+='[^']*'/gi,
    // Data URIs
    /data:\s*text\/html[^;]*;/gi,
    // TW transclude with dangerous tiddler references
    /\{\{\{[^}]*\$:\/[^}]*\}\}\}/g
  ];

  var WikitextFilter = {
    sanitize: function(content) {
      if (!content || typeof content !== 'string') {
        return '';
      }

      var sanitized = content;
      DANGEROUS_PATTERNS.forEach(function(pattern) {
        sanitized = sanitized.replace(pattern, '');
      });

      // Additional safety: remove any remaining <script or javascript: URLs
      sanitized = sanitized.replace(/<script/gi, '&lt;script');
      sanitized = sanitized.replace(/javascript:/gi, 'javascript&#58;');

      return sanitized;
    },

    // Validate that content is safe (returns true if no dangerous patterns found)
    isSafe: function(content) {
      if (!content || typeof content !== 'string') {
        return true;
      }
      var sanitized = WikitextFilter.sanitize(content);
      return sanitized === content;
    }
  };

  exports.WikitextFilter = WikitextFilter;
})();
