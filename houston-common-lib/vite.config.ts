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

import { resolve } from "path";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@": new URL("./lib/", import.meta.url).pathname,
    },
  },
  build: {
    // lib property is set in build script
    lib: {
      entry: new URL("./lib/index.ts", import.meta.url).pathname,
      name: "Houston Common Library",
      // the proper extensions will be added
      fileName: "index",
      formats: ["es", "cjs"],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
  test: {
    globals: true,
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
