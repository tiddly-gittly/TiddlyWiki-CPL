/**
 * Quick validation script for CPL Server setup
 */

const fs = require('fs');
const path = require('path');

console.log('[CPL Validation] Checking setup...\n');

const checks = [
  {
    name: 'Plugin directory structure (src/)',
    check: () => {
      const required = [
        'src/CPLServer/plugin.info',
        'src/CPLServer/utils/data-store.js',
        'src/CPLServer/utils/rate-limiter.js',
        'src/CPLServer/routes/post-download.js',
        'src/CPLServer/routes/get-stats.js',
        'src/CPLServer/routes/post-rate.js',
        'src/CPLServer/routes/get-changelog.js'
      ];
      return required.every(f => fs.existsSync(f));
    }
  },
  {
    name: 'wiki/tiddlywiki.info exists',
    check: () => {
      const info = JSON.parse(fs.readFileSync('wiki/tiddlywiki.info', 'utf-8'));
      return info.plugins.includes('tiddlywiki/filesystem');
    }
  },
  {
    name: 'Data directory exists or can be created',
    check: () => {
      const dataDir = 'data';
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      return fs.existsSync(dataDir);
    }
  },
  {
    name: 'Test files exist',
    check: () => {
      return fs.existsSync('tests/unit/data-store.test.js') &&
             fs.existsSync('tests/api/api.test.js') &&
             fs.existsSync('tests/e2e/cpl-server.spec.js');
    }
  },
  {
    name: 'Package.json scripts updated',
    check: () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      return pkg.scripts['server:dev'] && 
             pkg.scripts['server:prod'] &&
             pkg.scripts['test'];
    }
  }
];

let passed = 0;
let failed = 0;

checks.forEach(({ name, check }) => {
  try {
    if (check()) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.log(`  [FAIL] ${name}`);
      failed++;
    }
  } catch (e) {
    console.log(`  [FAIL] ${name}: ${e.message}`);
    failed++;
  }
});

console.log(`\n${passed}/${checks.length} checks passed`);

if (failed > 0) {
  console.log('\nPlease fix the failing checks before continuing.');
  process.exit(1);
} else {
  console.log('\n[CPL Validation] All checks passed!');
  console.log('\nNext steps:');
  console.log('  1. Run "npm install" to install dependencies');
  console.log('  2. Run "npm run server:dev" to start development server');
  console.log('  3. Run "npm test" to run tests');
}
