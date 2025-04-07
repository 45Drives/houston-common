import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import VueDevTools from 'vite-plugin-vue-devtools'

import path from 'path'

import dts from 'vite-plugin-dts'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VueDevTools(),
    dts({
      tsconfigPath: './tsconfig.app.json',
      rollupTypes: true,
      entryRoot: 'lib'
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./lib', import.meta.url))
    }
  },
  build: {
    minify: false,
    lib: {
      entry: path.resolve(__dirname, 'lib/index.ts'),
      name: 'Houston Common UI',
      fileName: 'index',
      formats: ['es', 'cjs'],
    },
    target: ["chrome87", "edge88", "firefox78", "safari14"],
    sourcemap: true,
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ['vue', /^@45drives/],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          vue: 'Vue',
        }
      }
    }
  },
  assetsInclude: [
    "**/*.glb"
  ]
})
