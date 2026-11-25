import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Fastify from 'fastify'

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'yujian-routes-test-'))
process.env.NODE_ENV = 'test'
process.env.LLC_DATA_DIR = dataDirectory
const { registerRoutes } = await import('./routes.js')
const { chooseDatabaseWith, db, openDatabase } = await import('./services/database.js')
type Database = ReturnType<typeof openDatabase>

// A host of its own: it creates the server, decides whose database each request uses, and adds a route.
const learners = new Map<string, Database>()
const inHand = new AsyncLocalStorage<Database>()
chooseDatabaseWith(() => inHand.getStore())

const app = Fastify({ logger: false })
app.addHook('onRequest', (request, _reply, done) => {
  const learner = String(request.headers['x-learner'] || '')
  if (!learner) return done()
  if (!learners.has(learner)) learners.set(learner, openDatabase(path.join(dataDirectory, `${learner}.db`)))
  inHand.run(learners.get(learner)!, done)
})
registerRoutes(app, { port: () => 0 })
app.get('/api/beside', async () => ({ beside: true }))

after(async () => {
  await app.close()
  chooseDatabaseWith(() => undefined)
  for (const database of learners.values()) database.close()
  db.close()
  await rm(dataDirectory, { recursive: true, force: true })
})

test('a server created elsewhere answers the app\'s routes beside its own', async () => {
  const health = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(health.statusCode, 200)
  assert.equal(health.json().app, 'local-language-coach')
  assert.equal((await app.inject({ method: 'GET', url: '/api/conversation-presets' })).statusCode, 200)
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/beside' })).json(), { beside: true })

  const missing = await app.inject({ method: 'GET', url: '/api/conversations/nowhere' })
  assert.equal(missing.statusCode, 404)
  assert.equal(typeof missing.json().error, 'string', 'errors keep the shape the pages read')
})

test('a host that names a database for each request keeps learners apart', async () => {
  const save = (learner: string, term: string) => app.inject({
    method: 'POST',
    url: '/api/words',
    headers: { 'x-learner': learner },
    payload: { term, meaning: term, language: 'en', details: {} },
  })
  const words = async (learner?: string) => ((await app.inject({ method: 'GET', url: '/api/words', headers: learner ? { 'x-learner': learner } : {} })).json() as Array<{ term: string }>).map((word) => word.term)

  const saved = await Promise.all([save('ana', 'harbour'), save('ben', 'lantern'), save('ana', 'tide')])
  for (const response of saved) assert.equal(response.statusCode, 200, response.body)

  const [ana, ben, shared] = await Promise.all([words('ana'), words('ben'), words()])
  assert.deepEqual(ana.sort(), ['harbour', 'tide'])
  assert.deepEqual(ben, ['lantern'])
  assert.deepEqual(shared, [], 'a request with no database named uses the shared one, which nothing was written to')
})
