import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiPort = Number(process.env.LLC_API_PORT || 4174)
const webPort = Number(process.env.LLC_WEB_PORT || 5173)

export default defineConfig({
  plugins: [vue()],
  build: { outDir: 'dist/web', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
})
