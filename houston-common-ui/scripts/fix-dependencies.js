// scripts/fix-dependencies.js
import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();
const packageJsonPath = path.join(__dirname, 'package.json');
const original = fs.readFileSync(packageJsonPath, 'utf8');
const packageJson = JSON.parse(original);

// Check if Yarn is being used
const isYarn = process.env["npm_config_user_agent"]?.includes("yarn") ?? false;

const wanted = isYarn
  ? { css: 'workspace:^', lib: 'workspace:^' }
  : { css: 'file:../houston-common-css', lib: 'file:../houston-common-lib' };

// Update dependencies accordingly
packageJson.dependencies['@45drives/houston-common-css'] = wanted.css;
packageJson.dependencies['@45drives/houston-common-lib'] = wanted.lib;

// Every install runs this; rewriting an unchanged file (or reformatting it) leaves
// the submodule dirty, which breaks clean-checkout checks on build hosts.
const indent = original.match(/^([ \t]+)"/m)?.[1] ?? '\t';
const updated = JSON.stringify(packageJson, null, indent) + (original.endsWith('\n') ? '\n' : '');
if (updated !== original) {
  fs.writeFileSync(packageJsonPath, updated);
}
