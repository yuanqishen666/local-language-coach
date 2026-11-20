import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-help-api-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'

type Stage = 'memory' | 'analysis' | 'reply' | 'repair' | 'simpler' | 'hint'
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
    : body.includes('Say one line of a conversation again, more simply') ? 'simpler'
    : body.includes('Help a language learner follow one line they did not understand') ? 'hint'
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
const { stepOf } = await import('../shared/proficiency.js')

const models = { openai: 'gpt-4.1', anthropic: 'claude-sonnet-5-5', gemini: 'gemini-3-pro', deepseek: 'deepseek-chat', kimi: 'kimi-k3' } as const
type ProviderId = keyof typeof models
const providerIds = Object.keys(models) as ProviderId[]

async function useProvider(id: ProviderId, learning: Partial<(typeof defaultConfig)['learning']> = {}) {
  const config = structuredClone(defaultConfig)
  config.setupComplete = true
  config.llm.defaultProvider = id
  config.learning = { ...config.learning, ...learning }
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

const lookup = { action: 'reply', parts: [{ text: 'went to the market', needsLookup: false, reason: 'stable', subject: 'market' }], query: '', locator: null }

function memoryAnswer() {
  return JSON.stringify({
    disposition: 'ignore', userFacts: [], replyType: 'casual', relevantTopics: [], relevantMemoryKeys: [],
    dialoguePlan: {
      mode: 'casual', anchorQuote: 'the market', anchorMeaning: 'The learner went to the market.', move: 'observe', topic: 'shopping', branch: 'market',
      contribution: 'Fresh bread is worth the trip.', questionPolicy: 'optional', questionPurpose: 'Which market they go to.', previousMoveOutcome: 'none', callbackMemoryKey: '', reopenBranch: false,
    },
  })
}

function analysisAnswer(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ languageMatch: 'target', lookup, reconstruction: null, corrections: [], ...overrides })
}

function replyAnswer(roleReply: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    roleReply, reconstruction: null, corrections: [], lookup,
    statePatch: { currentTopic: 'market', openedLoops: [], resolvedLoops: [], sceneFacts: [], userFacts: [] },
    ...extra,
  })
}

const plainReply = 'Nice! Fresh bread is the best. Which market do you go to?'
const simplerReply = 'Nice! I like fresh bread. Where is your market?'
const simplestReply = 'Good! I like bread. Where is the market?'
const learnerLine = 'Yesterday I went to the market and bought two loaves of bread for my family.'
const hintZh = '对方在夸新鲜面包，并问你常去哪个市场。fresh = 新鲜的；market = 市场。'
const hintEs = 'Tu compañero elogia el pan recién hecho y te pregunta a qué mercado vas. fresh = recién hecho; market = mercado.'

function stages(overrides: Partial<Record<Stage, (call: ModelCall) => string>> = {}) {
  return (call: ModelCall) => {
    if (overrides[call.stage]) return overrides[call.stage]!(call)
    if (call.stage === 'memory') return memoryAnswer()
    if (call.stage === 'analysis') return analysisAnswer()
    if (call.stage === 'reply') return replyAnswer(plainReply)
    if (call.stage === 'simpler') return JSON.stringify({ text: simplerReply })
    if (call.stage === 'hint') return JSON.stringify({ hint: hintZh })
    return '{}'
  }
}

async function startConversation() {
  const response = await app.inject({ method: 'POST', url: '/api/conversations', payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  return response.json().id as string
}

let sent = 0
async function send(conversationId: string, content = learnerLine) {
  sent += 1
  const response = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { content, clientMessageId: `turn-${sent}`, interfaceLocale: 'zh-CN' },
  })
  assert.equal(response.statusCode, 200, response.body)
  return response.json()
}

/** A conversation with one partner line in it, and nothing counted yet. */
async function withLine(provider: ProviderId = 'openai') {
  reset()
  await useProvider(provider, { proficiency: 'B1' })
  const conversationId = await startConversation()
  answer = stages()
  const turn = await send(conversationId)
  calls = []
  return { conversationId, lineId: turn.assistantMessage.id as string }
}

