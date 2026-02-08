#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Read version from manifest
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const version = manifest.version;

// Create dist directory
if (!existsSync('dist')) {
  mkdirSync('dist');
}

const filename = `scrollywood-v${version}.zip`;
const outputPath = join('dist', filename);

// Files to include in the extension
const files = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'background.js',
  'background-logic.js',
  'offscreen.html',
  'offscreen.js',
  'gif-encoder.js',
  'scroll-utils.js',
  'icon16.png',
  'icon48.png',
  'icon128.png',
];

// Create zip
const fileList = files.join(' ');
execSync(`zip -j ${outputPath} ${fileList}`, { stdio: 'inherit' });

console.log(`✓ Built ${outputPath}`);
