const fs = require('fs');
const path = require('path');

// Ensure dist directory exists
if (!fs.existsSync('./dist')) {
  fs.mkdirSync('./dist');
}

// Copy HTML files
fs.copyFileSync('./src/index.html', './dist/index.html');

// Note: We don't need to copy TypeScript files because they will be compiled by tsc

console.log('Assets copied to dist folder');
