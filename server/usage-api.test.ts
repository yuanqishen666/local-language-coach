import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-usage-api-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'

let respond: (url: URL) => Response = () => new Response('{}', { status: 200 })
globalThis.fetch = async (input) => respond(new URL(String(input)))

const { app } = await import('./index.js')
const database = await import('./services/database.js')
const { CUSTOM_PROVIDER_ID, customProvider, defaultConfig, getConfig, saveConfigAndSecrets, validateConfig } = await import('./services/config.js')
const { STRUCTURED_CONTRACT_VERSION, capabilityCurrent, getReviewClient, structuredOutputModes } = await import('./ai/provider.js')
const { meterReply, roughTokens, statedUsage, usageScopeFor, withUsageScope } = await import('./ai/usage-meter.js')
const { estimateCost, monthBounds, priceFor } = await import('./usage-routes.js')
const { PRICES_UPDATED } = await import('./pricing-table.js')
const { VOICE_SAMPLE_RATE } = await import('../shared/voice.js')

const models = { openai: 'gpt-4.1', anthropic: 'claude-sonnet-5-5' } as const

function qualified<T extends { id: string; baseUrl: string }>(provider: T, model: string, lookupReady = true) {
  return {
    ...provider,
    enabled: true,
    model,
    capability: {
      outputMode: 'json_schema' as const,
      conversationReady: true as const,
      lookupReady,
      baseUrl: provider.baseUrl,
      model,
      contractVersion: STRUCTURED_CONTRACT_VERSION,
      testedAt: '2026-11-20T00:00:00.000Z',
    },
  }
}

async function configure(options: { reviewProvider?: string; keys?: string[] } = {}) {
  const config = structuredClone(defaultConfig)
  config.setupComplete = true
  config.llm.defaultProvider = 'openai'
  if (options.reviewProvider !== undefined) config.llm.reviewProvider = options.reviewProvider
  config.learning = { ...config.learning, targetLanguage: 'Japanese', targetLanguageCode: 'ja' }
  config.providers = config.providers.map((provider) => provider.id === 'openai' || provider.id === 'anthropic' ? qualified(provider, models[provider.id]) : provider)
  const keys = options.keys || ['openai', 'anthropic']
  await saveConfigAndSecrets(config, Object.fromEntries(keys.map((id) => [`providers.${id}.apiKey`, 'test-key'])))
}

function wav(seconds: number) {
  const samples = Math.round(seconds * VOICE_SAMPLE_RATE)
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const tag = (at: number, text: string) => { for (let index = 0; index < text.length; index += 1) bytes[at + index] = text.charCodeAt(index) }
  tag(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); tag(8, 'WAVE'); tag(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, VOICE_SAMPLE_RATE, true); view.setUint32(28, VOICE_SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  tag(36, 'data'); view.setUint32(40, samples * 2, true)
  return bytes
}

const close = (left: number, right: number) => Math.abs(left - right) < 1e-9

test.after(async () => {
  await app.close()
  database.db.close()
  await rm(dataDir, { recursive: true, force: true })
})

test('a model is priced from the list, a release as the model it is a release of', () => {
  assert.deepEqual(priceFor('openai', 'gpt-4.1'), { input: 2, output: 8 })
  assert.deepEqual(priceFor('openai', 'gpt-4.1-2099-01-01'), { input: 2, output: 8 })
  assert.deepEqual(priceFor('openai', 'gpt-4.1-mini-2099-01-01'), priceFor('openai', 'gpt-4.1-mini'))
  assert.equal(priceFor('openai', 'gpt-4.15'), undefined)
  assert.equal(priceFor('openai', 'made-up-model'), undefined)
  assert.equal(priceFor('custom', 'llama3'), undefined)
  assert.deepEqual(priceFor('custom', 'llama3', { input: 0, output: 0 }), { input: 0, output: 0 })
  assert.equal(/^\d{4}-\d{2}-\d{2}$/u.test(PRICES_UPDATED), true)
})

test('a cost is tokens at the list price, minutes for speech-to-text, and unknown when there is no price', () => {
  assert.equal(close(estimateCost({ providerId: 'openai', model: 'gpt-4.1', inputTokens: 1000, outputTokens: 500, counted: true })!, 0.006), true)
  assert.equal(close(estimateCost({ providerId: 'openai', model: 'gpt-4o-mini-transcribe', inputTokens: 0, outputTokens: 0, audioSeconds: 30, counted: true })!, 0.0015), true)
  assert.equal(estimateCost({ providerId: 'openai', model: 'made-up-model', inputTokens: 1000, outputTokens: 500, counted: true }), null)
  assert.equal(close(estimateCost({ providerId: 'custom', model: 'llama3', inputTokens: 1_000_000, outputTokens: 0, counted: true, price: { input: 0.5, output: 1 } })!, 0.5), true)
})

test('token counts are read from each provider\'s reply shape, and estimated only when none is stated', () => {
  assert.deepEqual(statedUsage({ usage: { prompt_tokens: 12, completion_tokens: 7 } }), { inputTokens: 12, outputTokens: 7 })
  assert.deepEqual(statedUsage({ usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 3 } }), { inputTokens: 15, outputTokens: 3 })
  assert.deepEqual(statedUsage({ usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 4, thoughtsTokenCount: 6 } }), { inputTokens: 20, outputTokens: 10 })
  assert.equal(statedUsage({ choices: [] }), undefined)
  assert.equal(roughTokens('abcdefgh'), 2)
  assert.equal(roughTokens('你好世界'), 4)
})

