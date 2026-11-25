import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { getConfig } from './services/config.js'
import { isRemoteRequestAllowed, readRemoteState, isLoopbackAddress } from './services/remote.js'
import { openActiveProfile } from './profiles.js'
import { registerRoutes } from './routes.js'
import { admitFromNetwork, setLanListening } from './lan.js'

const config = await getConfig()
const logLevel = process.env.LLC_LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : process.env.NODE_ENV === 'production' ? 'warn' : 'info')
const app = Fastify({ logger: { level: logLevel, redact: ['req.headers.authorization', 'req.headers.x-api-key', '*.apiKey'] }, bodyLimit: 2_000_000 })
const runtimeFile = process.env.LLC_RUNTIME_FILE
async function clearRuntimeFile() {
  if (!runtimeFile) return
  try {
    const current = JSON.parse(await readFile(runtimeFile, 'utf8')) as { pid?: number }
    if (current.pid === process.pid) await unlink(runtimeFile)
  } catch {}
}
function clearRuntimeFileSync() {
  if (!runtimeFile) return
  try {
    const current = JSON.parse(readFileSync(runtimeFile, 'utf8')) as { pid?: number }
    if (current.pid === process.pid) unlinkSync(runtimeFile)
  } catch {}
}
if (runtimeFile) app.addHook('onClose', clearRuntimeFile)

const localHosts = new Set(['127.0.0.1', 'localhost', '::1'])
function headerHostname(value?: string) {
  if (!value) return undefined
  try { return new URL(`http://${value}`).hostname.replace(/^\[|\]$/g, '').toLowerCase() }
  catch { return undefined }
}

app.addHook('onRequest', async (request, reply) => {
  // Anything that did not come from this computer is another device on the network.
  if (!isLoopbackAddress(request.socket.remoteAddress)) {
    if (!(await admitFromNetwork(request, reply))) return reply
    return
  }
  const hostname = headerHostname(request.headers.host)
  if (request.headers.host && !hostname) return reply.code(403).send({ error: 'Invalid host' })
  const origin = request.headers.origin
  const remoteState = await readRemoteState()
  const remoteAllowed = isRemoteRequestAllowed(remoteState, { hostname, origin, remoteAddress: request.socket.remoteAddress })
  if (hostname && !localHosts.has(hostname) && !remoteAllowed) return reply.code(403).send({ error: 'Host not allowed' })
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.replace(/^\[|\]$/g, '').toLowerCase()
      if (!localHosts.has(originHost) && !remoteAllowed) return reply.code(403).send({ error: 'Origin not allowed' })
    } catch { return reply.code(403).send({ error: 'Invalid origin' }) }
  }
})

await openActiveProfile()
registerRoutes(app, { port: () => Number(process.env.PORT || config.server.port) })

const webRoot = path.resolve(process.cwd(), 'dist/web')
if (existsSync(webRoot)) {
  await app.register(fastifyStatic, { root: webRoot, wildcard: false })
  app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'))
}

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || config.server.port)
  // Every interface only when the learner has opened the app to the home network; the request guard decides who gets in.
  await app.listen({ host: config.server.lan ? '0.0.0.0' : '127.0.0.1', port })
  setLanListening(Boolean(config.server.lan))
  if (runtimeFile) {
    const runtime = { version: 1, pid: process.pid, url: `http://127.0.0.1:${port}`, port, mode: 'start', startedAt: new Date().toISOString() }
    const temporary = `${runtimeFile}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(runtime, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, runtimeFile)
    let closing = false
    const shutdown = async () => {
      if (closing) return
      closing = true
      clearRuntimeFileSync()
      try { await app.close() } finally { process.exit(0) }
    }
    process.once('SIGINT', () => void shutdown())
    process.once('SIGTERM', () => void shutdown())
  }
}

export { app }
