#!/usr/bin/env node

/**
 * Data Reconciliation Script for Multi-Server Deployments
 * 
 * This script:
 * 1. Detects duplicate comments (same user, same content, within 5 minutes)
 * 2. Validates comment ID uniqueness across all server files
 * 3. Identifies stale mirror files (no updates in 30 days)
 * 4. Reports findings and optionally cleans up
 * 
 * Usage:
 *   node scripts/reconcile-data.js              # Dry run (report only)
 *   node scripts/reconcile-data.js --fix        # Apply fixes
 *   node scripts/reconcile-data.js --clean-stale # Remove stale mirror files
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const COMMENTS_DIR = path.join(DATA_DIR, 'comments');
const STALE_THRESHOLD_DAYS = 30;
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--fix');
const CLEAN_STALE = args.includes('--clean-stale');

console.log('=== CPL Data Reconciliation ===');
console.log('Mode:', DRY_RUN ? 'DRY RUN (no changes)' : 'FIX MODE (will modify files)');
console.log('Data directory:', DATA_DIR);
console.log('');

// Utility: Get file modification time
function getFileAge(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return Date.now() - stats.mtimeMs;
  } catch (e) {
    return 0;
  }
}

// Check for stale mirror files
function checkStaleFiles() {
  console.log('--- Checking for stale mirror files ---');
  
  const staleFiles = [];
  const thresholdMs = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  
  // Check stats files
  if (fs.existsSync(DATA_DIR)) {
    const statsFiles = fs.readdirSync(DATA_DIR).filter(f => f.match(/^stats\.[^.]+\.json$/));
    statsFiles.forEach(file => {
      const filePath = path.join(DATA_DIR, file);
      const age = getFileAge(filePath);
      if (age > thresholdMs) {
        staleFiles.push({ path: filePath, age: Math.floor(age / (24 * 60 * 60 * 1000)) });
      }
    });
    
    // Check ratings files
    const ratingsFiles = fs.readdirSync(DATA_DIR).filter(f => f.match(/^ratings\.[^.]+\.json$/));
    ratingsFiles.forEach(file => {
      const filePath = path.join(DATA_DIR, file);
      const age = getFileAge(filePath);
      if (age > thresholdMs) {
        staleFiles.push({ path: filePath, age: Math.floor(age / (24 * 60 * 60 * 1000)) });
      }
    });
  }
  
  // Check comment files
  if (fs.existsSync(COMMENTS_DIR)) {
    const commentFiles = fs.readdirSync(COMMENTS_DIR).filter(f => f.match(/\.[^.]+\.json$/));
    commentFiles.forEach(file => {
      const filePath = path.join(COMMENTS_DIR, file);
      const age = getFileAge(filePath);
      if (age > thresholdMs) {
        staleFiles.push({ path: filePath, age: Math.floor(age / (24 * 60 * 60 * 1000)) });
      }
    });
  }
  
  if (staleFiles.length === 0) {
    console.log('✓ No stale files found');
  } else {
    console.log(`⚠ Found ${staleFiles.length} stale file(s):`);
    staleFiles.forEach(({ path, age }) => {
      console.log(`  - ${path} (${age} days old)`);
    });
    
    if (CLEAN_STALE && !DRY_RUN) {
      console.log('Removing stale files...');
      staleFiles.forEach(({ path }) => {
        fs.unlinkSync(path);
        console.log(`  ✓ Removed ${path}`);
      });
    }
  }
  
  console.log('');
  return staleFiles;
}

// Check for duplicate comments
function checkDuplicateComments() {
  console.log('--- Checking for duplicate comments ---');
  
  if (!fs.existsSync(COMMENTS_DIR)) {
    console.log('✓ No comments directory found');
    console.log('');
    return [];
  }
  
  const duplicates = [];
  const allComments = new Map(); // pluginTitle -> comments
  
  // Load all comments
  const files = fs.readdirSync(COMMENTS_DIR).filter(f => f.endsWith('.json'));
  files.forEach(file => {
    const filePath = path.join(COMMENTS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      if (data.pluginTitle && data.comments) {
        if (!allComments.has(data.pluginTitle)) {
          allComments.set(data.pluginTitle, []);
        }
        
        data.comments.forEach(comment => {
          allComments.get(data.pluginTitle).push({
            ...comment,
            sourceFile: filePath
          });
        });
      }
    } catch (e) {
      console.error(`Error reading ${filePath}:`, e.message);
    }
  });
  
  // Check for duplicates
  allComments.forEach((comments, pluginTitle) => {
    for (let i = 0; i < comments.length; i++) {
      for (let j = i + 1; j < comments.length; j++) {
        const c1 = comments[i];
        const c2 = comments[j];
        
        // Same user, same content, within 5 minutes
        if (c1.githubId === c2.githubId && 
            c1.content === c2.content &&
            Math.abs(new Date(c1.createdAt) - new Date(c2.createdAt)) < DUPLICATE_WINDOW_MS) {
          duplicates.push({
            pluginTitle,
            comment1: { id: c1.id, file: c1.sourceFile, createdAt: c1.createdAt },
            comment2: { id: c2.id, file: c2.sourceFile, createdAt: c2.createdAt }
          });
        }
      }
    }
  });
  
  if (duplicates.length === 0) {
    console.log('✓ No duplicate comments found');
  } else {
    console.log(`⚠ Found ${duplicates.length} potential duplicate(s):`);
    duplicates.forEach(({ pluginTitle, comment1, comment2 }) => {
      console.log(`  Plugin: ${pluginTitle}`);
      console.log(`    - ${comment1.id} (${comment1.createdAt}) in ${path.basename(comment1.file)}`);
      console.log(`    - ${comment2.id} (${comment2.createdAt}) in ${path.basename(comment2.file)}`);
    });
    console.log('  Note: Manual review recommended before deletion');
  }
  
  console.log('');
  return duplicates;
}

// Check for ID collisions
function checkIdCollisions() {
  console.log('--- Checking for comment ID collisions ---');
  
  if (!fs.existsSync(COMMENTS_DIR)) {
    console.log('✓ No comments directory found');
    console.log('');
    return [];
  }
  
  const seenIds = new Map(); // id -> { file, pluginTitle }
  const collisions = [];
  
  const files = fs.readdirSync(COMMENTS_DIR).filter(f => f.endsWith('.json'));
  files.forEach(file => {
    const filePath = path.join(COMMENTS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      if (data.comments) {
        data.comments.forEach(comment => {
          if (seenIds.has(comment.id)) {
            collisions.push({
              id: comment.id,
              file1: seenIds.get(comment.id).file,
              file2: filePath,
              pluginTitle: data.pluginTitle
            });
          } else {
            seenIds.set(comment.id, { file: filePath, pluginTitle: data.pluginTitle });
          }
        });
      }
    } catch (e) {
      console.error(`Error reading ${filePath}:`, e.message);
    }
  });
  
  if (collisions.length === 0) {
    console.log('✓ No ID collisions found');
  } else {
    console.log(`⚠ Found ${collisions.length} ID collision(s):`);
    collisions.forEach(({ id, file1, file2, pluginTitle }) => {
      console.log(`  ID: ${id} (plugin: ${pluginTitle})`);
      console.log(`    - ${path.basename(file1)}`);
      console.log(`    - ${path.basename(file2)}`);
    });
    console.log('  Note: This should not happen with server-specific IDs. Manual investigation required.');
  }
  
  console.log('');
  return collisions;
}

// Main
function main() {
  const staleFiles = checkStaleFiles();
  const duplicates = checkDuplicateComments();
  const collisions = checkIdCollisions();
  
  console.log('=== Summary ===');
  console.log(`Stale files: ${staleFiles.length}`);
  console.log(`Duplicate comments: ${duplicates.length}`);
  console.log(`ID collisions: ${collisions.length}`);
  
  if (DRY_RUN && (staleFiles.length > 0 || duplicates.length > 0 || collisions.length > 0)) {
    console.log('');
    console.log('Run with --fix to apply automatic fixes');
    console.log('Run with --clean-stale to remove stale mirror files');
  }
  
  process.exit(staleFiles.length + duplicates.length + collisions.length > 0 ? 1 : 0);
}

main();