test('a request is booked to the task its route belongs to', () => {
  assert.deepEqual(usageScopeFor('/api/conversations/:id/messages', { id: 'c1' }), { task: 'chat', conversationId: 'c1' })
  assert.deepEqual(usageScopeFor('/api/conversations/:id/recap', { id: 'c1' }), { task: 'review', conversationId: 'c1' })
  assert.deepEqual(usageScopeFor('/api/conversations/:id/messages/:messageId/hint', { id: 'c1' }), { task: 'help', conversationId: 'c1' })
  assert.deepEqual(usageScopeFor('/api/placement/:id/answer', { id: 'p1' }), { task: 'placement', sessionId: 'p1' })
  assert.deepEqual(usageScopeFor('/api/speech/transcribe'), { task: 'speech' })
  assert.deepEqual(usageScopeFor('/api/stories'), { task: 'material' })
  assert.deepEqual(usageScopeFor('/api/memories'), { task: 'other' })
})

test('a month starts at midnight on the learner\'s clock', () => {
  // 17:00 UTC on 30 November is already 1 December at UTC+8.
  assert.deepEqual(monthBounds(new Date('2026-11-30T17:00:00.000Z'), -480), {
    previous: '2026-10-31T16:00:00.000Z',
    from: '2026-11-30T16:00:00.000Z',
    to: '2026-12-31T16:00:00.000Z',
  })
  assert.equal(monthBounds(new Date('2026-11-30T17:00:00.000Z'), 0).from, '2026-11-01T00:00:00.000Z')
})

test('what a request used is kept, priced, and totalled by month, task, model, conversation and test', async () => {
  await configure()
  respond = () => new Response(JSON.stringify({ text: 'こんにちは' }), { status: 200, headers: { 'content-type': 'application/json' } })
  const heard = await app.inject({ method: 'POST', url: '/api/speech/transcribe', payload: { audio: Buffer.from(wav(30)).toString('base64') } })
  assert.equal(heard.statusCode, 200, heard.body)

  withUsageScope({ task: 'chat', conversationId: 'c1' }, () => {
    meterReply({ id: 'openai', model: 'gpt-4.1' }, { usage: { prompt_tokens: 1000, completion_tokens: 500 } }, '', '')
    meterReply({ id: 'openai', model: 'made-up-model' }, {}, 'abcdefgh', 'abcd')
  })
  withUsageScope({ task: 'placement', sessionId: 'p1' }, () => {
    meterReply({ id: 'anthropic', model: 'claude-sonnet-5-5' }, { usage: { input_tokens: 2000, output_tokens: 1000 } }, '', '')
  })

  const usage = (await app.inject({ method: 'GET', url: '/api/usage?offset=0' })).json()
  assert.equal(usage.currency, 'USD')
  assert.equal(usage.pricesUpdated, PRICES_UPDATED)
  assert.equal(usage.month.requests, 4)
  assert.equal(usage.month.unpriced, 1)
  assert.equal(usage.month.estimated, 1)
  assert.equal(close(usage.month.cost, 0.0015 + 0.006 + (2000 * 2 + 1000 * 10) / 1_000_000), true)
  assert.equal(usage.previous.requests, 0)
  assert.deepEqual(usage.tasks.map((item: { task: string; requests: number }) => [item.task, item.requests]), [['chat', 2], ['placement', 1], ['speech', 1]])
  const unknown = usage.models.find((item: { model: string }) => item.model === 'made-up-model')
  assert.equal(unknown.priced, false)
  assert.equal(unknown.inputTokens, 2)
  assert.equal(usage.models.find((item: { model: string }) => item.model === 'gpt-4.1').priced, true)

  const conversation = (await app.inject({ method: 'GET', url: '/api/usage/conversations/c1' })).json()
  assert.equal(conversation.requests, 2)
  assert.equal(close(conversation.cost, 0.006), true)
  assert.equal(conversation.unpriced, 1)
  const placement = (await app.inject({ method: 'GET', url: '/api/usage/placement/p1' })).json()
  assert.equal(close(placement.cost, 0.014), true)
  assert.equal((await app.inject({ method: 'GET', url: '/api/usage/conversations/none' })).json().requests, 0)
})

