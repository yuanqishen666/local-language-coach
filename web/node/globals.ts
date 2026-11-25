/** What the app expects to find without importing it, as it does under Node. Imported before anything of the app's. */
import { Buffer } from './buffer'

Object.assign(globalThis, {
  Buffer,
  process: { env: { NODE_ENV: import.meta.env.MODE }, cwd: () => '/', pid: 0 },
})
