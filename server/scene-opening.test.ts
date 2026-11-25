import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Fastify from 'fastify'

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'yujian-scene-opening-test-'))
process.env.NODE_ENV = 'test'
process.env.LLC_DATA_DIR = dataDirectory

// Starting a conversation from a scene that is already written asks the model nothing.
globalThis.fetch = async () => { throw new Error('no request to a model is expected here') }

const { registerRoutes } = await import('./routes.js')
type SceneOpening = import('./routes.js').SceneOpening
type ReplyBeat = import('../shared/reply.js').ReplyBeat
const { defaultConfig, saveConfigAndSecrets } = await import('./services/config.js')
const { STRUCTURED_CONTRACT_VERSION } = await import('./ai/provider.js')

const config = structuredClone(defaultConfig)
config.setupComplete = true
config.llm.defaultProvider = 'openai'
config.providers = config.providers.map((provider) => provider.id === 'openai' ? {
  ...provider,
  enabled: true,
  model: 'gpt-4.1',
  capability: {
    outputMode: 'json_schema' as const, conversationReady: true as const, lookupReady: true as const,
    baseUrl: provider.baseUrl, model: 'gpt-4.1', contractVersion: STRUCTURED_CONTRACT_VERSION, testedAt: '2026-11-20T00:00:00.000Z',
  },
} : provider)
await saveConfigAndSecrets(config, { 'providers.openai.apiKey': 'test-key' })

const line = 'Hello my friend! Island hopping today?'
const setup = {
  title: 'A walk on the beach', category: 'travel', setting: 'A beach path late in the afternoon', partnerName: 'Marco', partnerRole: 'someone selling boat trips',
  relationship: 'strangers', tone: 'quick and friendly', personalityCues: ['pushy'], interests: ['boats'], currentMood: 'eager',
  topicSeed: 'a boat trip', openingLine: line, difficulty: 'B1',
}
const narrated = { type: 'narration' as const, text: 'A man with a folder of photos walks up to you.' }

// A host that tells openings its own way. Each test says what that way is.
let tell: (opening: SceneOpening) => Promise<ReplyBeat[] | void> = async () => undefined
let told: SceneOpening[] = []
const hosted = Fastify({ logger: false })
registerRoutes(hosted, { port: () => 0, openScene: (opening) => { told.push(opening); return tell(opening) } })

const plain = Fastify({ logger: false })
registerRoutes(plain, { port: () => 0 })

async function start(app: typeof hosted, payload: Record<string, unknown>) {
  told = []
  const started = await app.inject({ method: 'POST', url: '/api/conversations', payload: { interfaceLocale: 'zh-CN', ...payload } })
  assert.equal(started.statusCode, 200, started.body)
  const id = started.json().id as string
  const shown = await app.inject({ method: 'GET', url: `/api/conversations/${id}?interfaceLocale=zh-CN` })
  assert.equal(shown.statusCode, 200, shown.body)
  return { id, messages: shown.json().messages as Array<{ role: string; content: string; meta: Record<string, any> }> }
}

after(async () => {
  await hosted.close()
  await plain.close()
  await rm(dataDirectory, { recursive: true, force: true })
})

test('a host tells the opening of a scene in parts, around the line it opens with', async () => {
  tell = async (opening) => [narrated, { type: 'say', name: opening.setup.partnerName, text: opening.openingLine }]
  const { id, messages } = await start(hosted, { setup })

  assert.equal(told.length, 1)
  assert.equal(told[0].conversationId, id)
  assert.equal(told[0].setup.partnerName, 'Marco')
  assert.equal(told[0].openingLine, line)

  assert.equal(messages.length, 1)
  assert.equal(messages[0].content, line)
  assert.equal(messages[0].meta.opening, true)
  assert.deepEqual(messages[0].meta.beats, [narrated, { type: 'say', name: 'Marco', text: line }])
})

test('parts of a kind that cannot be shown are left out of what is kept', async () => {
  tell = async () => [narrated, { type: 'gesture', text: 'waves' } as unknown as ReplyBeat, { type: 'say', text: line }]
  const { messages } = await start(hosted, { setup })
  assert.deepEqual(messages[0].meta.beats, [narrated, { type: 'say', text: line }])
})

test('an opening told as some other line stays the one line it was', async () => {
  tell = async () => [narrated, { type: 'say', name: 'Marco', text: 'Something else entirely.' }]
  const { messages } = await start(hosted, { setup })
  assert.equal(messages[0].content, line)
  assert.equal(messages[0].meta.beats, undefined)
})

test('a host that fails, or has nothing to add, leaves the conversation started as it would have been', async () => {
  tell = async () => { throw new Error('the host could not tell it') }
  const failed = await start(hosted, { setup })
  assert.equal(failed.messages[0].content, line)
  assert.equal(failed.messages[0].meta.beats, undefined)

  tell = async () => undefined
  const silent = await start(hosted, { setup })
  assert.equal(told.length, 1)
  assert.equal(silent.messages[0].meta.beats, undefined)
})

test('a conversation with no scene is not handed over', async () => {
  tell = async () => [narrated]
  const { messages } = await start(hosted, {})
  assert.equal(told.length, 0)
  assert.equal(messages.length, 0)
})

test('where nobody hosts the routes, a scene opens with its one line', async () => {
  const { messages } = await start(plain, { setup })
  assert.equal(messages[0].content, line)
  assert.equal(messages[0].meta.opening, true)
  assert.equal(messages[0].meta.beats, undefined)
})
