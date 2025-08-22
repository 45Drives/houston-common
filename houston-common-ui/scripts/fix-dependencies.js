// scripts/fix-dependencies.js
import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Check if Yarn is being used
const isYarn = process.env["npm_config_user_agent"]?.includes("yarn") ?? false;

// Update dependencies accordingly
if (isYarn) {
  packageJson.dependencies['@45drives/houston-common-css'] = 'workspace:^';
  packageJson.dependencies['@45drives/houston-common-lib'] = 'workspace:^';
} else {
  packageJson.dependencies['@45drives/houston-common-css'] = 'file:../houston-common-css';
  packageJson.dependencies['@45drives/houston-common-lib'] = 'file:../houston-common-lib';
}

// Write the updated package.json back
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
