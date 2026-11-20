import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-proficiency-api-'))
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
const { defaultConfig, saveConfigAndSecrets, getConfig } = await import('./services/config.js')
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

function replyAnswer(roleReply: string) {
  return JSON.stringify({
    roleReply, reconstruction: null, corrections: [], lookup,
    statePatch: { currentTopic: 'market', openedLoops: [], resolvedLoops: [], sceneFacts: [], userFacts: [] },
  })
}

const plainReply = 'Nice! Fresh bread is the best. Which market do you go to?'
const formalReply = 'Notwithstanding the committee’s reservations, the proposal was ratified after a protracted deliberation that exposed deep ideological rifts.'
const learnerLine = 'Yesterday I went to the market and bought two loaves of bread for my family.'

function stages(overrides: Partial<Record<Stage, (call: ModelCall) => string>> = {}) {
  return (call: ModelCall) => {
    if (overrides[call.stage]) return overrides[call.stage]!(call)
    if (call.stage === 'memory') return memoryAnswer()
    if (call.stage === 'analysis') return analysisAnswer()
    if (call.stage === 'reply') return replyAnswer(plainReply)
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
  calls = []
  sent += 1
  const response = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { content, clientMessageId: `turn-${sent}`, interfaceLocale: 'zh-CN' },
  })
  assert.equal(response.statusCode, 200, response.body)
  return response.json()
}

function stage(name: Stage) {
  return calls.filter((call) => call.stage === name)
}