test('the reminder amount is kept, tells when the month has passed it, and can be taken away', async () => {
  assert.equal((await app.inject({ method: 'PUT', url: '/api/usage/limit', payload: { limit: -1 } })).statusCode, 400)
  assert.equal((await app.inject({ method: 'PUT', url: '/api/usage/limit', payload: { limit: 0.01 } })).json().limit, 0.01)
  let usage = (await app.inject({ method: 'GET', url: '/api/usage?offset=0' })).json()
  assert.equal(usage.limit, 0.01)
  assert.equal(usage.overLimit, true)
  await app.inject({ method: 'PUT', url: '/api/usage/limit', payload: { limit: 50 } })
  assert.equal((await app.inject({ method: 'GET', url: '/api/usage?offset=0' })).json().overLimit, false)
  await app.inject({ method: 'PUT', url: '/api/usage/limit', payload: { limit: null } })
  usage = (await app.inject({ method: 'GET', url: '/api/usage?offset=0' })).json()
  assert.equal(usage.limit, null)
  assert.equal(usage.overLimit, false)
})

test('a price of the learner\'s own replaces the list price for that provider', async () => {
  const set = await app.inject({ method: 'PUT', url: '/api/usage/prices/openai', payload: { input: 1, output: 3 } })
  assert.deepEqual(set.json(), { id: 'openai', price: { input: 1, output: 3 }, listPrice: { input: 2, output: 8 } })
  assert.deepEqual((await getConfig()).providers.find((provider) => provider.id === 'openai')!.price, { input: 1, output: 3 })
  assert.equal((await app.inject({ method: 'PUT', url: '/api/usage/prices/openai', payload: { input: -1, output: 3 } })).statusCode, 400)
  assert.equal((await app.inject({ method: 'PUT', url: '/api/usage/prices/nobody', payload: { input: 1, output: 3 } })).statusCode, 404)
  assert.equal((await app.inject({ method: 'PUT', url: '/api/usage/prices/openai', payload: { input: null, output: null } })).json().price, null)
})

test('a model is given a rough cost for a conversation before it has been used', async () => {
  await configure()
  // Twenty exchanges of 9,000 tokens in and 600 out, at 2 and 8 dollars a million.
  const known = (await app.inject({ method: 'GET', url: '/api/usage/estimate?provider=openai&model=gpt-4.1' })).json()
  assert.deepEqual([known.currency, known.exchanges, known.pricesUpdated], ['USD', 20, PRICES_UPDATED])
  assert.equal(close(known.cost, 0.36 + 0.096), true)
  assert.equal((await app.inject({ method: 'GET', url: '/api/usage/estimate?provider=openai&model=made-up-model' })).json().cost, null)
  assert.equal((await app.inject({ method: 'GET', url: '/api/usage/estimate?provider=nobody&model=gpt-4.1' })).json().cost, null)
  // Without a model named, the one the provider is set to.
  assert.equal(close((await app.inject({ method: 'GET', url: '/api/usage/estimate?provider=openai' })).json().cost, 0.456), true)
})

