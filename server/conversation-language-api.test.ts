import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-turn-language-api-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'

type Stage = 'memory' | 'analysis' | 'reply' | 'repair'
interface ModelCall { stage: Stage; host: string; body: string }

let answer: (call: ModelCall) => string = () => '{}'
let calls: ModelCall[] = []

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  const body = String(init.body || '')
  const stage: Stage = body.includes('Analyze durable user memory') ? 'memory'
    : body.includes('Analyze the latest learner turn before a conversation partner replies') ? 'analysis'
    : body.includes('Rewrite one conversation turn so it sounds like a real person') ? 'repair'
    : 'reply'
  const call: ModelCall = { stage, host: url.hostname, body }
  calls.push(call)
  const content = answer(call)
  if (url.hostname === 'api.anthropic.com') return jsonResponse({ content: [{ type: 'text', text: content }], stop_reason: 'end_turn' })
  if (url.hostname === 'generativelanguage.googleapis.com') return jsonResponse({ candidates: [{ content: { parts: [{ text: content }] }, finishReason: 'STOP' }] })
  return jsonResponse({ choices: [{ finish_reason: 'stop', message: { content } }] })
}

const { app } = await import('./index.js')
const { db } = await import('./services/database.js')
const { defaultConfig, saveConfigAndSecrets } = await import('./services/config.js')
const { STRUCTURED_CONTRACT_VERSION } = await import('./ai/provider.js')

const models = { openai: 'gpt-4.1', anthropic: 'claude-sonnet-5-5', gemini: 'gemini-3-pro', deepseek: 'deepseek-chat', kimi: 'kimi-k3' } as const
type ProviderId = keyof typeof models
const providerIds = Object.keys(models) as ProviderId[]

async function useProvider(id: ProviderId) {
  const config = structuredClone(defaultConfig)
  config.setupComplete = true
  config.llm.defaultProvider = id
  config.providers = config.providers.map((provider) => provider.id === id ? {
    ...provider,
    enabled: true,
    model: models[id],
    capability: {
      outputMode: id === 'deepseek' ? 'json_object' as const : 'json_schema' as const,
      conversationReady: true as const,
      lookupReady: true as const,
      baseUrl: provider.baseUrl,
      model: models[id],
      contractVersion: STRUCTURED_CONTRACT_VERSION,
      testedAt: '2026-11-20T00:00:00.000Z',
    },
  } : provider)
  await saveConfigAndSecrets(config, { [`providers.${id}.apiKey`]: 'test-key' })
}

let conversations = 0

/** A chat with no scene behind it, or one that the partner opened. */
function newConversation(openingLine = '') {
  conversations += 1
  const id = `language-turn-${conversations}`
  db.prepare(`INSERT INTO conversations (id, mode, title, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, 'conversation', 'Test', 'active', '2026-11-20T00:00:00.000Z', '2026-11-20T00:00:00.000Z')
  if (openingLine) {
    db.prepare(`INSERT INTO messages (id, conversation_id, role, content, meta_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(`${id}-opening`, id, 'assistant', openingLine, '{}', 'complete', '2026-11-20T00:00:01.000Z')
  }
  return id
}

const learnerLine = 'Yesterday I goed to the market and buyed two breads.'

function send(conversationId: string, content = learnerLine) {
  calls = []
  return app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { content, clientMessageId: `${conversationId}-${Math.random().toString(36).slice(2)}`, interfaceLocale: 'zh-CN' },
  })
}

function count(stage: Stage) {
  return calls.filter((call) => call.stage === stage).length
}

const lookup = { action: 'reply', parts: [{ text: 'went to the market and bought bread', needsLookup: false, reason: 'stable', subject: 'market' }], query: '', locator: null }

function memoryAnswer() {
  return JSON.stringify({
    disposition: 'ignore', userFacts: [], replyType: 'casual', relevantTopics: [], relevantMemoryKeys: [],
    dialoguePlan: {
      mode: 'casual', anchorQuote: 'the market', anchorMeaning: 'The learner went to the market.', move: 'observe', topic: 'shopping', branch: 'market',
      contribution: 'Fresh bread is worth the trip.', questionPolicy: 'optional', questionPurpose: 'Which market they go to.', previousMoveOutcome: 'none', callbackMemoryKey: '', reopenBranch: false,
    },
  })
}

function analysisAnswer(explanations: [string, string]) {
  return JSON.stringify({
    languageMatch: 'target',
    lookup,
    reconstruction: null,
    corrections: [
      { original: 'goed', improved: 'went', explanation: explanations[0], severity: 'meaning' },
      { original: 'two breads', improved: 'two loaves of bread', explanation: explanations[1], severity: 'naturalness' },
    ],
  })
}

function replyAnswer(roleReply: string) {
  return JSON.stringify({
    roleReply, reconstruction: null, corrections: [], lookup,
    statePatch: { currentTopic: 'market', openedLoops: [], resolvedLoops: [], sceneFacts: [], userFacts: [] },
  })
}

