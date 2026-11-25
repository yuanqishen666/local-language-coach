/**
 * Builds the web version: the same pages, with the app's routes running in a background thread of the page
 * (web/worker.ts) instead of on a server. Whatever the routes import from Node is answered by a stand-in in web/node.
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { publicPages } from './web/public-pages'

const standIn = (name: string) => fileURLToPath(new URL(`./web/node/${name}.ts`, import.meta.url))

export default defineConfig({
  root: 'web',
  // Apart from the cache of the app's own dev server, which prepares the same packages with other settings.
  cacheDir: '../node_modules/.vite-web',
  plugins: [vue(), publicPages()],
  resolve: {
    alias: [
      { find: /^node:sqlite$/u, replacement: standIn('sqlite') },
      { find: /^node:fs(\/promises)?$/u, replacement: standIn('fs') },
      { find: /^node:path$/u, replacement: standIn('path') },
      { find: /^node:crypto$/u, replacement: standIn('crypto') },
      { find: /^node:async_hooks$/u, replacement: standIn('async-hooks') },
      { find: /^node:os$/u, replacement: standIn('os') },
      { find: /^node:dns\/promises$/u, replacement: standIn('dns') },
      { find: /^node:net$/u, replacement: standIn('net') },
      { find: /^node:https?$/u, replacement: standIn('http') },
    ],
  },
  // Every `await` is compiled into `then` calls, which is what lets web/node/async-hooks.ts follow the work a request starts.
  esbuild: { supported: { 'async-await': false, 'async-generator': false, 'for-await': false } },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // WebKit can run a module worker's entry twice when a lazy chunk imports it back.
          if (id === fileURLToPath(new URL('./web/storage.ts', import.meta.url)) || id.startsWith(fileURLToPath(new URL('./web/node/', import.meta.url)))) {
            return 'worker-shared'
          }
        },
      },
    },
    plugins: () => [{
      name: 'check-worker-entry-imports',
      generateBundle(_, bundle) {
        const entry = Object.values(bundle).find((file) => file.type === 'chunk' && file.isEntry)
        if (!entry) return
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === 'chunk' && chunk !== entry && [...chunk.imports, ...chunk.dynamicImports].includes(entry.fileName)) {
            this.error(`${chunk.fileName} imports the worker entry ${entry.fileName}`)
          }
        }
      },
    }],
  },
  build: { outDir: '../dist/site', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.LLC_WEB_PORT || 5174),
    strictPort: true,
    fs: { allow: ['..'] },
  },
})
