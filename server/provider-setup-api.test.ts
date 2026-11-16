import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'llc-provider-setup-api-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'

const basicReply = {
  roleReply: 'OK',
  reconstruction: null,
  corrections: [],
  lookup: { action: 'reply', parts: [], query: '', locator: null },
  statePatch: { currentTopic: 'check', openedLoops: [], resolvedLoops: [], sceneFacts: [], userFacts: [] },
}
const certificationCases = [
  ['share', 'That sounds like a satisfying reset after a stressful week.', 'reply', null],
  ['opinion', 'I think half court is more fun because every possession feels involved.', 'reply', null],
  ['stable', 'Start with a light jog, dynamic leg swings, and a few easy shots.', 'reply', null],
  ['dynamic', 'I will look up the current Houston Rockets roster.', 'lookup', null],
  ['locator', 'I will check Reddit for that reported trade.', 'lookup', 'reddit.com'],
  ['entity', 'I will check whether sunset sailing is currently available in Boracay.', 'lookup', null],
  ['question_streak', 'AI has reshaped backend work quickly while architectural judgment still matters.', 'reply', null],
  ['boundary', 'Understood. We can leave work hours aside.', 'reply', null],
  ['support', 'Shipping while exhausted can make success feel strangely flat. Rest can come first.', 'reply', null],
].map(([id, reply, lookupAction, locatorDomain]) => ({ id, reply, lookupAction, locatorDomain }))

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

