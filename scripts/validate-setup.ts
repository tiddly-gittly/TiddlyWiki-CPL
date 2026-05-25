import * as fs from 'fs';

interface ValidationCheck {
  name: string;
  check: () => boolean;
}

console.log('[CPL Validation] Checking setup...\n');

const checks: ValidationCheck[] = [
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
        'src/CPLPlugin/filters/shuffle.ts',
      ];
      return required.every((filePath) => fs.existsSync(filePath));
    },
  },
  {
    name: 'wiki/tiddlywiki.info exists',
    check: () => {
      const info = JSON.parse(fs.readFileSync('wiki/tiddlywiki.info', 'utf-8')) as { plugins?: string[] };
      return Array.isArray(info.plugins) && info.plugins.includes('tiddlywiki/filesystem');
    },
  },
  {
    name: 'Data directory exists or can be created',
    check: () => {
      const dataDir = 'data';
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      return fs.existsSync(dataDir);
    },
  },
  {
    name: 'Test files exist',
    check: () => (
      fs.existsSync('tests/unit/data-store.test.js') &&
      fs.existsSync('tests/api/api.test.js') &&
      fs.existsSync('tests/e2e/cpl-server.spec.js')
    ),
  },
  {
    name: 'Package.json scripts updated',
    check: () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as {
        scripts?: Record<string, string>;
      };
      return Boolean(
        pkg.scripts?.['server:test'] &&
        pkg.scripts?.['server:prod'] &&
        pkg.scripts?.build &&
        pkg.scripts?.test &&
        pkg.scripts?.['fetch-plugins'] &&
        pkg.scripts?.['reconcile-data'],
      );
    },
  },
];

let passed = 0;
let failed = 0;

for (const { name, check } of checks) {
  try {
    if (check()) {
      console.log(`  [PASS] ${name}`);
      passed += 1;
    } else {
      console.log(`  [FAIL] ${name}`);
      failed += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  [FAIL] ${name}: ${message}`);
    failed += 1;
  }
}

console.log(`\n${passed}/${checks.length} checks passed`);

if (failed > 0) {
  console.log('\nPlease fix the failing checks before continuing.');
  process.exit(1);
}

console.log('\n[CPL Validation] All checks passed!');
console.log('\nNext steps:');
console.log('  1. Run "pnpm install" to install dependencies');
console.log('  2. Run "pnpm run dev" to start development server');
console.log('  3. Run "pnpm test" to run tests');