async function level(conversationId: string) {
  const response = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}?interfaceLocale=zh-CN` })
  assert.equal(response.statusCode, 200, response.body)
  return response.json().level as { step: number; replyStep: number; previousStep: number | null; raised: boolean; speechRateFactor: number }
}

async function proficiency(language?: string) {
  const response = await app.inject({ method: 'GET', url: '/api/proficiency' + (language ? `?language=${language}` : '') })
  assert.equal(response.statusCode, 200, response.body)
  return response.json()
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

test('the level chosen in settings becomes the first profile, once', async () => {
  reset()
  await useProvider('openai', { proficiency: 'B2' })
  const first = await proficiency()
  assert.equal(first.languageCode, 'en')
  assert.equal(first.profile.step, stepOf('B2'))
  assert.equal(first.profile.workingStep, stepOf('B2'))
  assert.equal(first.profile.source, 'self')
  assert.equal(first.profile.confidence, 'low')
  assert.equal(first.profile.locked, false)
  assert.deepEqual(first.history.map((item: any) => [item.kind, item.fromStep, item.toStep, item.reason]), [['estimate', null, stepOf('B2'), 'self_selected']])
  // Another language has no profile until the learner says something about it.
  const spanish = await proficiency('es')
  assert.equal(spanish.profile, null)
  assert.equal(spanish.chosenStep, stepOf('B2'))
  // Clearing does not bring the settings level back by itself.
  const cleared = await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { clear: true } })
  assert.equal(cleared.json().profile, null)
  assert.equal((await proficiency()).profile, null)
})

test('a level is picked, changed, locked and cleared through the API', async () => {
  reset()
  await useProvider('openai')
  const missing = await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { language: 'ja', locked: true } })
  assert.equal(missing.statusCode, 400)
  assert.equal(missing.json().code, 'PROFICIENCY_LEVEL_REQUIRED')
  const picked = await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { language: 'ja', level: 'A2' } })
  assert.equal(picked.json().profile.step, stepOf('A2'))
  assert.equal(picked.json().profile.source, 'self')
  const changed = await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { language: 'ja', step: stepOf('B1', 'low') } })
  assert.equal(changed.json().profile.step, stepOf('B1', 'low'))
  assert.equal(changed.json().profile.source, 'manual')
  assert.equal(changed.json().history[0].reason, 'manual')
  // The difficulty alone can be set, but not further than one step above the estimate.
  const pushed = await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { language: 'ja', workingStep: stepOf('C1') } })
  assert.equal(pushed.json().profile.workingStep, stepOf('B1', 'low') + 1)
  assert.equal(pushed.json().profile.step, stepOf('B1', 'low'))
  const locked = await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { language: 'ja', locked: true } })
  assert.equal(locked.json().profile.locked, true)
  // An unknown language falls back to the one in use rather than creating a stray profile.
  const stray = await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { language: 'xx', level: 'C1' } })
  assert.equal(stray.json().languageCode, 'en')
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM proficiency_profiles').get()?.total, 2)
})

test('changing the level in settings changes the profile of the language in use', async () => {
  reset()
  await useProvider('openai')
  await proficiency()
  const current = await getConfig()
  const saved = await app.inject({ method: 'PUT', url: '/api/settings', payload: { learning: { ...current.learning, proficiency: 'A2', difficultyStep: 16 } } })
  assert.equal(saved.statusCode, 200, saved.body)
  assert.equal(saved.json().learning.difficultyStep, undefined)
  assert.equal((await getConfig()).learning.difficultyStep, undefined)
  const after = await proficiency()
  assert.equal(after.profile.step, stepOf('A2'))
  assert.equal(after.profile.source, 'manual')
})

for (const id of providerIds) {
  test(`${id}: the reply is written within the limits of the current difficulty`, async () => {
    reset()
    await useProvider(id, { proficiency: 'B1' })
    answer = stages()
    const conversationId = await startConversation()
    const before = await level(conversationId)
    assert.equal(before.step, stepOf('B1'))
    // The first two replies are a step easier.
    assert.equal(before.replyStep, stepOf('B1') - 1)
    assert.equal(before.raised, false)
    const turn = await send(conversationId)
    assert.equal(turn.assistantMessage.content, plainReply)
    assert.equal(turn.level.replyStep, stepOf('B1') - 1)
    const reply = stage('reply')[0].body
    assert.ok(reply.includes('Difficulty for this learner, B1 (lower part of the level)'), 'the reply prompt states the step')
    assert.ok(/no sentence longer than about \d+ words; at most \d+ sentences in the reply/.test(reply), 'the reply prompt states length limits')
    assert.ok(!reply.includes('learner level: B1'), 'the bare level name is gone from the reply prompt')
    assert.ok(stage('analysis')[0].body.includes('learner level: B1 (lower part of the level)'))
    // A reply inside the limits costs no extra call.
    assert.equal(stage('repair').length, 0)
    const signal = db.prepare('SELECT * FROM turn_signals WHERE conversation_id = ?').get(conversationId) as Record<string, any>
    assert.equal(signal.partner_message_id, 'start')
    assert.equal(signal.step, stepOf('B1') - 1)
    assert.equal(signal.length, 15)
    assert.equal(signal.meaning_errors, 0)
    assert.equal(signal.non_target, 0)
  })

  test(`${id}: a reply over the limits is rewritten once`, async () => {
    reset()
    await useProvider(id, { proficiency: 'A2' })
    answer = stages({ reply: () => replyAnswer(formalReply), repair: () => replyAnswer(plainReply) })
    const conversationId = await startConversation()
    const turn = await send(conversationId)
    assert.equal(stage('repair').length, 1)
    const repair = stage('repair')[0].body
    assert.ok(repair.includes('Too many uncommon words for this learner'), 'the rewrite is told about the words')
    assert.ok(repair.includes('A sentence runs to 17 words'), 'the rewrite is told about the length')
    assert.ok(repair.includes('Difficulty for this learner, A2 (lower part of the level)'), 'the rewrite is given the limits')
    assert.equal(turn.assistantMessage.content, plainReply)
  })

  test(`${id}: a rewrite that fails leaves the reply as it was`, async () => {
    reset()
    await useProvider(id, { proficiency: 'A2' })
    answer = stages({ reply: () => replyAnswer(formalReply), repair: () => 'not json' })
    const conversationId = await startConversation()
    const turn = await send(conversationId)
    assert.ok(stage('repair').length >= 1)
    assert.equal(turn.assistantMessage.content, formalReply)
  })
}

test('a C2 learner is not held to a word list', async () => {
  reset()
  await useProvider('openai', { proficiency: 'C2' })
  answer = stages({ reply: () => replyAnswer(formalReply) })
  const conversationId = await startConversation()
  const turn = await send(conversationId)
  assert.equal(stage('repair').length, 0)
  assert.equal(turn.assistantMessage.content, formalReply)
})

test('answering in another language makes the very next reply easier', async () => {
  reset()
  await useProvider('openai', { proficiency: 'B1' })
  const conversationId = await startConversation()
  answer = stages()
  await send(conversationId)
  await send(conversationId)
  assert.equal((await level(conversationId)).replyStep, stepOf('B1'))
  answer = stages({
    analysis: () => analysisAnswer({
      languageMatch: 'non_target',
      reconstruction: { type: 'translation', original: '我昨天去了市场。', improved: 'I went to the market yesterday.', explanation: '这句话可以这样用英语说。' },
    }),
  })
  const turn = await send(conversationId, '我昨天去了市场。')
  assert.equal(turn.level.replyStep, stepOf('B1') - 1)
  assert.ok(stage('reply')[0].body.includes('Difficulty for this learner, B1 (lower part of the level)'))
  const signal = db.prepare('SELECT * FROM turn_signals WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(conversationId) as Record<string, any>
  assert.equal(signal.non_target, 1)
  assert.equal(signal.length, 0)
})

test('three long clean turns raise the conversation one step', async () => {
  reset()
  await useProvider('openai', { proficiency: 'B1' })
  const conversationId = await startConversation()
  answer = stages()
  // Two warm-up turns, then the third long clean turn in a row lifts the reply.
  await send(conversationId)
  await send(conversationId)
  const third = await send(conversationId)
  assert.equal(third.level.replyStep, stepOf('B1') + 1)
  assert.ok(third.level.speechRateFactor > 0.9)
  // An error that changes the meaning does not lower it, it only stops a further run.
  answer = stages({ analysis: () => analysisAnswer({ corrections: [{ original: 'goed', improved: 'went', explanation: 'go 的过去式是 went。', severity: 'meaning', category: 'verb_form' }] }) })
  const fourth = await send(conversationId, 'Yesterday I goed to the market and I bought two loaves of bread for my family.')
  assert.equal(fourth.level.replyStep, stepOf('B1') + 1)
  const signal = db.prepare('SELECT * FROM turn_signals WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(conversationId) as Record<string, any>
  assert.equal(signal.meaning_errors, 1)
})

test('help on a line is recorded, and lowers the difficulty once per line', async () => {
  reset()
  await useProvider('openai', { proficiency: 'B1' })
  const conversationId = await startConversation()
  answer = stages()
  await send(conversationId)
  const second = await send(conversationId)
  const lineId = second.assistantMessage.id as string
  const signal = (kind: string, messageId = lineId) => app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/signals`, payload: { messageId, kind } })

  const firstLookup = (await signal('lookup')).json()
  assert.deepEqual([firstLookup.lowered, firstLookup.replyStep], [false, stepOf('B1')])
  const slower = (await signal('slower')).json()
  assert.equal(slower.lowered, false)
  const secondLookup = (await signal('lookup')).json()
  assert.deepEqual([secondLookup.lowered, secondLookup.replyStep], [true, stepOf('B1') - 1])
  // More help on the same line does not lower it again.
  const simpler = (await signal('simpler')).json()
  assert.deepEqual([simpler.lowered, simpler.replyStep], [false, stepOf('B1') - 1])
  const translated = (await signal('translate')).json()
  assert.equal(translated.lowered, false)
  const row = db.prepare('SELECT * FROM turn_signals WHERE conversation_id = ? AND partner_message_id = ?').get(conversationId, lineId) as Record<string, any>
  assert.deepEqual([row.lookups, row.slower, row.simpler, row.translated, row.lowered, row.user_message_id], [2, 1, 1, 1, 1, null])

  // The answer to that line is written a step lower, and the trouble is not counted a second time.
  const third = await send(conversationId)
  assert.equal(third.level.replyStep, stepOf('B1') - 1)
  const answered = db.prepare('SELECT * FROM turn_signals WHERE conversation_id = ? AND partner_message_id = ?').get(conversationId, lineId) as Record<string, any>
  assert.ok(answered.user_message_id)
  assert.equal(answered.lookups, 2)

  assert.equal((await signal('shout')).statusCode, 400)
  assert.equal((await signal('lookup', 'no-such-line')).statusCode, 400)
  // A learner's own message is not a line to ask for help with.
  assert.equal((await signal('lookup', third.userMessage.id)).statusCode, 400)
  const missing = await app.inject({ method: 'POST', url: '/api/conversations/none/signals', payload: { messageId: lineId, kind: 'lookup' } })
  assert.equal(missing.statusCode, 404)
})

