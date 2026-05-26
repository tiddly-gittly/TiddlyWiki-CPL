#!/usr/bin/env ts-node

import { buildLibrary } from './build/library';

const args = process.argv.slice(2);
const cache = !args.includes('--no-cache');
const outputArg = args.find(arg => arg.startsWith('--output='));
const distDir = outputArg ? outputArg.slice('--output='.length) : undefined;

try {
  buildLibrary(distDir, cache);
} catch (error) {
  console.error(error);
  process.exit(1);
}