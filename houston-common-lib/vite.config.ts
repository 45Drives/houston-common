// vite.config.js
import { InlineConfig as VitestInlineConfig } from 'vitest';
import dts from 'vite-plugin-dts';

declare module 'vite' {
    interface UserConfig {
        /**
         * Options for Vitest
         */
        test?: VitestInlineConfig;
    }
}
import { defineConfig } from 'vite';

import { resolve } from 'path';

export default defineConfig({
	base: './',
	resolve: {
		alias: {
			'@': resolve(__dirname, 'lib')
		}
	},
	build: {
		// lib property is set in build script
		lib: {
			entry: resolve(__dirname, 'lib/index.ts'),
			name: 'Cockpit Helpers',
			// the proper extensions will be added
			fileName: 'index',
			formats: ['es', 'cjs']
		},
		rollupOptions: {
			// make sure to externalize deps that shouldn't be bundled
			// into your library
			external: [/^@45drives/, 'cockpit'],
			output: {
				// Provide global variables to use in the UMD build
				// for externalized deps
				globals: {
					cockpit: 'cockpit'
				}
			}
		}
	},
	test: {
		globals: true,
	},
	plugins: [
		dts({
			copyDtsFiles: true,
			rollupTypes: true,
			beforeWriteFile(filePath, content) {
				return {
					filePath,
					content: /import.*?\?raw/.test(content) ? `/// <reference types="vite/client" />\n` + content : content,
				}
			},
		}),
	]
});
