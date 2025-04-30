// vite.config.js
import { InlineConfig as VitestInlineConfig } from "vitest";
import dts from "vite-plugin-dts";

declare module "vite" {
  interface UserConfig {
    /**
     * Options for Vitest
     */
    test?: VitestInlineConfig;
  }
}
import { defineConfig } from "vite";

import path from "path";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "lib"),
    },
  },
  assetsInclude: ["**/*.py"],
  build: {
    minify: false,
    // lib property is set in build script
    lib: {
      entry: path.resolve(__dirname, "lib/index.ts"),
      name: "Houston Common Library",
      // the proper extensions will be added
      fileName: "index",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: (id) => {
        // only externalize TS/JS test files, not .py?raw imports with test in the name
        return (
          (id.endsWith('.test.ts') || id.endsWith('.test.js')) ||
          (id.endsWith('.spec.ts') || id.endsWith('.spec.js'))
        );
      }
    },
    sourcemap: true,
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
  plugins: [
    dts({
      copyDtsFiles: true,
      beforeWriteFile(filePath, content) {
        return {
          filePath,
          content: /import.*?\?raw/.test(content)
            ? `/// <reference types="vite/client" />\n` + content
            : content,
        };
      },
    }),
  ],
});