async function holdConversation(turns: number) {
  const conversationId = await startConversation()
  for (let index = 0; index < turns; index += 1) await send(conversationId)
  const assessed = await app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/assess` })
  assert.equal(assessed.statusCode, 200, assessed.body)
  return { conversationId, ...assessed.json() }
}

test('conversations are assessed when left, and three easy ones raise the difficulty', async () => {
  reset()
  await useProvider('openai', { proficiency: 'B1' })
  await proficiency()
  answer = stages()

  const short = await holdConversation(3)
  assert.equal(short.assessment.valid, false)
  assert.deepEqual(short.changes, [])

  const first = await holdConversation(6)
  assert.equal(first.assessment.valid, true)
  assert.equal(first.assessment.verdict, 'easy')
  assert.equal(first.assessment.baseStep, stepOf('B1'))
  assert.equal(first.assessment.stats.turns, 6)
  assert.deepEqual(first.changes, [])
  // Asking again before anything new is said changes nothing.
  const again = await app.inject({ method: 'POST', url: `/api/conversations/${first.conversationId}/assess` })
  assert.deepEqual(again.json().changes, [])

  const second = await holdConversation(6)
  assert.deepEqual(second.changes, [])
  const third = await holdConversation(6)
  assert.deepEqual(third.changes.map((change: any) => [change.kind, change.fromStep, change.toStep, change.reason]), [['difficulty', stepOf('B1'), stepOf('B1') + 1, 'easy_streak']])
  assert.equal(third.profile.workingStep, stepOf('B1') + 1)
  assert.equal(third.profile.step, stepOf('B1'))

  const overview = await proficiency()
  assert.equal(overview.profile.workingStep, stepOf('B1') + 1)
  assert.equal(overview.history[0].reason, 'easy_streak')
  assert.equal(overview.conversations.length, 3)
  assert.ok(overview.profile.skills.grammar.evidence >= 3)

  // The next conversation starts at the new difficulty and says so.
  const next = await startConversation()
  const nextLevel = await level(next)
  assert.equal(nextLevel.step, stepOf('B1') + 1)
  assert.equal(nextLevel.previousStep, stepOf('B1'))
  assert.equal(nextLevel.raised, true)
})

test('a locked level is observed and not moved', async () => {
  reset()
  await useProvider('openai', { proficiency: 'B1' })
  await proficiency()
  await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { locked: true } })
  answer = stages()
  for (let index = 0; index < 3; index += 1) {
    const held = await holdConversation(6)
    assert.equal(held.assessment.verdict, 'easy')
    assert.deepEqual(held.changes, [])
  }
  const overview = await proficiency()
  assert.equal(overview.profile.workingStep, stepOf('B1'))
  assert.equal(overview.conversations.length, 3)
})

test('a conversation that has gone quiet is assessed the next time the level is read', async () => {
  reset()
  await useProvider('openai', { proficiency: 'B1' })
  await proficiency()
  answer = stages()
  const conversationId = await startConversation()
  for (let index = 0; index < 6; index += 1) await send(conversationId)
  assert.equal((await proficiency()).conversations.length, 0)
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(new Date(Date.now() - 31 * 60_000).toISOString(), conversationId)
  const overview = await proficiency()
  assert.equal(overview.conversations.length, 1)
  assert.equal(overview.conversations[0].conversationId, conversationId)
})

test('a conversation from before levels were kept gets the current difficulty and no warm-up', async () => {
  reset()
  await useProvider('openai', { proficiency: 'B2' })
  await proficiency()
  db.prepare(`INSERT INTO conversations (id, mode, title, status, created_at, updated_at) VALUES ('old', 'conversation', 'Old', 'active', ?, ?)`)
    .run('2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
  for (let index = 0; index < 3; index += 1) {
    db.prepare("INSERT INTO messages (id, conversation_id, role, content, status, created_at) VALUES (?, 'old', 'user', 'Hello there.', 'complete', ?)").run(`old-${index}`, `2026-10-01T00:0${index}:00.000Z`)
  }
  const oldLevel = await level('old')
  assert.equal(oldLevel.step, stepOf('B2'))
  assert.equal(oldLevel.replyStep, stepOf('B2'))
})

test('scene openings and suggested openings are asked for at the current difficulty', async () => {
  reset()
  await useProvider('openai', { proficiency: 'B1' })
  await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { step: stepOf('A2', 'high') } })
  calls = []
  answer = () => JSON.stringify({ setups: [{
    title: '周末市场', category: 'daily', setting: '周末的露天市场', partnerName: 'Maya', partnerRole: '摊主', relationship: '刚认识', tone: '友好',
    personalityCues: ['爱聊天'], interests: ['烘焙'], currentMood: '轻松', topicSeed: '面包', openingLine: 'Hi! Do you want to try this bread?', difficulty: 'C2',
  }] })
  const response = await app.inject({ method: 'POST', url: '/api/conversation-setups/suggest', payload: { domain: 'daily', interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  assert.ok(calls.length >= 1)
  assert.ok(calls[0].body.includes('at A2 (upper part of the level)'))
  assert.ok(calls[0].body.includes('openingLine is written for a learner at A2 (upper part of the level)'))
  // What the page shows next to the scene is the difficulty it was asked for at, whatever the model wrote.
  assert.equal(response.json().setups[0].difficulty, 'A2+')
})
