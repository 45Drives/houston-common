import { libs, libDefaults } from './build.config.js';
import { build, UserConfig } from 'vite';
import config_ from '../vite.config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// import { generateDtsBundle, CompilationOptions as DtsBundleCompilationOpts } from 'dts-bundle-generator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const packageJsonPath = path.resolve(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
if (!packageJson)
	throw new Error('Failed to parse/find package.json');

let config: UserConfig;
if (config_ instanceof Function)
	config = await config_({ mode: 'production', command: 'build' });
else
	config = await config_;
config.build ??= {};

// const dtsBundleOpts: DtsBundleCompilationOpts = {
// 	preferredConfigPath: path.resolve(__dirname, '../tsconfig.json'),
// }

for (const [index, [exportPath, lib]] of Object.entries(libs).entries()) {
	config.build.emptyOutDir = index === 0; // clean outDir if first build
	config.build.lib = { ...libDefaults, ...lib };
	packageJson.exports[exportPath] = {
		import: `./dist/${lib.fileName}.js`,
		require: `./dist/${lib.fileName}.cjs`,
	};
	await build(config);
	// const [dts] = generateDtsBundle([{ filePath: lib.entry }], dtsBundleOpts);
	// fs.writeFileSync(`./dist/${lib.fileName}.d.ts`, dts);
}

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, '\t') + '\n');