const modelsByHost: Record<string, Record<string, unknown>> = {
  'api.openai.com': { data: [{ id: 'gpt-4.1' }] },
  'api.anthropic.com': { data: [{ id: 'claude-sonnet-5-5', lifecycle: 'active' }] },
  'generativelanguage.googleapis.com': { models: [{ name: 'models/gemini-3-pro', supportedGenerationMethods: ['generateContent'] }] },
  'api.deepseek.com': { data: [{ id: 'deepseek-chat' }] },
  'api.moonshot.ai': { data: [{ id: 'kimi-k3' }] },
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  const body = init.body ? JSON.parse(String(init.body)) : {}
  const serializedBody = JSON.stringify(body)
  const generated = JSON.stringify(serializedBody.includes('[question_streak]')
    ? { cases: certificationCases }
    : basicReply)

  if ((url.pathname.endsWith('/models') || url.pathname === '/v1beta/models') && !init.method) {
    return jsonResponse(modelsByHost[url.hostname])
  }
  if (url.pathname.endsWith('/responses')) {
    return jsonResponse({ output: [{ type: 'message', content: [{
      type: 'output_text',
      text: 'OpenAI official site',
      annotations: [{ type: 'url_citation', url: 'https://openai.com/', title: 'OpenAI' }],
    }] }] })
  }
  if (url.hostname === 'api.anthropic.com' && url.pathname.endsWith('/messages') && body.tools) {
    return jsonResponse({ content: [{ type: 'text', text: 'Anthropic official site', citations: [{ url: 'https://www.anthropic.com/', title: 'Anthropic' }] }], stop_reason: 'end_turn' })
  }
  if (url.hostname === 'api.anthropic.com' && url.pathname.endsWith('/messages')) {
    return jsonResponse({ content: [{ type: 'text', text: generated }], stop_reason: 'end_turn' })
  }
  if (url.hostname === 'generativelanguage.googleapis.com' && body.tools) {
    return jsonResponse({ candidates: [{ content: { parts: [{ text: 'Google AI official site' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://ai.google.dev/', title: 'Google AI' } }] } }] })
  }
  if (url.hostname === 'generativelanguage.googleapis.com') {
    return jsonResponse({ candidates: [{ content: { parts: [{ text: generated }] }, finishReason: 'STOP' }] })
  }
  if (url.pathname.endsWith('/v1/tools/search')) {
    return jsonResponse({ results: [{ title: 'DeepSeek', url: 'https://www.deepseek.com/', summary: 'Official website' }] })
  }
  if (url.pathname.endsWith('/tools/search_pro')) {
    return jsonResponse({ search_results: [{ title: 'Moonshot', url: 'https://www.moonshot.cn/', snippet: 'Official website' }] })
  }
  if (url.pathname.endsWith('/chat/completions')) {
    return jsonResponse({ choices: [{ finish_reason: 'stop', message: { content: generated } }] })
  }
  throw new Error(`Unexpected provider request: ${url}`)
}

const { app } = await import('./index.js')
const { getSecrets } = await import('./services/config.js')

test.after(async () => {
  await app.close()
  await rm(dataDir, { recursive: true, force: true })
})

test('all providers can test and save through one signed receipt without a discovery token', async () => {
  const providers = [
    ['openai', 'gpt-4.1'],
    ['anthropic', 'claude-sonnet-5-5'],
    ['gemini', 'gemini-3-pro'],
    ['deepseek', 'deepseek-chat'],
    ['kimi', 'kimi-k3'],
  ] as const

  for (const [id, model] of providers) {
    const apiKey = `key-${id}`
    const tested = await app.inject({
      method: 'POST',
      url: `/api/providers/${id}/test`,
      payload: { apiKey, model },
    })
    assert.equal(tested.statusCode, 200, `${id} test: ${tested.body}`)
    const testBody = tested.json()
    assert.equal(typeof testBody.setupReceipt, 'string')

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/providers/${id}`,
      payload: {
        apiKey,
        model,
        enabled: true,
        contextWindowTokens: 32_768,
        maxOutputTokens: 1_200,
        modelProfiles: { [model]: { contextWindowTokens: 32_768, maxOutputTokens: 1_200 } },
        setupReceipt: testBody.setupReceipt,
        capability: { outputMode: 'forged-by-client' },
      },
    })
    assert.equal(saved.statusCode, 200, `${id} save: ${saved.body}`)
    const publicProvider = saved.json().providers.find((provider: any) => provider.id === id)
    assert.equal(publicProvider.hasApiKey, true)
    assert.equal(publicProvider.capabilityReady, true)
    assert.equal(publicProvider.capability.model, model)
    assert.notEqual(publicProvider.capability.outputMode, 'forged-by-client')
  }
})

test('a receipt cannot save a different API key and does not partially overwrite the stored secret', async () => {
  const tested = await app.inject({
    method: 'POST',
    url: '/api/providers/deepseek/test',
    payload: { apiKey: 'replacement-key', model: 'deepseek-chat' },
  })
  assert.equal(tested.statusCode, 200)

  const saved = await app.inject({
    method: 'PUT',
    url: '/api/providers/deepseek',
    payload: {
      apiKey: 'different-key',
      model: 'deepseek-chat',
      enabled: true,
      contextWindowTokens: 32_768,
      maxOutputTokens: 1_200,
      modelProfiles: { 'deepseek-chat': { contextWindowTokens: 32_768, maxOutputTokens: 1_200 } },
      setupReceipt: tested.json().setupReceipt,
    },
  })

  assert.equal(saved.statusCode, 409)
  assert.equal(saved.json().code, 'SETUP_RECEIPT_KEY_MISMATCH')
  assert.equal((await getSecrets())['providers.deepseek.apiKey'], 'key-deepseek')
})

test('an already certified provider can update token budgets without testing again', async () => {
  const saved = await app.inject({
    method: 'PUT',
    url: '/api/providers/deepseek',
    payload: {
      model: 'deepseek-chat',
      enabled: true,
      contextWindowTokens: 48_000,
      maxOutputTokens: 2_400,
      modelProfiles: { 'deepseek-chat': { contextWindowTokens: 48_000, maxOutputTokens: 2_400 } },
    },
  })

  assert.equal(saved.statusCode, 200, saved.body)
  const provider = saved.json().providers.find((item: any) => item.id === 'deepseek')
  assert.equal(provider.capabilityReady, true)
  assert.equal(provider.contextWindowTokens, 48_000)
  assert.equal(provider.maxOutputTokens, 2_400)
  assert.equal((await getSecrets())['providers.deepseek.apiKey'], 'key-deepseek')
})