test('looking back uses the provider chosen for it only when that provider is ready', async () => {
  await configure({ reviewProvider: 'anthropic' })
  assert.equal((await getReviewClient()).id, 'anthropic')
  await configure({ reviewProvider: 'anthropic', keys: ['openai'] })
  assert.equal((await getReviewClient()).id, 'openai')
  await configure({ reviewProvider: 'gemini' })
  assert.equal((await getReviewClient()).id, 'openai')
  await configure()
  assert.equal((await getReviewClient()).id, 'openai')
  const refused = await app.inject({ method: 'PUT', url: '/api/settings', payload: { llm: { reviewProvider: 'nobody' } } })
  assert.equal(refused.statusCode, 200, refused.body)
  assert.equal(refused.json().llm.reviewProvider, '')
})

test('each learner has a database of their own and their own learning settings', async () => {
  await configure()
  let list = (await app.inject({ method: 'GET', url: '/api/profiles' })).json()
  assert.deepEqual(list.profiles.map((profile: { id: string; active: boolean; targetLanguageCode: string }) => [profile.id, profile.active, profile.targetLanguageCode]), [['default', true, 'ja']])
  database.db.prepare("INSERT INTO app_flags (key, value) VALUES ('who', 'first learner')").run()

  assert.equal((await app.inject({ method: 'POST', url: '/api/profiles', payload: { name: '  ' } })).statusCode, 400)
  const created = await app.inject({ method: 'POST', url: '/api/profiles', payload: { name: 'Ann', targetLanguageCode: 'fr' } })
  assert.equal(created.statusCode, 200, created.body)
  const id = created.json().id as string
  assert.equal((await app.inject({ method: 'POST', url: '/api/profiles', payload: { name: 'ann' } })).json().code, 'PROFILE_NAME_TAKEN')
  assert.equal(database.db.prepare("SELECT value FROM app_flags WHERE key = 'who'").get() !== undefined, true)

  const switched = await app.inject({ method: 'POST', url: `/api/profiles/${id}/activate` })
  assert.equal(switched.statusCode, 200, switched.body)
  assert.equal(switched.json().profiles.find((profile: { id: string }) => profile.id === id).active, true)
  assert.equal(database.db.prepare("SELECT value FROM app_flags WHERE key = 'who'").get(), undefined)
  assert.equal(existsSync(path.join(dataDir, `profile-${id}.db`)), true)
  let settings = (await app.inject({ method: 'GET', url: '/api/settings' })).json()
  assert.equal(settings.learning.targetLanguageCode, 'fr')
  assert.equal(settings.llm.defaultProvider, 'openai')
  // The first learner's settings wait in their entry, and usage keeps being counted in one place.
  list = (await app.inject({ method: 'GET', url: '/api/profiles' })).json()
  assert.equal(list.profiles.find((profile: { id: string }) => profile.id === 'default').targetLanguageCode, 'ja')
  assert.equal((await app.inject({ method: 'GET', url: '/api/usage?offset=0' })).json().month.requests, 4)
  assert.equal((await app.inject({ method: 'GET', url: '/api/usage/conversations/c1' })).json().requests, 0)

  assert.equal((await app.inject({ method: 'DELETE', url: `/api/profiles/${id}` })).json().code, 'PROFILE_IN_USE')
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/profiles/${id}`, payload: { name: 'Anne' } })).json().profiles.find((profile: { id: string }) => profile.id === id).name, 'Anne')

  await app.inject({ method: 'POST', url: '/api/profiles/default/activate' })
  assert.deepEqual({ ...(database.db.prepare("SELECT value FROM app_flags WHERE key = 'who'").get() as object) }, { value: 'first learner' })
  settings = (await app.inject({ method: 'GET', url: '/api/settings' })).json()
  assert.equal(settings.learning.targetLanguageCode, 'ja')
  assert.equal((await app.inject({ method: 'GET', url: '/api/usage/conversations/c1' })).json().requests, 2)

  const removed = await app.inject({ method: 'DELETE', url: `/api/profiles/${id}` })
  assert.equal(removed.statusCode, 200, removed.body)
  assert.equal(removed.json().profiles.length, 1)
  assert.equal(existsSync(path.join(dataDir, `profile-${id}.db`)), false)
  assert.equal((await app.inject({ method: 'POST', url: '/api/profiles/gone/activate' })).statusCode, 404)
})

test('a custom endpoint is one more provider, with no web lookup and a wider choice of output modes', async () => {
  await configure()
  assert.equal((await app.inject({ method: 'PUT', url: '/api/providers/custom/endpoint', payload: { name: 'Local', baseUrl: 'ftp://localhost' } })).json().code, 'CUSTOM_ENDPOINT_INVALID')
  assert.equal((await app.inject({ method: 'PUT', url: '/api/providers/custom/endpoint', payload: { name: '', baseUrl: 'http://localhost:11434/v1' } })).statusCode, 400)
  const added = await app.inject({ method: 'PUT', url: '/api/providers/custom/endpoint', payload: { name: 'Local', baseUrl: 'http://localhost:11434/v1/' } })
  assert.equal(added.statusCode, 200, added.body)
  const shown = added.json().providers.find((provider: { id: string }) => provider.id === CUSTOM_PROVIDER_ID)
  assert.equal(shown.baseUrl, 'http://localhost:11434/v1')
  assert.equal(shown.kind, 'openai')
  assert.equal(added.json().providers.find((provider: { id: string }) => provider.id === 'openai').baseUrl, undefined)
  assert.deepEqual(structuredOutputModes({ id: CUSTOM_PROVIDER_ID, kind: 'openai' }), ['json_schema', 'json_object', 'prompt_json'])

  // Tested without a search probe: ready to talk, never ready to look things up.
  const config = await getConfig()
  config.providers = config.providers.map((provider) => provider.id === CUSTOM_PROVIDER_ID ? qualified(provider, 'llama3', false) : provider)
  config.llm.defaultProvider = CUSTOM_PROVIDER_ID
  await saveConfigAndSecrets(config, { 'providers.custom.apiKey': 'local', 'providers.openai.apiKey': 'test-key' })
  assert.equal(capabilityCurrent((await getConfig()).providers.find((provider) => provider.id === CUSTOM_PROVIDER_ID)), true)
  const settings = (await app.inject({ method: 'GET', url: '/api/settings' })).json()
  assert.equal(settings.modelReady, true)
  assert.equal(settings.webLookupReady, false)
  const openai = structuredClone(defaultConfig.providers[0])
  assert.throws(() => validateConfig({ ...structuredClone(defaultConfig), providers: [qualified(openai, 'gpt-4.1', false), ...structuredClone(defaultConfig.providers.slice(1))] }))
  assert.throws(() => validateConfig({ ...structuredClone(defaultConfig), providers: [...structuredClone(defaultConfig.providers), { ...customProvider('Local', 'http://localhost:1'), kind: 'gemini' as const }] }))

  // Another address is another service: the model, the test result and the key go.
  const moved = await app.inject({ method: 'PUT', url: '/api/providers/custom/endpoint', payload: { name: 'Elsewhere', baseUrl: 'https://example.com/v1' } })
  const after = moved.json()
  const custom = after.providers.find((provider: { id: string }) => provider.id === CUSTOM_PROVIDER_ID)
  assert.equal(custom.model, '')
  assert.equal(custom.capabilityReady, false)
  assert.equal(custom.hasApiKey, false)
  assert.equal(after.llm.defaultProvider, '')

  const removed = await app.inject({ method: 'DELETE', url: '/api/providers/custom/endpoint' })
  assert.equal(removed.json().providers.some((provider: { id: string }) => provider.id === CUSTOM_PROVIDER_ID), false)
  assert.equal(removed.json().providers.length, 5)
})

test('the backup carries the level and what the wordbook keeps beyond the words', async () => {
  const backup = (await app.inject({ method: 'GET', url: '/api/export' })).json()
  assert.equal(backup.version, 3)
  for (const key of ['proficiencyProfiles', 'proficiencyHistory', 'placementSessions', 'turnSignals', 'conversationAssessments', 'conversationRecaps', 'practiceSets', 'wordReviews', 'conversationWords', 'wordStories', 'contentImports', 'learningPaths']) {
    assert.equal(Array.isArray(backup[key]), true, key)
  }
})
