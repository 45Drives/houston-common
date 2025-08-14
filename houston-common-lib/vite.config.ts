import path from "path";
import { fileURLToPath } from "url";
import { InlineConfig as VitestInlineConfig } from "vitest";
import dts from "vite-plugin-dts";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    lib: {
      entry: path.resolve(__dirname, "lib/index.ts"),
      name: "Houston Common Library",
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
    environment: "jsdom",
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
