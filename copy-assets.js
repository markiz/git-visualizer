import fs from 'fs';
import path from 'path';

// Ensure dist directory exists
if (!fs.existsSync('./dist')) {
  fs.mkdirSync('./dist');
}

// Copy HTML files
fs.copyFileSync('./src/index.html', './dist/index.html');
fs.copyFileSync('./dist/preload.js', './dist/preload.mjs');
fs.copyFileSync('./dist/preload.js.map', './dist/preload.mjs.map');
// Note: We don't need to copy TypeScript files because they will be compiled by tsc

console.log('Assets copied to dist folder');
