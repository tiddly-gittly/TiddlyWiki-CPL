const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
  /<embed\b[^>]*>/gi,
  /<(\$|\$\$)action-[a-z-]+\b[^>]*>/gi,
  /<\/(\$|\$\$)action-[a-z-]+>/gi,
  /<(\$|\$\$)macrocall\b[^>]*>/gi,
  /<(\$|\$\$)importvariables\b[^>]*>/gi,
  /<(\$|\$\$)list\b[^>]*filter="[^"]*(?:delete|remove|action)[^"]*"[^>]*>/gi,
  /\son\w+="[^"]*"/gi,
  /\son\w+='[^']*'/gi,
  /data:\s*text\/html[^;]*;/gi,
  /\{\{\{[^}]*\$:\/[^}]*\}\}\}/g,
];

export const WikitextFilter = {
  sanitize(content?: string | null): string {
    if (!content || typeof content !== 'string') {
      return '';
    }

    let sanitized = content;
    DANGEROUS_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });
    sanitized = sanitized.replace(/<script/gi, '&lt;script');
    sanitized = sanitized.replace(/javascript:/gi, 'javascript&#58;');

    return sanitized;
  },

  isSafe(content?: string | null): boolean {
    if (!content || typeof content !== 'string') {
      return true;
    }

    return this.sanitize(content) === content;
  },
};