#!/usr/bin/env ts-node

import { buildOnlineHTML } from './build/website';

const args = process.argv.slice(2);
const outputArg = args.find(arg => arg.startsWith('--output='));
const htmlNameArg = args.find(arg => arg.startsWith('--html='));
const wikiArg = args.find(arg => arg.startsWith('--wiki='));

const distDir = outputArg ? outputArg.slice('--output='.length) : undefined;
const htmlName = htmlNameArg ? htmlNameArg.slice('--html='.length) : undefined;
const wikiPath = wikiArg ? wikiArg.slice('--wiki='.length) : undefined;

void (async () => {
  await buildOnlineHTML(
    wikiPath ?? 'wiki',
    distDir ?? 'dist',
    htmlName ?? 'index.html',
  );
})();
