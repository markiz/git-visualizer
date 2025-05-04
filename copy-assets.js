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

// Process package.json
const packageJsonPath = './package.json';
const distPackageJsonPath = './dist/package.json';

try {
  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonContent);

  // Remove keys
  delete packageJson.build;
  delete packageJson.scripts;

  // Replace main value
  packageJson.main = 'main.js';

  // Write the modified package.json to dist
  fs.writeFileSync(distPackageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');
  console.log('Modified package.json copied to dist folder');

} catch (error) {
  console.error('Error processing package.json:', error);
}


console.log('Assets copied to dist folder');
