import path from "path";
import { fileURLToPath } from 'url';
import { LibraryOptions } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const libDefaults: Partial<LibraryOptions> = {
	formats: ['es', 'cjs'],
};

/**
 * Library entry points to build. To add a new submodule, add a new entry to
 * this object with the key being the submodule import path.
 */
export const libs: Record<string, LibraryOptions> = {
	/**
	 * Main module of package.
	 * @example
	 * import { process } from '@45drives/cockpit-helpers';
	 */
	'.': {
		entry: path.resolve(__dirname, "../lib/index.ts"),
		name: "Cockpit Helpers",
		fileName: "main",
	},
	/**
	 * Process API submodule.
	 * @example
	 * import { exec, python } from '@45drives/cockpit-helpers/process';
	 */
	'./process': {
		entry: path.resolve(__dirname, "../lib/submodules/process/index.ts"),
		name: "Cockpit Helpers : Process API",
		fileName: "process",
	}
};
