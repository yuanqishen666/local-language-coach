import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-recap-api-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'

type Stage = 'memory' | 'analysis' | 'reply' | 'repair' | 'recap' | 'practice' | 'grade' | 'localize'
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
    : body.includes('Write the recap of one practice conversation') ? 'recap'
    : body.includes('Write short gap-fill exercises for a language learner') ? 'practice'
    : body.includes('Mark one answer to a short language exercise') ? 'grade'
    : body.includes('Translate each supplied interface-text value') ? 'localize'
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
const { learningFocus } = await import('./services/memory-store.js')
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

type Correction = { original: string; improved: string; explanation: string; severity: string; category: string }

const plainReply = 'Nice! Fresh bread is the best. Which market do you go to?'
const turns: Array<{ line: string; corrections: Correction[] }> = [
  {
    line: 'Yesterday I go to the market and buy two breads for my family.',
    corrections: [
      { original: 'I go to the market', improved: 'I went to the market', explanation: '讲昨天的事要用过去式。', severity: 'meaning', category: 'tense' },
      { original: 'two breads', improved: 'two loaves of bread', explanation: 'bread 不可数，论条时用 loaf。', severity: 'naturalness', category: 'word_form' },
    ],
  },
  {
    line: 'My mother say the bread is very good and she is happy.',
    corrections: [{ original: 'My mother say', improved: 'My mother says', explanation: '第三人称单数要加 s。', severity: 'minor', category: 'agreement' }],
  },
  {
    line: 'Last week I buy apples there too, they were cheap.',
    corrections: [{ original: 'I buy apples', improved: 'I bought apples', explanation: '上周的事用过去式。', severity: 'meaning', category: 'tense' }],
  },
]

const recapParts = {
  good: { quote: 'for my family', comment: '“for my family”用得很自然，介词选对了。' },
  pattern: { category: 'tense', comment: '讲过去的事时动词没有变成过去式：go 要说成 went，buy 要说成 bought。' },
  takeaway: { original: 'two breads', improved: 'two loaves of bread', meaning: '两条面包', comment: '面包不可数，按条数时用 loaf。' },
  expression: { level: 'A2', part: 'high', reason: '你能用简单句把日常经过讲清楚，但动词时态还不稳定。' },
}

const spanish: Record<string, string> = {
  goodComment: '«for my family» suena natural y la preposición es la correcta.',
  patternComment: 'Al hablar del pasado el verbo no cambia de forma: go debe ser went y buy debe ser bought.',
  takeawayMeaning: 'dos barras de pan',
  takeawayComment: 'El pan no se cuenta; para contar barras se usa loaf.',
  expressionReason: 'Puedes contar lo cotidiano con frases sencillas, pero los tiempos verbales todavía fallan.',
}

const gapItems = [
  { category: 'tense', sentence: 'Last night we ___ a film at home.', options: ['watch', 'watched', 'watching', 'watches'], answer: 1, explanation: '昨晚的事要用过去式 watched。' },
  { category: 'word_form', sentence: 'Could you buy two ___ of bread?', options: ['loafs', 'loaves', 'breads', 'loaf'], answer: 1, explanation: 'loaf 的复数是 loaves。' },
]

function stages(overrides: Partial<Record<Stage, (call: ModelCall) => string>> = {}) {
  return (call: ModelCall) => {
    if (overrides[call.stage]) return overrides[call.stage]!(call)
    if (call.stage === 'memory') return memoryAnswer()
    if (call.stage === 'analysis') return JSON.stringify({ languageMatch: 'target', lookup, reconstruction: null, corrections: [] })
    if (call.stage === 'reply') {
      return JSON.stringify({ roleReply: plainReply, reconstruction: null, corrections: [], lookup, statePatch: { currentTopic: 'market', openedLoops: [], resolvedLoops: [], sceneFacts: [], userFacts: [] } })
    }
    if (call.stage === 'recap') return JSON.stringify(recapParts)
    if (call.stage === 'practice') return JSON.stringify({ items: gapItems })
    if (call.stage === 'grade') return JSON.stringify({ right: true, improved: 'I bought some apples', comment: '时态改对了。' })
    if (call.stage === 'localize') return JSON.stringify({ items: Object.entries(spanish).map(([id, value]) => ({ id, value })) })
    return '{}'
  }
}

