import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-conversation-learning-language-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'

type Stage = 'memory' | 'analysis' | 'reply' | 'repair' | 'lookup' | 'translation'
interface ModelCall { stage: Stage; body: string }

let answer: (call: ModelCall) => string = () => '{}'
let calls: ModelCall[] = []

globalThis.fetch = async (_input, init = {}) => {
  const body = String(init.body || '')
  const stage: Stage = body.includes('Analyze durable user memory') ? 'memory'
    : body.includes('Analyze the latest learner turn before a conversation partner replies') ? 'analysis'
    : body.includes('Rewrite one conversation turn so it sounds like a real person') ? 'repair'
    : body.includes('Explain a selected ') ? 'lookup'
    : body.includes('Translate the supplied ') ? 'translation'
    : 'reply'
  const call: ModelCall = { stage, body }
  calls.push(call)
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: answer(call) } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const { app } = await import('./index.js')
const { db } = await import('./services/database.js')
const { defaultConfig, saveConfigAndSecrets } = await import('./services/config.js')
const { STRUCTURED_CONTRACT_VERSION } = await import('./ai/provider.js')

/** What changing the learning language in settings leaves behind. */
async function learn(targetLanguage: string, targetLanguageCode: string) {
  const config = structuredClone(defaultConfig)
  config.setupComplete = true
  config.learning = { ...config.learning, targetLanguage, targetLanguageCode }
  config.llm.defaultProvider = 'openai'
  config.providers = config.providers.map((provider) => provider.id === 'openai' ? {
    ...provider,
    enabled: true,
    model: 'gpt-4.1',
    capability: {
      outputMode: 'json_schema' as const,
      conversationReady: true as const,
      lookupReady: true as const,
      baseUrl: provider.baseUrl,
      model: 'gpt-4.1',
      contractVersion: STRUCTURED_CONTRACT_VERSION,
      testedAt: '2026-11-20T00:00:00.000Z',
    },
  } : provider)
  await saveConfigAndSecrets(config, { 'providers.openai.apiKey': 'test-key' })
}

async function startConversation() {
  const response = await app.inject({ method: 'POST', url: '/api/conversations', payload: { title: 'Test', setup: null, interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  return response.json().id as string
}

/** A conversation as the database held it before the learning language was recorded. */
function conversationFromBefore() {
  const id = 'from-before-the-language-was-recorded'
  db.prepare(`INSERT INTO conversations (id, mode, title, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, 'conversation', 'Test', 'active', '2026-11-20T00:00:00.000Z', '2026-11-20T00:00:00.000Z')
  return id
}

async function open(conversationId: string) {
  const response = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}?interfaceLocale=zh-CN` })
  assert.equal(response.statusCode, 200, response.body)
  return response.json() as { targetLanguageCode?: string }
}

function send(conversationId: string, content: string) {
  calls = []
  return app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { content, clientMessageId: `${conversationId}-${Math.random().toString(36).slice(2)}`, interfaceLocale: 'zh-CN' },
  })
}

function bodyOf(stage: Stage) {
  const call = calls.find((item) => item.stage === stage)
  assert.ok(call, `no ${stage} request was made`)
  return call.body
}

function count(stage: Stage) {
  return calls.filter((call) => call.stage === stage).length
}

interface Turn { learner: string; quote: string; partner: string }

const english: Turn = {
  learner: 'Yesterday I went to the market and bought some bread.',
  quote: 'the market',
  partner: 'Nice! Fresh bread is the best. Which market do you go to?',
}
const japanese: Turn = {
  learner: '昨日は市場に行って、パンを買いました。',
  quote: '市場',
  partner: 'いいですね！焼きたてのパンは最高です。どの市場によく行きますか？',
}

function turnAnswers(turn: Turn) {
  const lookup = { action: 'reply', parts: [{ text: turn.learner, needsLookup: false, reason: 'stable', subject: 'market' }], query: '', locator: null }
  return (call: ModelCall) => {
    if (call.stage === 'memory') {
      return JSON.stringify({
        disposition: 'ignore', userFacts: [], replyType: 'casual', relevantTopics: [], relevantMemoryKeys: [],
        dialoguePlan: {
          mode: 'casual', anchorQuote: turn.quote, anchorMeaning: 'The learner went to the market.', move: 'observe', topic: 'shopping', branch: 'market',
          contribution: 'Fresh bread is worth the trip.', questionPolicy: 'optional', questionPurpose: 'Which market they go to.', previousMoveOutcome: 'none', callbackMemoryKey: '', reopenBranch: false,
        },
      })
    }
    if (call.stage === 'analysis') return JSON.stringify({ languageMatch: 'target', lookup, reconstruction: null, corrections: [] })
    if (call.stage === 'reply') {
      return JSON.stringify({
        roleReply: turn.partner, reconstruction: null, corrections: [], lookup,
        statePatch: { currentTopic: 'market', openedLoops: [], resolvedLoops: [], sceneFacts: [], userFacts: [] },
      })
    }
    return '{}'
  }
}

