#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
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

const RUNTIME_FILE_PATTERN = /\.(html|js|json|png)$/;
const EXCLUDED_FILES = new Set([
  'CLAUDE.md',
  'README.md',
  'bun.lock',
  'icon.svg',
  'package.json',
]);

function getExtensionFiles() {
  return readdirSync('.')
    .filter((file) => statSync(file).isFile())
    .filter((file) => RUNTIME_FILE_PATTERN.test(file))
    .filter((file) => !file.endsWith('.test.js'))
    .filter((file) => !EXCLUDED_FILES.has(file))
    .sort();
}

// Files to include in the extension package
const files = getExtensionFiles();

// Create zip
const fileList = files.join(' ');
execSync(`zip -j ${outputPath} ${fileList}`, { stdio: 'inherit' });

console.log(`✓ Built ${outputPath}`);