async function startConversation() {
  const response = await app.inject({ method: 'POST', url: '/api/conversations', payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  return response.json().id as string
}

let sent = 0
async function send(conversationId: string, content: string, corrections: Correction[] = []) {
  sent += 1
  const before = answer
  answer = stages({ analysis: () => JSON.stringify({ languageMatch: 'target', lookup, reconstruction: null, corrections }) })
  const response = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { content, clientMessageId: `turn-${sent}`, interfaceLocale: 'zh-CN' },
  })
  answer = before
  assert.equal(response.statusCode, 200, response.body)
  return response.json()
}

/** A conversation of three answers with their corrections, and no model call counted yet. */
async function talked(provider: ProviderId = 'openai', count = turns.length) {
  reset()
  await useProvider(provider, { proficiency: 'B1' })
  const conversationId = await startConversation()
  for (const turn of turns.slice(0, count)) await send(conversationId, turn.line, turn.corrections)
  answer = stages()
  calls = []
  return conversationId
}

function stage(name: Stage) {
  return calls.filter((call) => call.stage === name)
}

function writeRecap(conversationId: string, interfaceLocale = 'zh-CN') {
  return app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/recap`, payload: { interfaceLocale } })
}

function readRecap(conversationId: string, interfaceLocale = 'zh-CN') {
  return app.inject({ method: 'GET', url: `/api/conversations/${conversationId}/recap?interfaceLocale=${interfaceLocale}` })
}

function startPractice(conversationId: string, interfaceLocale = 'zh-CN') {
  return app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/practice`, payload: { interfaceLocale } })
}