test.after(async () => {
  await app.close()
  await rm(dataDir, { recursive: true, force: true })
})

test('a conversation records the learning language it starts in and keeps it when the setting changes', async () => {
  await learn('English', 'en')
  const id = await startConversation()
  assert.deepEqual(
    { ...db.prepare('SELECT target_language, target_language_code FROM conversations WHERE id = ?').get(id) },
    { target_language: 'English', target_language_code: 'en' },
  )
  assert.equal((await open(id)).targetLanguageCode, 'en')

  await learn('Japanese', 'ja')
  assert.equal((await open(id)).targetLanguageCode, 'en')

  // The partner keeps speaking English, and an English reply is taken on the first answer.
  answer = turnAnswers(english)
  const turn = await send(id, english.learner)
  assert.equal(turn.statusCode, 200, turn.body)
  assert.equal(turn.json().assistantMessage.content, english.partner)
  assert.equal(count('reply'), 1)
  for (const stage of ['analysis', 'reply'] as const) {
    assert.match(bodyOf(stage), /Target language: English \(en\)/, stage)
    assert.doesNotMatch(bodyOf(stage), /Japanese/, stage)
  }

  // A conversation started now is a Japanese one.
  const later = await startConversation()
  assert.equal((await open(later)).targetLanguageCode, 'ja')
})

test('a conversation from before the language was recorded follows the current setting', async () => {
  await learn('English', 'en')
  const id = conversationFromBefore()
  assert.equal('targetLanguageCode' in await open(id), false)

  answer = turnAnswers(english)
  const first = await send(id, english.learner)
  assert.equal(first.statusCode, 200, first.body)
  assert.match(bodyOf('reply'), /Target language: English \(en\)/)

  await learn('Japanese', 'ja')
  assert.equal('targetLanguageCode' in await open(id), false)
  answer = turnAnswers(japanese)
  const second = await send(id, japanese.learner)
  assert.equal(second.statusCode, 200, second.body)
  assert.equal(second.json().assistantMessage.content, japanese.partner)
  assert.match(bodyOf('reply'), /Target language: Japanese \(ja\)/)
})

test('looking a word up and translating a message use the language of the conversation they belong to', async () => {
  await learn('English', 'en')
  const id = await startConversation()
  answer = turnAnswers(english)
  const turn = await send(id, english.learner)
  assert.equal(turn.statusCode, 200, turn.body)
  const messageId = turn.json().assistantMessage.id as string

  await learn('Japanese', 'ja')
  const explained = (term: string) => JSON.stringify({
    term, lemma: term, partOfSpeech: '名词', pronunciation: '', contextMeaning: '市场',
    forms: [], senses: [{ meaning: '市场', example: '', translation: '' }], collocations: [], register: '', regionalNotes: '',
  })
  const lookUp = async (term: string, conversationId?: string) => {
    calls = []
    answer = () => explained(term)
    const response = await app.inject({
      method: 'POST',
      url: '/api/lookup',
      payload: { term, sentence: english.learner, interfaceLocale: 'zh-CN', ...(conversationId ? { conversationId } : {}) },
    })
    assert.equal(response.statusCode, 200, response.body)
    return bodyOf('lookup')
  }
  assert.match(await lookUp('market', id), /Explain a selected English word/)
  // The same word asked about outside any conversation is a different question, not a cached answer.
  assert.match(await lookUp('market'), /Explain a selected Japanese word/)
  assert.match(await lookUp('bread', 'no-such-conversation'), /Explain a selected Japanese word/)

  calls = []
  answer = () => JSON.stringify({ translation: '真不错！刚出炉的面包最好吃了。你常去哪个市场？' })
  const translated = await app.inject({
    method: 'POST',
    url: `/api/conversations/${id}/messages/${messageId}/translation`,
    payload: { interfaceLocale: 'zh-CN' },
  })
  assert.equal(translated.statusCode, 200, translated.body)
  assert.match(bodyOf('translation'), /Translate the supplied English message/)

  // With the interface in Japanese too, an English message still needs translating.
  calls = []
  answer = () => JSON.stringify({ translation: 'いいですね！焼きたてのパンは最高です。どの市場によく行きますか？' })
  const intoJapanese = await app.inject({
    method: 'POST',
    url: `/api/conversations/${id}/messages/${messageId}/translation`,
    payload: { interfaceLocale: 'ja-JP' },
  })
  assert.equal(intoJapanese.statusCode, 200, intoJapanese.body)
  assert.equal(count('translation'), 1)
  assert.notEqual(intoJapanese.json().translation, english.partner)
})
