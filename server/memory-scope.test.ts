import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-memory-scope-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'

type Stage = 'memory' | 'analysis' | 'reply' | 'repair' | 'lookup' | 'translation' | 'consolidation' | 'setups'
interface ModelCall { stage: Stage; body: string }

let answer: (call: ModelCall) => string = () => '{}'
let calls: ModelCall[] = []

globalThis.fetch = async (_input, init = {}) => {
  const body = String(init.body || '')
  const stage: Stage = body.includes('Tidy up a learner’s memory after one conversation has ended.') ? 'consolidation'
    : body.includes('Analyze durable user memory') ? 'memory'
    : body.includes('Analyze the latest learner turn before a conversation partner replies') ? 'analysis'
    : body.includes('Rewrite one conversation turn so it sounds like a real person') ? 'repair'
    : body.includes('Explain a selected ') ? 'lookup'
    : body.includes('Translate the supplied ') ? 'translation'
    : body.includes('for an open-ended adult conversation in ') ? 'setups'
    : 'reply'
  const call: ModelCall = { stage, body }
  calls.push(call)
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: answer(call) } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const { app } = await import('./index.js')
const { db, reviewMemoriesFromScenes } = await import('./services/database.js')
const { defaultConfig, saveConfigAndSecrets } = await import('./services/config.js')
const { STRUCTURED_CONTRACT_VERSION } = await import('./ai/provider.js')