function answerItem(practiceId: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/api/practice/${practiceId}/answer`, payload })
}

async function errorsOf(category: string) {
  const response = await app.inject({ method: 'GET', url: '/api/learning-status' })
  assert.equal(response.statusCode, 200, response.body)
  const language = response.json().languages.find((item: { code: string }) => item.code === 'en')
  return language?.errors.find((item: { category: string }) => item.category === category) as Record<string, any> | undefined
}

function reset() {
  db.exec(`DELETE FROM proficiency_profiles; DELETE FROM proficiency_history; DELETE FROM conversation_assessments; DELETE FROM turn_signals;
    DELETE FROM practice_sets; DELETE FROM conversation_recaps; DELETE FROM learning_events; DELETE FROM word_entries;
    DELETE FROM messages; DELETE FROM conversations; DELETE FROM app_flags WHERE key = 'proficiency_seeded';`)
}

test.after(async () => {
  await app.close()
  db.close()
  await rm(dataDir, { recursive: true, force: true })
})

for (const provider of providerIds) {
  test(`${provider}: the recap is written once, from the learner's own lines and corrections`, async () => {
    const conversationId = await talked(provider)
    const response = await writeRecap(conversationId)
    assert.equal(response.statusCode, 200, response.body)
    const { recap } = response.json()
    assert.deepEqual(recap.good, recapParts.good)
    assert.equal(recap.pattern.category, 'tense')
    assert.equal(recap.pattern.comment, recapParts.pattern.comment)
    assert.deepEqual(recap.pattern.examples, [
      { original: 'I buy apples', improved: 'I bought apples' },
      { original: 'I go to the market', improved: 'I went to the market' },
    ])
    assert.equal(recap.pattern.noted, false)
    assert.deepEqual(recap.takeaway, { ...recapParts.takeaway, wordId: null })
    assert.deepEqual(recap.expression, { step: stepOf('A2', 'high'), reason: recapParts.expression.reason })
    assert.equal(recap.session.turns, 3)
    assert.equal(recap.practice, true)
    assert.equal(recap.stale, false)
    // One request, carrying the lines, the corrections and nothing of the partner's to judge.
    assert.equal(stage('recap').length, 1)
    const body = stage('recap')[0].body
    assert.ok(body.includes('buy two breads for my family'))
    assert.ok(body.includes('I went to the market'))
    assert.ok(body.includes('Chinese'))
    // The level read from the lines is kept with the conversation's assessment.
    const assessed = db.prepare('SELECT expression_step FROM conversation_assessments WHERE conversation_id = ?').get(conversationId) as { expression_step: number }
    assert.equal(assessed.expression_step, stepOf('A2', 'high'))
    // Asked for again with nothing said since: the same recap, and no second request.
    const again = await writeRecap(conversationId)
    assert.deepEqual(again.json().recap.good, recapParts.good)
    assert.equal(stage('recap').length, 1)
    const read = await readRecap(conversationId)
    assert.equal(read.json().available, true)
    assert.deepEqual(read.json().recap.takeaway, { ...recapParts.takeaway, wordId: null })
  })

  test(`${provider}: three questions on the learner's mistakes, marked and written back`, async () => {
    const conversationId = await talked(provider)
    const response = await startPractice(conversationId)
    assert.equal(response.statusCode, 200, response.body)
    const { practice } = response.json()
    assert.deepEqual(practice.items.map((item: { kind: string }) => item.kind), ['gap', 'gap', 'rewrite'])
    assert.deepEqual(practice.items[0].options, gapItems[0].options)
    assert.deepEqual({ sentence: practice.items[2].sentence, task: practice.items[2].task, category: practice.items[2].category }, { sentence: 'I buy apples', task: 'fix', category: 'tense' })
    // Nothing that gives the answers away is sent with the questions.
    assert.ok(!response.body.includes('watched。') && !response.body.includes('I bought apples') && !('answer' in practice.items[0]) && !('model' in practice.items[2]))
    assert.equal(stage('practice').length, 1)
    assert.ok(stage('practice')[0].body.includes('I went to the market'))
    calls = []
    // A choice is checked without the model.
    const right = (await answerItem(practice.id, { itemId: practice.items[0].id, choice: 1 })).json()
    assert.deepEqual(right.result, { right: true, given: 'watched', answer: 'Last night we watched a film at home.', explanation: gapItems[0].explanation })
    const wrong = (await answerItem(practice.id, { itemId: practice.items[1].id, choice: 0 })).json()
    assert.equal(wrong.result.right, false)
    assert.equal(wrong.result.answer, 'Could you buy two loaves of bread?')
    assert.equal(calls.length, 0)
    // A sentence put right in the learner's own words is marked by the model.
    const open = await answerItem(practice.id, { itemId: practice.items[2].id, text: 'I bought some apples' })
    assert.equal(open.statusCode, 200, open.body)
    assert.deepEqual(open.json().result, { right: true, given: 'I bought some apples', answer: 'I bought some apples', explanation: '时态改对了。' })
    assert.equal(stage('grade').length, 1)
    assert.equal(open.json().practice.done, true)
    assert.equal(open.json().practice.right, 2)
    // Each answer is in the learning record under the kind of mistake it practised.
    assert.deepEqual((await errorsOf('tense'))?.practice, { right: 2, wrong: 0 })
    assert.deepEqual((await errorsOf('word_form'))?.practice, { right: 0, wrong: 1 })
  })
}

test('a conversation of fewer than three answers has no recap', async () => {
  const conversationId = await talked('openai', 2)
  const response = await writeRecap(conversationId)
  assert.equal(response.statusCode, 409, response.body)
  assert.equal(response.json().code, 'RECAP_TOO_SHORT')
  assert.deepEqual((await readRecap(conversationId)).json(), { available: false, recap: null })
  assert.equal(calls.length, 0)
  assert.equal((await writeRecap('none')).statusCode, 404)
})

test('a part the model got wrong is left out, and the rest is shown', async () => {
  const conversationId = await talked()
  answer = stages({
    recap: () => JSON.stringify({
      // Not something the learner wrote.
      good: { quote: 'I visited the bakery', comment: '用词准确。' },
      // Not a kind of mistake that was corrected here.
      pattern: { category: 'article', comment: '冠词用错了。' },
      takeaway: recapParts.takeaway,
      // A reason in the wrong language is not shown; the level still counts.
      expression: { level: 'B1', part: 'low', reason: 'You can tell a simple story but verb tenses are still unstable.' },
    }),
  })
  const response = await writeRecap(conversationId)
  assert.equal(response.statusCode, 200, response.body)
  const { recap } = response.json()
  assert.equal(recap.good, null)
  // The kind made most often here stands in, with the learner's own examples and no comment.
  assert.equal(recap.pattern.category, 'tense')
  assert.equal(recap.pattern.comment, '')
  assert.equal(recap.pattern.examples.length, 2)
  assert.deepEqual(recap.takeaway, { ...recapParts.takeaway, wordId: null })
  assert.deepEqual(recap.expression, { step: stepOf('B1', 'low'), reason: '' })
  // It was asked for twice before the incomplete answer was taken.
  assert.equal(stage('recap').length, 2)
})

