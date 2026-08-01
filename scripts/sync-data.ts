import { spawnSync } from 'child_process';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '..');
const result = spawnSync('sh', ['scripts/sync-data.sh'], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
