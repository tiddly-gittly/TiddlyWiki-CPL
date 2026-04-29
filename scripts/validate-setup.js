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
        'src/CPLServer/lib/store/data.ts',
        'src/CPLServer/lib/security/rate-limit.ts',
        'src/CPLServer/routes/api/download.ts',
        'src/CPLServer/routes/api/stats/plugin.ts',
        'src/CPLServer/routes/api/rate.ts',
        'src/CPLServer/routes/changelog.ts',
        'src/CPLPlugin/plugin.info',
        'src/CPLPlugin/startup/core.ts',
        'src/CPLPlugin/startup/api-client.ts',
        'src/CPLPlugin/filters/shuffle.ts'
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
      return pkg.scripts['server:prod'] &&
             pkg.scripts['build'] &&
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
  console.log('  2. Run "npm run dev" to start development server');
  console.log('  3. Run "npm test" to run tests');
}