test('a recap with no level and nothing to show is an error, and nothing is kept', async () => {
  const conversationId = await talked()
  answer = stages({ recap: () => JSON.stringify({ good: { quote: '', comment: '' }, pattern: { category: '', comment: '' }, takeaway: { original: '', improved: '', meaning: '', comment: '' }, expression: { level: '', part: '', reason: '' } }) })
  const response = await writeRecap(conversationId)
  assert.equal(response.statusCode, 502, response.body)
  assert.equal((await readRecap(conversationId)).json().recap, null)
  // It can be asked for again.
  answer = stages()
  assert.equal((await writeRecap(conversationId)).statusCode, 200)
})

test('a short text cannot be placed high, whatever the model says', async () => {
  const conversationId = await talked()
  answer = stages({ recap: () => JSON.stringify({ ...recapParts, expression: { level: 'C2', part: 'high', reason: recapParts.expression.reason } }) })
  const { recap } = (await writeRecap(conversationId)).json()
  // About thirty words in all: no higher than upper B2.
  assert.equal(recap.expression.step, stepOf('B2', 'high'))
})

test('the recap is written again once the conversation has gone on', async () => {
  const conversationId = await talked()
  assert.equal((await writeRecap(conversationId)).statusCode, 200)
  await send(conversationId, 'Tomorrow I will go there again with my sister.')
  answer = stages({ recap: () => JSON.stringify({ ...recapParts, good: { quote: 'with my sister', comment: '“with my sister”说得很自然。' } }) })
  calls = []
  assert.equal((await readRecap(conversationId)).json().recap.stale, true)
  const { recap } = (await writeRecap(conversationId)).json()
  assert.equal(recap.good.quote, 'with my sister')
  assert.equal(recap.stale, false)
  assert.equal(stage('recap').length, 1)
})

test('the expression goes into the wordbook only when the learner keeps it', async () => {
  const conversationId = await talked()
  await writeRecap(conversationId)
  assert.equal((db.prepare('SELECT COUNT(*) AS total FROM word_entries').get() as { total: number }).total, 0)
  const kept = await app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/recap/takeaway`, payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(kept.statusCode, 200, kept.body)
  const word = db.prepare('SELECT * FROM word_entries WHERE id = ?').get(kept.json().wordId) as Record<string, any>
  assert.deepEqual(
    { term: word.term, meaning: word.meaning, language: word.language, locale: word.interface_locale, source: word.source_sentence, conversation: word.conversation_id },
    { term: 'two loaves of bread', meaning: '两条面包', language: 'en', locale: 'zh-CN', source: 'two breads', conversation: conversationId },
  )
  assert.equal(JSON.parse(word.details_json).note, recapParts.takeaway.comment)
  assert.equal((await readRecap(conversationId)).json().recap.takeaway.wordId, word.id)
  // Kept once, however often it is pressed.
  const again = await app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/recap/takeaway`, payload: {} })
  assert.equal(again.json().wordId, word.id)
  assert.equal((db.prepare('SELECT COUNT(*) AS total FROM word_entries').get() as { total: number }).total, 1)
  // Removed from the wordbook, it can be kept again.
  db.prepare('DELETE FROM word_entries WHERE id = ?').run(word.id)
  assert.equal((await readRecap(conversationId)).json().recap.takeaway.wordId, null)
  const other = await talked()
  assert.equal((await app.inject({ method: 'POST', url: `/api/conversations/${other}/recap/takeaway`, payload: {} })).statusCode, 404)
})