// Notes as a Chinese speaker gets them about English: short, and mostly made of the quoted English.
const notes: [string, string] = ['go 的过去式是不规则变化 went，不能写成 goed。', 'bread 不可数，要说 two loaves of bread 或 some bread。']
const notesInEnglish: [string, string] = ['The past tense of go is went, not goed.', 'Bread is uncountable, so say two loaves of bread.']
const partnerReply = 'Nice! Fresh bread is the best. Which market do you go to?'
const replyInChinese = '真不错！刚出炉的面包最好吃了。你常去哪个市场？'

function stages(overrides: Partial<Record<Stage, (call: ModelCall) => string>> = {}) {
  return (call: ModelCall) => {
    if (overrides[call.stage]) return overrides[call.stage]!(call)
    if (call.stage === 'memory') return memoryAnswer()
    if (call.stage === 'analysis') return analysisAnswer(notes)
    if (call.stage === 'reply') return replyAnswer(partnerReply)
    // The polish stage is optional; an empty answer leaves the reply as it was written.
    return '{}'
  }
}

test.after(async () => {
  await app.close()
  await rm(dataDir, { recursive: true, force: true })
})

test('an ordinary turn goes through on the first answer of every stage, on every provider', async () => {
  for (const id of providerIds) {
    await useProvider(id)
    answer = stages()
    const response = await send(newConversation())
    assert.equal(response.statusCode, 200, `${id}: ${response.body}`)
    assert.equal(count('analysis'), 1, id)
    assert.equal(count('reply'), 1, id)
    assert.equal(response.json().assistantMessage.content, partnerReply, id)
    assert.deepEqual(response.json().assistantMessage.meta.corrections.map((item: { explanation: string }) => item.explanation), notes, id)
  }
})

test('notes that stay in another language are kept after the retries instead of losing the turn', async () => {
  await useProvider('openai')
  answer = stages({ analysis: () => analysisAnswer(notesInEnglish) })
  const kept = await send(newConversation())
  assert.equal(kept.statusCode, 200, kept.body)
  assert.equal(count('analysis'), 3)
  assert.equal(kept.json().assistantMessage.meta.corrections.length, 2)

  // A retry that gets it right is what the learner sees.
  let asked = 0
  answer = stages({ analysis: () => analysisAnswer((asked += 1) === 1 ? notesInEnglish : notes) })
  const improved = await send(newConversation())
  assert.equal(improved.statusCode, 200, improved.body)
  assert.equal(count('analysis'), 2)
  assert.deepEqual(improved.json().assistantMessage.meta.corrections.map((item: { explanation: string }) => item.explanation), notes)
})

test('a reply in the wrong language is asked for again in the target language, and a complete reply is never dropped', async () => {
  await useProvider('openai')
  answer = stages({ reply: (call) => replyAnswer(call.body.includes('Write roleReply only in English.') ? partnerReply : replyInChinese) })
  const corrected = await send(newConversation())
  assert.equal(corrected.statusCode, 200, corrected.body)
  assert.equal(count('reply'), 2)
  assert.equal(corrected.json().assistantMessage.content, partnerReply)

  answer = stages({ reply: () => replyAnswer(replyInChinese) })
  const shown = await send(newConversation())
  assert.equal(shown.statusCode, 200, shown.body)
  assert.equal(count('reply'), 3)
  assert.equal(shown.json().assistantMessage.content, replyInChinese)

  // A reply with nothing in it is still an error.
  answer = stages({ reply: () => replyAnswer('') })
  const empty = await send(newConversation())
  assert.equal(empty.statusCode, 502, empty.body)
  assert.equal(empty.json().code, 'PROVIDER_INVALID_RESPONSE')
})

test('a reply that shows a code block is read whole, on every provider', async () => {
  const withCode = 'Sure. A loop over a list looks like this:\n```js\nfor (const item of items) {\n  console.log(item)\n}\n```\nDoes that make sense?'
  for (const id of providerIds) {
    await useProvider(id)
    answer = stages({ reply: () => replyAnswer(withCode) })
    const response = await send(newConversation(), 'Can you show me how to write a loop in JavaScript?')
    assert.equal(response.statusCode, 200, `${id}: ${response.body}`)
    assert.equal(count('reply'), 1, id)
    assert.equal(response.json().assistantMessage.content, withCode, id)
  }
})

test('a chat that the partner opened is sent to Anthropic and Gemini starting with a user turn', async () => {
  const opening = 'Welcome! Please take a seat and tell me a little about yourself.'
  const firstRoles = (call: ModelCall) => {
    const body = JSON.parse(call.body)
    const turns: Array<{ role: string }> = body.contents || body.messages.filter((message: { role: string }) => message.role !== 'system')
    return turns.map((turn) => turn.role)
  }

  for (const id of providerIds) {
    await useProvider(id)
    answer = stages()
    const response = await send(newConversation(opening))
    assert.equal(response.statusCode, 200, `${id}: ${response.body}`)
    const roles = firstRoles(calls.find((call) => call.stage === 'reply')!)
    if (id === 'anthropic') assert.deepEqual(roles, ['user', 'assistant', 'user'])
    else if (id === 'gemini') assert.deepEqual(roles, ['user', 'model', 'user'])
    else assert.deepEqual(roles, ['assistant', 'user'], id)
  }
})
