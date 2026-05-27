module.exports = {
  root: true,
  extends: ['@modern-js/eslint-config'],
  rules: {
    'import/no-mutable-exports': 'off',
    'max-depth': 'off',
    'max-lines': 'off',
    'no-nested-ternary': 'off',
    'no-process-exit': 'off',
    'no-void': 'off',
    'node/prefer-global/buffer': 'off',
    'node/prefer-global/url': 'off',
    'node/prefer-global/url-search-params': 'off',
    'promise/param-names': 'off',
    '@typescript-eslint/naming-convention': 'off',
  },
};