test('a kind of mistake is marked in the learning record only when the learner asks', async () => {
  const conversationId = await talked()
  answer = stages({ recap: () => JSON.stringify({ ...recapParts, pattern: { category: 'agreement', comment: '主语是第三人称单数时，动词要加 s。' } }) })
  const { recap } = (await writeRecap(conversationId)).json()
  assert.equal(recap.pattern.category, 'agreement')
  assert.equal((await errorsOf('agreement'))?.noted, false)
  // Made once: not yet something the partner is told to watch for.
  assert.ok(!learningFocus('en', 'en').some((item) => item.category === 'agreement'))
  const noted = await app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/recap/pattern`, payload: {} })
  assert.equal(noted.statusCode, 200, noted.body)
  assert.equal((await errorsOf('agreement'))?.noted, true)
  assert.equal((await readRecap(conversationId)).json().recap.pattern.noted, true)
  assert.ok(learningFocus('en', 'en').some((item) => item.category === 'agreement'))
  // Marked once for each kind.
  await app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/recap/pattern`, payload: {} })
  assert.equal((db.prepare("SELECT COUNT(*) AS total FROM learning_events WHERE kind = 'focus'").get() as { total: number }).total, 1)
  // Forgetting the kind of mistake takes the mark with it.
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/learning-status/en/errors/agreement' })).statusCode, 200)
  assert.equal((db.prepare("SELECT COUNT(*) AS total FROM learning_events WHERE kind = 'focus'").get() as { total: number }).total, 0)
})