async function configure(options: { consolidate?: boolean; language?: [string, string] } = {}) {
  const config = structuredClone(defaultConfig)
  const [targetLanguage, targetLanguageCode] = options.language || ['English', 'en']
  config.setupComplete = true
  config.learning = { ...config.learning, targetLanguage, targetLanguageCode }
  config.llm.defaultProvider = 'openai'
  if (options.consolidate !== undefined) config.memory = { consolidate: options.consolidate }
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

function clear() {
  for (const table of ['memory_suggestions', 'learning_events', 'conversation_memories', 'memory_sources', 'memory_revisions', 'memories', 'messages', 'conversations']) {
    db.exec(`DELETE FROM ${table}`)
  }
  calls = []
}

const cafe = {
  title: '咖啡店的下午', category: '日常', setting: '工作日下午的街角咖啡店', partnerName: 'Maya', partnerRole: '常来的熟客',
  relationship: '见过几次的熟面孔', tone: '轻松随意', personalityCues: ['随和'], interests: ['手冲咖啡'], currentMood: '放松',
  topicSeed: '新上的豆子', openingLine: 'Hey, have you tried the new beans yet?', difficulty: 'B1',
}

async function start(setup: Record<string, unknown> | null = null) {
  const response = await app.inject({ method: 'POST', url: '/api/conversations', payload: { title: 'Test', setup, interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  return response.json().id as string
}

interface Fact {
  key: string; semanticSlot: string; value: string; quote: string; memoryType: string
  about?: string; durability?: string; validDays?: number; explicit?: boolean; sensitive?: boolean; importance?: number
}
interface Correction { original: string; improved: string; category: string }
interface Turn { learner: string; partner: string; facts?: Fact[]; corrections?: Correction[]; relevantMemoryKeys?: string[] }

function answers(turn: Turn) {
  const lookup = { action: 'reply', parts: [{ text: turn.learner, needsLookup: false, reason: 'stable', subject: 'everyday talk' }], query: '', locator: null }
  const corrections = (turn.corrections || []).map((item) => ({ ...item, explanation: '这里应该换一种说法。', severity: 'minor' }))
  const facts = (turn.facts || []).map((fact) => ({ sensitive: false, topic: 'general', importance: 0.6, suggestedTier: 'long_term', ...fact }))
  return (call: ModelCall) => {
    if (call.stage === 'memory') {
      return JSON.stringify({
        disposition: facts.length ? 'remember' : 'ignore', userFacts: facts, replyType: 'casual', relevantTopics: [],
        relevantMemoryKeys: turn.relevantMemoryKeys || [],
        dialoguePlan: {
          mode: 'casual', anchorQuote: turn.learner.slice(0, 12), anchorMeaning: 'What the learner just said.', move: 'observe', topic: 'general', branch: 'small talk',
          contribution: 'Respond to what they said.', questionPolicy: 'optional', questionPurpose: 'Keep it going.', previousMoveOutcome: 'none', callbackMemoryKey: '', reopenBranch: false,
        },
      })
    }
    if (call.stage === 'analysis') return JSON.stringify({ languageMatch: 'target', lookup, reconstruction: null, corrections })
    if (call.stage === 'reply') {
      return JSON.stringify({
        roleReply: turn.partner, reconstruction: null, corrections, lookup,
        statePatch: { currentTopic: 'general', openedLoops: [], resolvedLoops: [], sceneFacts: [], userFacts: [] },
      })
    }
    return '{}'
  }
}

let sent = 0
async function say(conversationId: string, turn: Turn) {
  calls = []
  answer = answers(turn)
  sent += 1
  const response = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { content: turn.learner, clientMessageId: `turn-${sent}`, interfaceLocale: 'zh-CN' },
  })
  assert.equal(response.statusCode, 200, response.body)
  return response.json().assistantMessage as { id: string; meta: Record<string, any> }
}

function bodyOf(stage: Stage) {
  const call = calls.find((item) => item.stage === stage)
  assert.ok(call, `no ${stage} request was made`)
  return call.body
}

async function get(url: string) {
  const response = await app.inject({ method: 'GET', url })
  assert.equal(response.statusCode, 200, response.body)
  return response.json()
}

async function post(url: string, payload: Record<string, unknown> = {}) {
  const response = await app.inject({ method: 'POST', url, payload })
  assert.equal(response.statusCode, 200, response.body)
  return response.json()
}

async function remember(memory: Record<string, unknown>) {
  return post('/api/memories', { status: 'confirmed', interfaceLocale: 'zh-CN', ...memory })
}

const pilot: Fact = { key: '职业', semanticSlot: 'profile.occupation', value: '是一名飞行员', quote: 'I work as a pilot', memoryType: 'profile', about: 'persona', durability: 'lasting' }
const peanuts: Fact = { key: '过敏', semanticSlot: 'constraint.allergy', value: '对花生过敏', quote: 'I am allergic to peanuts', memoryType: 'constraint', about: 'user', durability: 'lasting' }

test.after(async () => {
  await app.close()
  await rm(dataDir, { recursive: true, force: true })
})

test('what the part being played says stays with its conversation and goes when the conversation does', async () => {
  await configure()
  clear()
  const scene = await start(cafe)
  const first = await say(scene, { learner: 'I work as a pilot, so I am rarely in town.', partner: 'That explains why I only see you here now and then.', facts: [pilot] })
  assert.deepEqual(first.meta.memoryCandidates, [])
  assert.deepEqual(await get('/api/memories'), [])

  const kept = await get(`/api/conversations/${scene}/memories`)
  assert.equal(kept.length, 1)
  assert.deepEqual([kept[0].value, kept[0].about, kept[0].quote], ['是一名飞行员', 'persona', 'I work as a pilot'])

  // The same conversation goes on knowing it.
  await say(scene, { learner: 'The new beans are quite good today.', partner: 'Right? They are a little fruity, which I like.' })
  assert.match(bodyOf('reply'), /this-conversation/)
  assert.match(bodyOf('reply'), /是一名飞行员/)

  // No other conversation is told, whether a plain chat or another scene.
  const chat = await start()
  await say(chat, { learner: 'It has been raining all week here.', partner: 'A whole week of rain would wear me down too.' })
  for (const call of calls) assert.doesNotMatch(call.body, /是一名飞行员/, call.stage)
  const other = await start({ ...cafe, title: '书店的角落', setting: '周末的小书店' })
  await say(other, { learner: 'This shelf looks new to me.', partner: 'It went up last week, mostly travel writing.' })
  for (const call of calls) assert.doesNotMatch(call.body, /是一名飞行员/, call.stage)

  const removed = await app.inject({ method: 'DELETE', url: `/api/conversations/${scene}` })
  assert.equal(removed.statusCode, 200, removed.body)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM conversation_memories WHERE conversation_id = ?').get(scene) as { count: number }).count, 0)
})

test('in a scene a statement about the real learner is offered and never stored, even when they ask', async () => {
  await configure()
  clear()
  const scene = await start(cafe)
  const reply = await say(scene, {
    learner: 'Please remember that I am allergic to peanuts.', partner: 'Good to know, I will keep the peanut cookies away from you.',
    facts: [{ ...peanuts, explicit: true }],
  })
  assert.equal(reply.meta.memoryCandidates.length, 1)
  const candidate = reply.meta.memoryCandidates[0]
  assert.deepEqual([candidate.frame, candidate.category, candidate.quote, candidate.savedMemoryId], ['scene', 'about', 'I am allergic to peanuts', undefined])
  assert.deepEqual(await get('/api/memories'), [])

  // A reading the model did not commit to is taken as the part being played.
  const unsure = await say(scene, {
    learner: 'I live near the harbour these days.', partner: 'The harbour is lovely early in the morning.',
    facts: [{ key: '住处', semanticSlot: 'profile.home', value: '住在港口附近', quote: 'I live near the harbour', memoryType: 'profile' }],
  })
  assert.deepEqual(unsure.meta.memoryCandidates, [])

  // "Only in this conversation" withdraws the offer and leaves the conversation knowing it.
  await post(`/api/conversations/${scene}/memory-candidates/dismiss`, { semanticSlot: candidate.semanticSlot })
  const opened = await get(`/api/conversations/${scene}?interfaceLocale=zh-CN`)
  assert.equal(opened.messages.some((message: { meta?: { memoryCandidates?: unknown[] } }) => message.meta?.memoryCandidates?.length), false)
  const kept = await get(`/api/conversations/${scene}/memories`)
  assert.deepEqual(kept.map((item: { value: string }) => item.value).sort(), ['住在港口附近', '对花生过敏'].sort())
  assert.deepEqual(await get('/api/memories'), [])

  // The learner can still ask for it to be kept for good from the conversation's own list.
  const allergy = kept.find((item: { value: string }) => item.value === '对花生过敏')
  const promoted = await post(`/api/conversations/${scene}/memories/${allergy.id}/promote`, { interfaceLocale: 'zh-CN' })
  assert.equal(promoted.category, 'about')
  const memories = await get('/api/memories')
  assert.equal(memories.length, 1)
  assert.deepEqual([memories[0].value, memories[0].sources[0].frame, memories[0].sources[0].sceneTitle, memories[0].sources[0].quote], ['对花生过敏', 'scene', '咖啡店的下午', 'I am allergic to peanuts'])
})

test('in a plain chat a lasting fact is offered, and asking to remember stores it at once', async () => {
  await configure()
  clear()
  const chat = await start()
  const offered = await say(chat, { learner: 'I am allergic to peanuts, by the way.', partner: 'Noted, that must make snacks tricky.', facts: [{ ...peanuts, about: undefined }] })
  assert.equal(offered.meta.memoryCandidates.length, 1)
  assert.deepEqual([offered.meta.memoryCandidates[0].frame, offered.meta.memoryCandidates[0].savedMemoryId], ['direct', undefined])
  assert.deepEqual(await get('/api/memories'), [])

  await remember({ ...offered.meta.memoryCandidates[0], sourceConversationId: chat })
  const confirmed = await get('/api/memories')
  assert.equal(confirmed.length, 1)
  assert.deepEqual([confirmed[0].category, confirmed[0].sources.length, confirmed[0].sources[0].frame, confirmed[0].sources[0].quote], ['about', 1, 'direct', 'I am allergic to peanuts'])

  const vegetarian: Fact = { key: '饮食', semanticSlot: 'constraint.diet', value: '吃素', quote: 'I am vegetarian', memoryType: 'constraint', about: 'user', durability: 'lasting', explicit: true }
  const stored = await say(chat, { learner: 'Please remember that I am vegetarian.', partner: 'Got it, vegetarian it is.', facts: [vegetarian] })
  assert.equal(stored.meta.memoryCandidates.length, 1)
  const savedId = stored.meta.memoryCandidates[0].savedMemoryId
  assert.ok(savedId)
  assert.equal((await get('/api/memories')).some((memory: { id: string; value: string }) => memory.id === savedId && memory.value === '吃素'), true)

  // The model saying so is not enough; the learner has to have asked in their own words.
  const nurse: Fact = { key: '职业', semanticSlot: 'profile.occupation', value: '是一名护士', quote: 'I am a nurse', memoryType: 'profile', about: 'user', durability: 'lasting', explicit: true }
  const claimed = await say(chat, { learner: 'I am a nurse at the city hospital.', partner: 'Hospital shifts sound exhausting.', facts: [nurse] })
  assert.equal(claimed.meta.memoryCandidates[0].savedMemoryId, undefined)
  assert.equal((await get('/api/memories')).some((memory: { value: string }) => memory.value === '是一名护士'), false)
})

test('something that holds for a while is a plan with an end, and is left out once it has run out', async () => {
  await configure()
  clear()
  const chat = await start()
  const trip: Fact = { key: '旅行', semanticSlot: 'plan.trip', value: '下个月去冲绳', quote: 'I am going to Okinawa next month', memoryType: 'preference', about: 'user', durability: 'temporary', validDays: 40 }
  const offered = await say(chat, { learner: 'I am going to Okinawa next month with friends.', partner: 'Okinawa with friends sounds like a proper break.', facts: [trip] })
  const candidate = offered.meta.memoryCandidates[0]
  assert.deepEqual([candidate.category, candidate.memoryType], ['plan', 'plan'])
  const days = (new Date(candidate.validTo).getTime() - Date.now()) / 86_400_000
  assert.ok(days > 39 && days <= 40, `valid for ${days} days`)

  const saved = await remember({ ...candidate, sourceConversationId: chat })
  let memory = (await get('/api/memories'))[0]
  assert.deepEqual([memory.category, memory.expired, memory.canBeCore], ['plan', false, false])
  const core = await app.inject({ method: 'PATCH', url: `/api/memories/${saved.id}/tier`, payload: { tier: 'core' } })
  assert.equal(core.statusCode, 409, core.body)

  await say(chat, { learner: 'We still need to book the flights.', partner: 'Flights get pricey fast, so sooner is better.' })
  assert.match(bodyOf('memory'), /下个月去冲绳/)

  // Another conversation knows it while it holds, and no longer once it has run out.
  const later = await start()
  await say(later, { learner: 'The weather has turned cold again.', partner: 'It really has, I dug my scarf out this morning.' })
  assert.match(bodyOf('memory'), /下个月去冲绳/)
  db.prepare('UPDATE memories SET valid_to = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', saved.id)
  await say(later, { learner: 'I might make soup tonight.', partner: 'Soup is the right call for a night like this.' })
  for (const call of calls) assert.doesNotMatch(call.body, /下个月去冲绳/, call.stage)
  memory = (await get('/api/memories'))[0]
  assert.equal(memory.expired, true)

  await post(`/api/memories/${saved.id}/renew`, { days: 14 })
  memory = (await get('/api/memories'))[0]
  assert.equal(memory.expired, false)
})

test('a scene is given hard constraints, how to speak to the learner, and learning memories, and nothing else about them', async () => {
  await configure()
  clear()
  await remember({ key: '职业', semanticSlot: 'profile.occupation', value: '是软件工程师', memoryType: 'profile' })
  await remember({ key: '音乐', semanticSlot: 'preference.music', value: '喜欢听爵士乐', memoryType: 'preference' })
  await remember({ key: '过敏', semanticSlot: 'constraint.allergy', value: '对花生过敏', memoryType: 'constraint' })
  await remember({ key: '纠错方式', semanticSlot: 'style.corrections', value: '说错了请直接指出', memoryType: 'style' })
  await remember({ key: '旅行', semanticSlot: 'plan.trip', value: '下个月去冲绳', memoryType: 'plan' })
  await remember({ key: '目标', semanticSlot: 'learning.goal', value: '在准备雅思口语', memoryType: 'learning', targetLanguageCode: 'en' })
  const outside = ['是软件工程师', '喜欢听爵士乐', '下个月去冲绳']
  const inside = ['对花生过敏', '说错了请直接指出', '在准备雅思口语']

  const scene = await start(cafe)
  await say(scene, { learner: 'The new beans are quite good today.', partner: 'They are, a bit brighter than the last batch.' })
  for (const value of inside) assert.match(bodyOf('memory'), new RegExp(value))
  for (const call of calls) for (const value of outside) assert.doesNotMatch(call.body, new RegExp(value), call.stage)

  const chat = await start()
  await say(chat, { learner: 'It has been raining all week here.', partner: 'A week of rain makes everything feel slower.' })
  for (const value of [...inside, ...outside]) assert.match(bodyOf('memory'), new RegExp(value))

  // A learning memory belongs to the language it was learned for.
  await configure({ language: ['Japanese', 'ja'] })
  const japanese = await start()
  await say(japanese, { learner: '今週はずっと雨が降っています。', partner: '一週間も雨だと、気分も少し重くなりますね。' })
  assert.doesNotMatch(bodyOf('memory'), /在准备雅思口语/)
  assert.match(bodyOf('memory'), /对花生过敏/)
})

test('mistakes made more than once become the focus of correction and can be forgotten', async () => {
  await configure()
  clear()
  const chat = await start()
  const focus = /recently been corrected more than once/
  await say(chat, { learner: 'Yesterday I go to the market early.', partner: 'Early markets have the best bread.', corrections: [{ original: 'I go', improved: 'I went', category: 'tense' }] })
  assert.doesNotMatch(bodyOf('analysis'), focus)
  await say(chat, { learner: 'Last week I eat there with my sister.', partner: 'Eating out with a sister is always fun.', corrections: [{ original: 'I eat', improved: 'I ate', category: 'tense' }] })
  assert.doesNotMatch(bodyOf('analysis'), focus)

  await say(chat, { learner: 'We talked for hours about work.', partner: 'Hours of talking usually means it was a good day.' })
  assert.match(bodyOf('analysis'), focus)
  assert.match(bodyOf('analysis'), /tense/)

  const status = await get('/api/learning-status')
  const english = status.languages.find((language: { code: string }) => language.code === 'en')
  assert.deepEqual(english.errors.map((item: { category: string; count: number }) => [item.category, item.count]), [['tense', 2]])
  assert.equal(english.errors[0].examples[0].improved, 'I ate')
  // The learning record is never offered for confirmation and is not a long-term memory.
  assert.deepEqual(await get('/api/memories'), [])

  const forgotten = await app.inject({ method: 'DELETE', url: '/api/learning-status/en/errors/tense' })
  assert.equal(forgotten.statusCode, 200, forgotten.body)
  await say(chat, { learner: 'Today I stayed home and read.', partner: 'A quiet day with a book sounds perfect.' })
  assert.doesNotMatch(bodyOf('analysis'), focus)
})

test('a reply shows which memories it was written with, as they are now', async () => {
  await configure()
  clear()
  const saved = await remember({ key: '饮食', semanticSlot: 'constraint.diet', value: '吃素', memoryType: 'constraint' })
  const chat = await start()
  const reply = await say(chat, { learner: 'Any idea what I should cook tonight?', partner: 'A mushroom risotto would be easy and filling.', relevantMemoryKeys: ['饮食'] })
  assert.deepEqual(reply.meta.usedMemories, [{ id: saved.id, value: '吃素', layer: 'about' }])

  const edited = await app.inject({ method: 'PUT', url: `/api/memories/${saved.id}`, payload: { value: '吃素，也不吃蛋', interfaceLocale: 'zh-CN' } })
  assert.equal(edited.statusCode, 200, edited.body)
  const used = async () => (await get(`/api/conversations/${chat}?interfaceLocale=zh-CN`)).messages
    .find((message: { id: string }) => message.id === reply.id).meta.usedMemories
  assert.deepEqual(await used(), [{ id: saved.id, value: '吃素，也不吃蛋', layer: 'about' }])

  const removed = await app.inject({ method: 'DELETE', url: `/api/memories/${saved.id}` })
  assert.equal(removed.statusCode, 200, removed.body)
  assert.deepEqual(await used(), [])
})

test('tidying up after a conversation is off until switched on, and then only proposes', async () => {
  await configure()
  clear()
  const scene = await start(cafe)
  await say(scene, { learner: 'I am allergic to peanuts, so no cookies for me.', partner: 'More cookies for me then, sorry about that.', facts: [{ ...peanuts, about: 'persona' }] })
  const said = (await get(`/api/conversations/${scene}/memories`))[0]

  calls = []
  assert.deepEqual(await post(`/api/conversations/${scene}/consolidate`), { ran: false, reason: 'off' })
  assert.equal(calls.length, 0)

  await configure({ consolidate: true })
  answer = (call) => call.stage === 'consolidation'
    ? JSON.stringify({
        promotions: [
          { conversationMemoryId: said.id, value: '对花生过敏', memoryType: 'constraint', durability: 'lasting', validDays: 0, note: '在别的对话里也这样说过' },
          { conversationMemoryId: 'made-up', value: '编出来的', memoryType: 'profile', durability: 'lasting', validDays: 0, note: '' },
        ],
        conflicts: [], stale: [],
      })
    : '{}'
  assert.deepEqual(await post(`/api/conversations/${scene}/consolidate`), { ran: true, suggestions: 1 })
  assert.equal(calls.filter((call) => call.stage === 'consolidation').length, 1)
  assert.deepEqual(await get('/api/memories'), [])

  // Nothing new was said since, so it is not weighed again.
  calls = []
  assert.deepEqual(await post(`/api/conversations/${scene}/consolidate`), { ran: false, reason: 'unchanged' })
  assert.equal(calls.length, 0)

  const suggestions = await get('/api/memory-suggestions')
  assert.equal(suggestions.length, 1)
  assert.deepEqual([suggestions[0].kind, suggestions[0].value, suggestions[0].frame, suggestions[0].conversationTitle], ['promote', '对花生过敏', 'scene', '咖啡店的下午'])
  await post(`/api/memory-suggestions/${suggestions[0].id}/resolve`, { action: 'accept' })
  const memories = await get('/api/memories')
  assert.deepEqual(memories.map((memory: { value: string; category: string }) => [memory.value, memory.category]), [['对花生过敏', 'about']])
  assert.deepEqual(await get('/api/memory-suggestions'), [])

  // A conversation that kept nothing costs no model call.
  const quiet = await start(cafe)
  await say(quiet, { learner: 'The new beans are quite good today.', partner: 'Glad you like them, I was not sure at first.' })
  calls = []
  assert.deepEqual(await post(`/api/conversations/${quiet}/consolidate`), { ran: false, reason: 'nothing' })
  assert.equal(calls.length, 0)
})

test('the tidy-up switch is saved with the settings and is off when never set', async () => {
  await configure()
  const before = await get('/api/settings')
  assert.equal(Boolean(before.memory?.consolidate), false)
  const saved = await app.inject({ method: 'PUT', url: '/api/settings', payload: { ...before, memory: { consolidate: true } } })
  assert.equal(saved.statusCode, 200, saved.body)
  assert.equal((await get('/api/settings')).memory.consolidate, true)
  // A page that does not send the field leaves the choice as it was.
  const { memory: _memory, ...withoutMemory } = before
  const again = await app.inject({ method: 'PUT', url: '/api/settings', payload: withoutMemory })
  assert.equal(again.statusCode, 200, again.body)
  assert.equal((await get('/api/settings')).memory.consolidate, true)
})

test('memories that came out of scenes before conversations had their own memory are listed once for review', async () => {
  await configure()
  clear()
  const scene = await start(cafe)
  const chat = await start()
  const insert = db.prepare(`INSERT INTO memories (id, category, key, value, status, memory_type, source_conversation_id, created_at, updated_at)
    VALUES (?, 'about', ?, ?, 'confirmed', 'preference', ?, ?, ?)`)
  insert.run('from-scene', '想看的', '想看鲸鲨', scene, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')
  insert.run('from-chat', '音乐', '喜欢听爵士乐', chat, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')
  db.exec("DELETE FROM app_flags WHERE key = 'memory_scope_review'")
  reviewMemoriesFromScenes()

  const suggestions = await get('/api/memory-suggestions')
  assert.deepEqual(suggestions.map((item: { kind: string; memoryId: string; frame: string }) => [item.kind, item.memoryId, item.frame]), [['review', 'from-scene', 'scene']])
  // Nothing was changed on the learner's behalf.
  assert.deepEqual((await get('/api/memories')).map((memory: { value: string }) => memory.value).sort(), ['喜欢听爵士乐', '想看鲸鲨'].sort())

  // Sent back to where it was said: no longer a long-term memory, still known to that conversation.
  await post(`/api/memory-suggestions/${suggestions[0].id}/resolve`, { action: 'toConversation' })
  assert.deepEqual((await get('/api/memories')).map((memory: { value: string }) => memory.value), ['喜欢听爵士乐'])
  assert.deepEqual((await get(`/api/conversations/${scene}/memories`)).map((item: { value: string }) => item.value), ['想看鲸鲨'])

  // Running it again raises nothing.
  reviewMemoriesFromScenes()
  assert.deepEqual(await get('/api/memory-suggestions'), [])
})

test('scene suggestions are steered by plans, goals and weak spots, and never by sensitive memories', async () => {
  await configure()
  clear()
  await remember({ key: '旅行', semanticSlot: 'plan.trip', value: '下个月去冲绳', memoryType: 'plan' })
  await remember({ key: '目标', semanticSlot: 'learning.goal', value: '在准备雅思口语', memoryType: 'learning', targetLanguageCode: 'en' })
  await remember({ key: '就医', semanticSlot: 'plan.clinic', value: '下周要去复诊', memoryType: 'plan', sensitive: true })
  await remember({ key: '音乐', semanticSlot: 'preference.music', value: '喜欢听爵士乐', memoryType: 'preference' })
  calls = []
  answer = () => JSON.stringify({ setups: [{ ...cafe, title: '潜水店的柜台' }] })
  const response = await app.inject({ method: 'POST', url: '/api/conversation-setups/suggest', payload: { domain: '', place: '', detail: '', interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  const body = bodyOf('setups')
  assert.match(body, /下个月去冲绳/)
  assert.match(body, /在准备雅思口语/)
  assert.doesNotMatch(body, /下周要去复诊/)
  assert.doesNotMatch(body, /喜欢听爵士乐/)
  assert.match(body, /The partner is a stranger to these facts/)
})