function stage(name: Stage) {
  return calls.filter((call) => call.stage === name)
}

async function conversation(conversationId: string, locale = 'zh-CN') {
  const response = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}?interfaceLocale=${locale}` })
  assert.equal(response.statusCode, 200, response.body)
  return response.json() as { level: { replyStep: number }; messages: Array<{ id: string; role: string; content: string; meta: Record<string, any> }> }
}

function simpler(conversationId: string, lineId: string) {
  return app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/messages/${lineId}/simpler`, payload: {} })
}

function hint(conversationId: string, lineId: string, interfaceLocale = 'zh-CN') {
  return app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/messages/${lineId}/hint`, payload: { interfaceLocale } })
}

function signalOf(lineId: string) {
  return db.prepare('SELECT * FROM turn_signals WHERE partner_message_id = ?').get(lineId) as Record<string, any> | undefined
}

function storedMeta(lineId: string) {
  return JSON.parse((db.prepare('SELECT meta_json FROM messages WHERE id = ?').get(lineId) as { meta_json: string }).meta_json) as Record<string, any>
}

function reset() {
  db.exec(`DELETE FROM proficiency_profiles; DELETE FROM proficiency_history; DELETE FROM conversation_assessments; DELETE FROM turn_signals;
    DELETE FROM messages; DELETE FROM conversations; DELETE FROM app_flags WHERE key = 'proficiency_seeded';`)
}

test.after(async () => {
  await app.close()
  db.close()
  await rm(dataDir, { recursive: true, force: true })
})

for (const provider of providerIds) {
  test(`${provider}: a line is said again more simply and takes the place of the first wording`, async () => {
    const { conversationId, lineId } = await withLine(provider)
    const before = (await conversation(conversationId)).level.replyStep
    const response = await simpler(conversationId, lineId)
    assert.equal(response.statusCode, 200, response.body)
    const result = response.json()
    assert.equal(result.content, simplerReply)
    assert.equal(result.originalReply, plainReply)
    assert.equal(result.simplerCount, 1)
    assert.equal(result.lowered, true)
    assert.equal(result.level.replyStep, before - 1)
    assert.equal(stage('simpler').length, 1)
    // The request carries the line, what it answered, and the limits of the step below.
    const body = stage('simpler')[0].body
    assert.ok(body.includes('Fresh bread is the best'))
    assert.ok(body.includes('bought two loaves'))
    assert.ok(body.includes('Difficulty for this learner'))
    const shown = (await conversation(conversationId)).messages.find((message) => message.id === lineId)!
    assert.equal(shown.content, simplerReply)
    assert.equal(shown.meta.originalReply, plainReply)
    assert.equal(shown.meta.roleReply, simplerReply)
  })

  test(`${provider}: a hint is written in the interface language and kept with the line`, async () => {
    const { conversationId, lineId } = await withLine(provider)
    const response = await hint(conversationId, lineId)
    assert.equal(response.statusCode, 200, response.body)
    assert.deepEqual({ hint: response.json().hint, cached: response.json().cached, lowered: response.json().lowered }, { hint: hintZh, cached: false, lowered: false })
    assert.ok(stage('hint')[0].body.includes('Fresh bread is the best'))
    const again = await hint(conversationId, lineId)
    assert.equal(again.json().cached, true)
    assert.equal(again.json().hint, hintZh)
    assert.equal(stage('hint').length, 1)
    assert.equal(signalOf(lineId)?.hints, 1)
    assert.equal(storedMeta(lineId).lineHints['zh-CN'], hintZh)
  })
}

test('each press goes one step lower, and the first wording stays on record', async () => {
  const { conversationId, lineId } = await withLine()
  const first = (await simpler(conversationId, lineId)).json()
  answer = stages({ simpler: () => JSON.stringify({ text: simplestReply }) })
  const second = await simpler(conversationId, lineId)
  assert.equal(second.statusCode, 200, second.body)
  assert.equal(second.json().content, simplestReply)
  assert.equal(second.json().originalReply, plainReply)
  assert.equal(second.json().simplerCount, 2)
  // One line lowers the conversation once, however often it is asked for.
  assert.equal(second.json().lowered, false)
  assert.equal(second.json().level.replyStep, first.level.replyStep)
  // The line opened the conversation one step under B1, so the first rewrite is at upper A2 and the second at A2.
  const [one, two] = stage('simpler').map((call) => call.body)
  assert.ok(one.includes('Difficulty for this learner, A2 (upper part of the level)'), one.slice(0, 600))
  assert.ok(two.includes('Difficulty for this learner, A2. '), two.slice(0, 600))
  assert.ok(two.includes('I like fresh bread'))
  assert.equal(signalOf(lineId)?.simpler, 2)
})

test('a rewrite that is the same line, or in another language, is turned down and the line is left alone', async () => {
  const { conversationId, lineId } = await withLine()
  answer = stages({ simpler: () => JSON.stringify({ text: plainReply }) })
  const same = await simpler(conversationId, lineId)
  assert.equal(same.statusCode, 502, same.body)
  answer = stages({ simpler: () => JSON.stringify({ text: '太好了！我喜欢新鲜的面包。你去哪个市场？' }) })
  const foreign = await simpler(conversationId, lineId)
  assert.equal(foreign.statusCode, 502, foreign.body)
  const shown = (await conversation(conversationId)).messages.find((message) => message.id === lineId)!
  assert.equal(shown.content, plainReply)
  assert.equal(shown.meta.originalReply, undefined)
  // Asking was still a sign that the line was too hard.
  assert.equal(signalOf(lineId)?.simpler, 2)
  // The next try starts from the same step: a failed attempt is not counted as a rewrite.
  answer = stages()
  calls = []
  assert.equal((await simpler(conversationId, lineId)).json().simplerCount, 1)
  assert.ok(stage('simpler')[0].body.includes('Difficulty for this learner, A2 (upper part of the level)'))
})

test('a rewrite that is longer and harder than the line is turned down', async () => {
  const { conversationId, lineId } = await withLine()
  answer = stages({
    simpler: () => JSON.stringify({ text: 'Notwithstanding the committee’s reservations, the proposal was ratified after a protracted deliberation that exposed deep ideological rifts among them.' }),
  })
  const response = await simpler(conversationId, lineId)
  assert.equal(response.statusCode, 502, response.body)
  assert.equal((await conversation(conversationId)).messages.find((message) => message.id === lineId)!.content, plainReply)
})

test('what was written about the first wording goes when the line is rewritten', async () => {
  const { conversationId, lineId } = await withLine()
  assert.equal((await hint(conversationId, lineId)).statusCode, 200)
  const meta = storedMeta(lineId)
  db.prepare('UPDATE messages SET meta_json = ? WHERE id = ?').run(JSON.stringify({ ...meta, roleReplyTranslations: { 'zh-CN': '真好！' } }), lineId)
  assert.equal((await simpler(conversationId, lineId)).statusCode, 200)
  const after = storedMeta(lineId)
  assert.equal(after.lineHints, undefined)
  assert.equal(after.roleReplyTranslations, undefined)
  // The hint for the new wording is written afresh.
  calls = []
  assert.equal((await hint(conversationId, lineId)).json().cached, false)
  assert.ok(stage('hint')[0].body.includes('I like fresh bread'))
})

test('a line built on looked-up material is not rewritten', async () => {
  const { conversationId, lineId } = await withLine()
  db.prepare('UPDATE messages SET meta_json = ? WHERE id = ?')
    .run(JSON.stringify({ ...storedMeta(lineId), grounding: { provider: 'openai', citations: [{ url: 'https://example.com', title: 'Example' }] } }), lineId)
  const response = await simpler(conversationId, lineId)
  assert.equal(response.statusCode, 409, response.body)
  assert.equal(response.json().code, 'SIMPLER_UNAVAILABLE')
  assert.equal(calls.length, 0)
  assert.equal(signalOf(lineId), undefined)
})

test('a hint is written once for each interface language', async () => {
  const { conversationId, lineId } = await withLine()
  assert.equal((await hint(conversationId, lineId)).json().hint, hintZh)
  answer = stages({ hint: () => JSON.stringify({ hint: hintEs }) })
  const spanish = await hint(conversationId, lineId, 'es-419')
  assert.equal(spanish.statusCode, 200, spanish.body)
  assert.equal(spanish.json().hint, hintEs)
  assert.equal(spanish.json().interfaceLocale, 'es-419')
  assert.ok(stage('hint')[1].body.includes('Spanish'))
  assert.deepEqual(Object.keys(storedMeta(lineId).lineHints).sort(), ['es-419', 'zh-CN'])
})

test('a hint that only repeats the line is turned down', async () => {
  const { conversationId, lineId } = await withLine()
  answer = stages({ hint: () => JSON.stringify({ hint: plainReply }) })
  const response = await hint(conversationId, lineId)
  assert.equal(response.statusCode, 502, response.body)
  assert.equal(storedMeta(lineId).lineHints, undefined)
  assert.equal(signalOf(lineId), undefined)
})

test('only a partner line of this conversation can be asked about', async () => {
  const { conversationId, lineId } = await withLine()
  const other = await startConversation()
  const learner = (await conversation(conversationId)).messages.find((message) => message.role === 'user')!
  assert.equal((await simpler(conversationId, 'none')).statusCode, 404)
  assert.equal((await simpler(conversationId, learner.id)).statusCode, 404)
  assert.equal((await simpler(other, lineId)).statusCode, 404)
  assert.equal((await hint('none', lineId)).statusCode, 404)
  assert.equal((await hint(conversationId, learner.id)).statusCode, 404)
  assert.equal(calls.length, 0)
})

for (const provider of providerIds) {
  test(`${provider}: a question asked in another language gets a short answer in it beside the reply`, async () => {
    reset()
    await useProvider(provider, { proficiency: 'B1' })
    const conversationId = await startConversation()
    const aside = '“loaves”是 loaf 的复数，指整条的面包。'
    answer = stages({
      analysis: () => analysisAnswer({
        languageMatch: 'non_target',
        reconstruction: { type: 'translation', original: 'loaves 是什么意思？', improved: 'What does “loaves” mean?', explanation: '这句话可以这样用英语问。' },
      }),
      reply: () => replyAnswer(plainReply, { aside }),
    })
    calls = []
    const turn = await send(conversationId, 'loaves 是什么意思？')
    assert.equal(turn.assistantMessage.content, plainReply)
    assert.equal(turn.assistantMessage.meta.aside, aside)
    assert.ok(stage('reply')[0].body.includes('answer that in aside'))
    const shown = (await conversation(conversationId)).messages.find((message) => message.id === turn.assistantMessage.id)!
    assert.equal(shown.meta.aside, aside)
  })
}

test('a turn in the language being learned carries no aside, whatever the model wrote', async () => {
  reset()
  await useProvider('openai', { proficiency: 'B1' })
  const conversationId = await startConversation()
  answer = stages({ reply: () => replyAnswer(plainReply, { aside: '顺便说一下。' }) })
  calls = []
  const turn = await send(conversationId)
  assert.equal(turn.assistantMessage.meta.aside, undefined)
  assert.ok(!stage('reply')[0].body.includes('answer that in aside'))
  // A reply without the field is complete: models outside strict schema mode leave it out.
  answer = stages()
  assert.equal((await send(conversationId)).assistantMessage.content, plainReply)
  assert.equal(stepOf('B1'), 7)
})