test('the recap is shown in the interface language asked for, translated once', async () => {
  const conversationId = await talked()
  await writeRecap(conversationId)
  calls = []
  const response = await readRecap(conversationId, 'es-419')
  assert.equal(response.statusCode, 200, response.body)
  const { recap } = response.json()
  assert.equal(recap.good.comment, spanish.goodComment)
  assert.equal(recap.pattern.comment, spanish.patternComment)
  assert.equal(recap.takeaway.meaning, spanish.takeawayMeaning)
  assert.equal(recap.takeaway.comment, spanish.takeawayComment)
  assert.equal(recap.expression.reason, spanish.expressionReason)
  // What is in the language being learned is left as it is.
  assert.equal(recap.good.quote, 'for my family')
  assert.equal(recap.takeaway.improved, 'two loaves of bread')
  assert.equal(stage('localize').length, 1)
  await readRecap(conversationId, 'es-419')
  assert.equal(stage('localize').length, 1)
  // The first wording is still there for the language it was written in.
  assert.equal((await readRecap(conversationId)).json().recap.good.comment, recapParts.good.comment)
  // The word is kept with the wording of the language it is saved in.
  const kept = await app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/recap/takeaway`, payload: { interfaceLocale: 'es-419' } })
  const word = db.prepare('SELECT meaning, interface_locale FROM word_entries WHERE id = ?').get(kept.json().wordId) as Record<string, any>
  assert.deepEqual({ ...word }, { meaning: spanish.takeawayMeaning, interface_locale: 'es-419' })
})

test('a recap that cannot be translated is shown as it was written', async () => {
  const conversationId = await talked()
  await writeRecap(conversationId)
  answer = stages({ localize: () => '{}' })
  const response = await readRecap(conversationId, 'es-419')
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.json().recap.good.comment, recapParts.good.comment)
})

test('practising a kind of mistake right makes it weigh less', async () => {
  const conversationId = await talked()
  // Made twice here: something the partner is told to watch for.
  assert.ok(learningFocus('en', 'en').some((item) => item.category === 'tense'))
  const { practice } = (await startPractice(conversationId)).json()
  await answerItem(practice.id, { itemId: practice.items[0].id, choice: 1 })
  assert.ok(learningFocus('en', 'en').some((item) => item.category === 'tense'))
  // The sentence written exactly as it should be needs no marking.
  calls = []
  const exact = (await answerItem(practice.id, { itemId: practice.items[2].id, text: 'i bought apples.' })).json()
  assert.equal(exact.result.right, true)
  assert.equal(calls.length, 0)
  assert.ok(!learningFocus('en', 'en').some((item) => item.category === 'tense'))
  // A wrong answer puts the weight back.
  db.prepare("UPDATE learning_events SET severity = 'wrong' WHERE kind = 'practice'").run()
  assert.ok(learningFocus('en', 'en').some((item) => item.category === 'tense'))
})

test('answers that are plainly wrong are marked without the model, and an answer stands once given', async () => {
  const conversationId = await talked()
  const { practice } = (await startPractice(conversationId)).json()
  calls = []
  const rewrite = practice.items[2]
  assert.equal((await answerItem(practice.id, { itemId: rewrite.id, text: '   ' })).statusCode, 400)
  assert.equal((await answerItem(practice.id, { itemId: practice.items[0].id, choice: 9 })).statusCode, 400)
  assert.equal((await answerItem(practice.id, { itemId: 'none', choice: 0 })).statusCode, 400)
  assert.equal((await answerItem('none', { itemId: rewrite.id, text: 'x' })).statusCode, 404)
  const copied = (await answerItem(practice.id, { itemId: rewrite.id, text: 'I buy apples' })).json()
  assert.deepEqual(copied.result, { right: false, given: 'I buy apples', answer: 'I bought apples', explanation: '' })
  assert.equal(calls.length, 0)
  // A second answer to the same question changes nothing.
  const second = (await answerItem(practice.id, { itemId: rewrite.id, text: 'I bought apples' })).json()
  assert.equal(second.result.right, false)
  assert.equal((db.prepare("SELECT COUNT(*) AS total FROM learning_events WHERE kind = 'practice'").get() as { total: number }).total, 1)
  // Unfinished, it is picked up again rather than written anew.
  const resumed = (await startPractice(conversationId)).json().practice
  assert.equal(resumed.id, practice.id)
  assert.equal(resumed.items[2].result.right, false)
  assert.equal(stage('practice').length, 0)
  assert.equal((await app.inject({ method: 'GET', url: `/api/practice/${practice.id}` })).json().practice.id, practice.id)
})

test('a marking with no verdict is an error and leaves the question open', async () => {
  const conversationId = await talked()
  const { practice } = (await startPractice(conversationId)).json()
  answer = stages({ grade: () => JSON.stringify({ improved: 'I bought some apples', comment: '时态改对了。' }) })
  const failed = await answerItem(practice.id, { itemId: practice.items[2].id, text: 'I bought some apples' })
  assert.equal(failed.statusCode, 502, failed.body)
  assert.equal((await app.inject({ method: 'GET', url: `/api/practice/${practice.id}` })).json().practice.items[2].result, null)
  // Marked wrong by the model: the model answer is shown.
  answer = stages({ grade: () => JSON.stringify({ right: false, improved: 'I bought the apples', comment: '动词还是现在时。' }) })
  const marked = (await answerItem(practice.id, { itemId: practice.items[2].id, text: 'I buys some apples' })).json()
  assert.deepEqual(marked.result, { right: false, given: 'I buys some apples', answer: 'I bought apples', explanation: '动词还是现在时。' })
})

test('questions the model got wrong are dropped, and with none left there is no practice', async () => {
  const conversationId = await talked()
  const twoRight = { ...gapItems[0], options: ['watched', 'watched', 'watching', 'watches'] }
  const noGap = { ...gapItems[1], sentence: 'Could you buy two loaves of bread?' }
  answer = stages({ practice: () => JSON.stringify({ items: [twoRight, noGap, gapItems[1]] }) })
  const { practice } = (await startPractice(conversationId)).json()
  assert.deepEqual(practice.items.map((item: { kind: string; sentence: string }) => item.sentence), ['Could you buy two ___ of bread?', 'I buy apples'])
  db.exec('DELETE FROM practice_sets')
  answer = stages({ practice: () => JSON.stringify({ items: [twoRight, noGap] }) })
  assert.equal((await startPractice(conversationId)).statusCode, 502)
  assert.equal((db.prepare('SELECT COUNT(*) AS total FROM practice_sets').get() as { total: number }).total, 0)
})

test('with no mistakes there is nothing to practise', async () => {
  reset()
  await useProvider('openai', { proficiency: 'B1' })
  const conversationId = await startConversation()
  for (const turn of turns) await send(conversationId, turn.line)
  answer = stages({ recap: () => JSON.stringify({ ...recapParts, pattern: { category: '', comment: '' } }) })
  calls = []
  const { recap } = (await writeRecap(conversationId)).json()
  assert.equal(recap.pattern, null)
  assert.equal(recap.practice, false)
  const response = await startPractice(conversationId)
  assert.equal(response.statusCode, 409, response.body)
  assert.equal(response.json().code, 'PRACTICE_NOTHING')
  assert.equal(stage('practice').length, 0)
})
