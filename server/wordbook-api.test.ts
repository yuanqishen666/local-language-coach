import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-wordbook-api-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'

type Stage = 'memory' | 'analysis' | 'reply' | 'repair' | 'recap' | 'story' | 'import' | 'setups' | 'localize'
interface ModelCall { stage: Stage; host: string; body: string }

const PAGE_HOST = '93.184.216.34'
let answer: (call: ModelCall) => string = () => '{}'
let calls: ModelCall[] = []
let page: { status: number; type: string; body: string } = { status: 200, type: 'text/html', body: '' }
let pageReads = 0

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  if (url.hostname === PAGE_HOST) {
    pageReads += 1
    return new Response(page.body, { status: page.status, headers: { 'content-type': page.type } })
  }
  const body = String(init.body || '')
  const stage: Stage = body.includes('Analyze durable user memory') ? 'memory'
    : body.includes('Analyze the latest learner turn before a conversation partner replies') ? 'analysis'
    : body.includes('Rewrite one conversation turn so it sounds like a real person') ? 'repair'
    : body.includes('Write the recap of one practice conversation') ? 'recap'
    : body.includes('Write a very short story for a language learner out of words they saved') ? 'story'
    : body.includes('Retell a piece of material for a language learner') ? 'import'
    : body.includes('for an open-ended adult conversation in') ? 'setups'
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
const { STRUCTURED_CONTRACT_VERSION } = await import('./ai/provider.js')
const { cleanPasted } = await import('./wordbook-routes.js')
const { cardOf } = await import('./word-store.js')
const { RANDOM_SCENES, randomScene } = await import('./random-scene.js')

const models = { openai: 'gpt-4.1', anthropic: 'claude-sonnet-5-5', gemini: 'gemini-3-pro', deepseek: 'deepseek-chat', kimi: 'kimi-k3' } as const
type ProviderId = keyof typeof models

async function useProvider(id: ProviderId = 'openai', learning: Partial<(typeof defaultConfig)['learning']> = {}) {
  const config = structuredClone(defaultConfig)
  config.setupComplete = true
  config.llm.defaultProvider = id
  config.learning = { ...config.learning, proficiency: 'B1', ...learning }
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

const lookup = { action: 'reply', parts: [{ text: 'a walk in the rain', needsLookup: false, reason: 'stable', subject: 'walk' }], query: '', locator: null }

function memoryAnswer() {
  return JSON.stringify({
    disposition: 'ignore', userFacts: [], replyType: 'casual', relevantTopics: [], relevantMemoryKeys: [],
    dialoguePlan: {
      mode: 'casual', anchorQuote: 'the park', anchorMeaning: 'The learner went to the park.', move: 'observe', topic: 'weather', branch: 'park',
      contribution: 'Parks are quiet when it rains.', questionPolicy: 'optional', questionPurpose: 'What they did next.', previousMoveOutcome: 'none', callbackMemoryKey: '', reopenBranch: false,
    },
  })
}

type Correction = { original: string; improved: string; explanation: string; severity: string; category: string }

const plainReply = 'That sounds nice. Parks are quiet when it rains. What did you do next?'

const storyParts = {
  title: 'A Rainy Walk',
  sentences: [
    'Mia went for a stroll after lunch.',
    'She opened her umbrella near the park.',
    'She stopped at a small shop for hot broth.',
    'The owner smiled and gave her a towel.',
    'Mia felt warm again and walked home.',
  ],
  question: 'What do you do when it starts to rain outside?',
}

const importParts = {
  title: 'A Night Market Returns',
  summary: 'The old night market in the city opened again last week. More than forty stalls sell food and small things. Many people came on the first evening. One vendor said she waited two years for this day.',
  questions: ['Have you ever been to a night market?', 'What food would you look for first there?', 'Why do you think people missed this market so much?'],
  words: [
    { term: 'stalls', meaning: '摊位' },
    { term: 'vendor', meaning: '摊主' },
    { term: 'lantern', meaning: '灯笼' },
  ],
}

function setup(title: string, extra: Record<string, unknown>) {
  return {
    title, category: '日常', setting: '周末的公园小路', partnerName: 'Lena', partnerRole: '散步时遇到的邻居', relationship: '邻居', tone: '轻松',
    personalityCues: ['爱聊天'], interests: ['散步'], currentMood: '悠闲', topicSeed: '天气和散步', openingLine: 'Oh, hello! It looks like rain again today.', difficulty: 'B1',
    ...extra,
  }
}

function pathSetups() {
  return {
    setups: [
      setup('雨天散步', { practiceWords: ['stroll'], weakSpot: 'tense' }),
      setup('街角的小店', { setting: '街角的汤面店', openingLine: 'Come in, come in. It is cold outside.', practiceWords: ['Umbrella', 'lantern'], weakSpot: 'nonsense' }),
      setup('周末市集', { setting: '周末的露天市集', openingLine: 'Good morning! These apples came in today.', practiceWords: ['stroll'], weakSpot: '' }),
    ],
  }
}

function stages(overrides: Partial<Record<Stage, (call: ModelCall) => string>> = {}) {
  return (call: ModelCall) => {
    if (overrides[call.stage]) return overrides[call.stage]!(call)
    if (call.stage === 'memory') return memoryAnswer()
    if (call.stage === 'analysis') return JSON.stringify({ languageMatch: 'target', lookup, reconstruction: null, corrections: [] })
    if (call.stage === 'reply') {
      return JSON.stringify({ roleReply: plainReply, reconstruction: null, corrections: [], lookup, statePatch: { currentTopic: 'walks', openedLoops: [], resolvedLoops: [], sceneFacts: [], userFacts: [] } })
    }
    if (call.stage === 'recap') {
      return JSON.stringify({
        good: { quote: 'after lunch', comment: '时间说得很自然。' },
        pattern: { category: '', comment: '' },
        takeaway: { original: 'a walk', improved: 'a stroll', meaning: '散步', comment: '闲逛时用 stroll 更贴切。' },
        expression: { level: 'B1', part: 'mid', reason: '能把经过讲清楚。' },
      })
    }
    if (call.stage === 'story') return JSON.stringify(storyParts)
    if (call.stage === 'import') return JSON.stringify(importParts)
    if (call.stage === 'setups') return JSON.stringify(pathSetups())
    return '{}'
  }
}

function reset() {
  db.exec(`DELETE FROM proficiency_profiles; DELETE FROM proficiency_history; DELETE FROM conversation_assessments; DELETE FROM turn_signals;
    DELETE FROM practice_sets; DELETE FROM conversation_recaps; DELETE FROM learning_events; DELETE FROM word_entries; DELETE FROM word_reviews;
    DELETE FROM word_stories; DELETE FROM content_imports; DELETE FROM learning_paths; DELETE FROM memories;
    DELETE FROM messages; DELETE FROM conversations; DELETE FROM app_flags WHERE key = 'proficiency_seeded';`)
  answer = stages()
  calls = []
  pageReads = 0
}

async function fresh(learning: Partial<(typeof defaultConfig)['learning']> = {}, provider: ProviderId = 'openai') {
  reset()
  await useProvider(provider, learning)
}

async function saveWord(term: string, meaning: string, extra: Record<string, unknown> = {}) {
  const response = await app.inject({ method: 'POST', url: '/api/words', payload: { term, lemma: term, meaning, language: 'en', interfaceLocale: 'zh-CN', details: {}, ...extra } })
  assert.equal(response.statusCode, 200, response.body)
  return response.json().id as string
}

function wordRow(id: string) {
  return db.prepare('SELECT * FROM word_entries WHERE id = ?').get(id) as Record<string, any>
}

async function startConversation() {
  const response = await app.inject({ method: 'POST', url: '/api/conversations', payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  return response.json().id as string
}

let sent = 0
async function send(conversationId: string, content: string, corrections: Correction[] = [], clientMessageId?: string) {
  sent += 1
  const before = answer
  answer = stages({ analysis: () => JSON.stringify({ languageMatch: 'target', lookup, reconstruction: null, corrections }) })
  const response = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { content, clientMessageId: clientMessageId || `turn-${sent}`, interfaceLocale: 'zh-CN' },
  })
  answer = before
  assert.equal(response.statusCode, 200, response.body)
  return response.json()
}

function stage(name: Stage) {
  return calls.filter((call) => call.stage === name)
}

function lastReplyPrompt() {
  return stage('reply').at(-1)?.body || ''
}

/** The words the partner was told about, read back out of the reply request. */
function promptedWords(body: string) {
  const at = body.indexOf('Saved words: ')
  if (at < 0) return []
  return [...body.slice(at, at + 400).matchAll(/term\\":\\"([^\\"]+)\\"/gu)].map((match) => match[1])
}

function arrangedRows(conversationId: string) {
  return db.prepare('SELECT word_id, term, source, result, message_id FROM conversation_words WHERE conversation_id = ? ORDER BY arranged_at, rowid').all(conversationId) as Array<Record<string, any>>
}

function rate(id: string, rating: number) {
  return app.inject({ method: 'POST', url: `/api/reviews/${id}`, payload: { rating } })
}

test.after(async () => {
  await app.close()
  db.close()
  await rm(dataDir, { recursive: true, force: true })
})

test('a flashcard rating moves the next review by FSRS and is kept as a review', async () => {
  await fresh()
  const id = await saveWord('stroll', '散步')
  const due = (await app.inject({ method: 'GET', url: '/api/reviews/due' })).json()
  assert.deepEqual(due.map((item: any) => item.id), [id])
  const next = due[0].nextReview
  assert.equal(next[3], 10, 'a new word rated good comes back in ten minutes')
  assert.equal(next[1] < next[2] && next[2] < next[3] && next[3] < next[4], true, JSON.stringify(next))
  assert.equal(next[4] >= 1440, true, 'easy sends a new word out by days')
  const first = await rate(id, 3)
  assert.equal(first.statusCode, 200, first.body)
  const minutes = (new Date(first.json().dueAt).getTime() - Date.now()) / 60_000
  assert.ok(minutes > 8 && minutes < 12, `a new word rated good comes back in about ten minutes, got ${minutes}`)
  assert.equal(first.json().intervalDays, 0)
  const stored = wordRow(id)
  assert.ok(JSON.parse(stored.fsrs_json).stability > 0)
  assert.equal(stored.repetitions, 1)
  assert.equal(first.json().nextReview[3] >= 1440, true, 'the word shown again in this sitting carries its new intervals')
  const second = await rate(id, 3)
  assert.ok(second.json().intervalDays >= 1, 'the second good rating moves the word out by days')
  assert.ok(new Date(second.json().dueAt).getTime() - Date.now() > 20 * 3_600_000)
  const reviews = db.prepare('SELECT rating, source, language FROM word_reviews WHERE word_id = ? ORDER BY rowid').all(id) as Array<Record<string, any>>
  assert.deepEqual(reviews.map((item) => ({ ...item })), [{ rating: 3, source: 'card', language: 'en' }, { rating: 3, source: 'card', language: 'en' }])
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/reviews/due' })).json(), [])
})

test('again brings a word back within minutes, and a rating outside the scale is clamped', async () => {
  await fresh()
  const id = await saveWord('umbrella', '雨伞')
  const again = await rate(id, 1)
  const minutes = (new Date(again.json().dueAt).getTime() - Date.now()) / 60_000
  assert.ok(minutes > 0 && minutes < 5, `got ${minutes}`)
  const clamped = await rate(id, 9)
  assert.equal(clamped.statusCode, 200, clamped.body)
  assert.equal((db.prepare('SELECT rating FROM word_reviews WHERE word_id = ? ORDER BY rowid DESC').get(id) as { rating: number }).rating, 4)
  const missing = await rate('no-such-word', 3)
  assert.equal(missing.statusCode, 404)
})

test('a word reviewed before FSRS keeps its progress', async () => {
  await fresh()
  const id = await saveWord('broth', '汤头')
  db.prepare("UPDATE word_entries SET repetitions = 3, interval_days = 6, ease = 2.3, fsrs_json = '', due_at = ? WHERE id = ?").run(new Date().toISOString(), id)
  const card = cardOf(wordRow(id) as any)
  assert.equal(card.stability, 6)
  assert.equal(card.difficulty, 5)
  assert.equal(card.reps, 3)
  const good = await rate(id, 3)
  assert.ok(good.json().intervalDays > 6, `a word on a six-day interval moves further out, got ${good.json().intervalDays}`)
  const hard = cardOf({ fsrs_json: '', due_at: new Date().toISOString(), interval_days: 6, ease: 1.3, repetitions: 3, created_at: new Date().toISOString() })
  assert.equal(hard.difficulty, 10)
})

test('saved words whose review has come are given to the partner, two at a time', async () => {
  await fresh()
  const stroll = await saveWord('stroll', '散步')
  const umbrella = await saveWord('umbrella', '雨伞')
  await saveWord('broth', '汤头')
  const later = await saveWord('towel', '毛巾')
  db.prepare('UPDATE word_entries SET due_at = ? WHERE id = ?').run(new Date(Date.now() + 86_400_000).toISOString(), later)
  const conversationId = await startConversation()
  await send(conversationId, 'I went to the park yesterday.')
  assert.deepEqual(promptedWords(lastReplyPrompt()), ['stroll', 'umbrella'])
  assert.match(lastReplyPrompt(), /Never ask them to use a word/u)
  assert.deepEqual(arrangedRows(conversationId).map((item) => [item.word_id, item.source, item.result]), [[stroll, 'due', null], [umbrella, 'due', null]])

  const used = await send(conversationId, 'After lunch I went for a stroll near the river.')
  assert.deepEqual(used.assistantMessage.meta.reviewedWords, [{ wordId: stroll, term: 'stroll', result: 'right' }])
  assert.ok(new Date(wordRow(stroll).due_at).getTime() > Date.now(), 'the word used in conversation is no longer due')
  const review = db.prepare('SELECT rating, source, conversation_id FROM word_reviews WHERE word_id = ?').get(stroll) as Record<string, any>
  assert.deepEqual({ ...review }, { rating: 3, source: 'conversation', conversation_id: conversationId })

  // One sitting gets two words and no more: the third due word waits for another day.
  await send(conversationId, 'The river was very quiet.')
  assert.deepEqual(promptedWords(lastReplyPrompt()), ['umbrella'])

  const slipped = await send(conversationId, 'Then I bought two umbrella for us.', [
    { original: 'two umbrella', improved: 'two umbrellas', explanation: '两把要用复数。', severity: 'minor', category: 'word_form' },
  ])
  assert.deepEqual(slipped.assistantMessage.meta.reviewedWords, [{ wordId: umbrella, term: 'umbrella', result: 'slip' }])
  assert.equal((db.prepare('SELECT rating FROM word_reviews WHERE word_id = ?').get(umbrella) as { rating: number }).rating, 2)

  await send(conversationId, 'I went home after that.')
  assert.doesNotMatch(lastReplyPrompt(), /Saved words: /u)

  const stored = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}?interfaceLocale=zh-CN` })
  const replies = stored.json().messages.filter((message: any) => message.role === 'assistant')
  assert.deepEqual(replies[1].meta.reviewedWords, [{ wordId: stroll, term: 'stroll', result: 'right' }])

  const recap = await app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/recap`, payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(recap.statusCode, 200, recap.body)
  assert.deepEqual(recap.json().recap.arranged, [
    { wordId: stroll, term: 'stroll', meaning: '散步', result: 'right' },
    { wordId: umbrella, term: 'umbrella', meaning: '雨伞', result: 'slip' },
  ])
})

test('sending the same message again does not count a second review', async () => {
  await fresh()
  const stroll = await saveWord('stroll', '散步')
  const conversationId = await startConversation()
  await send(conversationId, 'We took a stroll by the lake.', [], 'same-turn')
  const again = await send(conversationId, 'We took a stroll by the lake.', [], 'same-turn')
  assert.deepEqual(again.assistantMessage.meta.reviewedWords, [{ wordId: stroll, term: 'stroll', result: 'right' }])
  assert.equal((db.prepare('SELECT COUNT(*) AS total FROM word_reviews WHERE word_id = ?').get(stroll) as { total: number }).total, 1)
})

test('words out of reach, words of another language and words just looked up here are left out', async () => {
  await fresh({ proficiency: 'A1' })
  await saveWord('ubiquitous', '无处不在的')
  await saveWord('散歩', '散步', { language: 'ja' })
  const conversationId = await startConversation()
  await saveWord('towel', '毛巾', { conversationId })
  const easy = await saveWord('walk', '走路')
  await send(conversationId, 'I like the park.')
  assert.deepEqual(promptedWords(lastReplyPrompt()), ['walk'])
  assert.deepEqual(arrangedRows(conversationId).map((item) => item.word_id), [easy])
})

test('with the setting off no saved word is arranged', async () => {
  await fresh({ reviewInConversation: false })
  await saveWord('stroll', '散步')
  const conversationId = await startConversation()
  const result = await send(conversationId, 'I went for a stroll.')
  assert.doesNotMatch(lastReplyPrompt(), /Saved words: /u)
  assert.equal(result.assistantMessage.meta.reviewedWords, undefined)
  assert.deepEqual(arrangedRows(conversationId), [])
})

test('the review setting must be a boolean', async () => {
  await fresh()
  const settings = (await app.inject({ method: 'GET', url: '/api/settings' })).json()
  const bad = await app.inject({ method: 'PUT', url: '/api/settings', payload: { ...settings.config ?? settings, learning: { ...(settings.config ?? settings).learning, reviewInConversation: 'yes' } } })
  assert.ok(bad.statusCode >= 400, bad.body)
})

test('two learners with a database each, asking for a story at the same moment, each get their own', async () => {
  await fresh()
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const { chooseDatabaseWith, openDatabase } = await import('./services/database.js')
  const inHand = new AsyncLocalStorage<ReturnType<typeof openDatabase>>()
  const learners = ['one', 'two'].map((name) => ({ name, database: openDatabase(path.join(dataDir, `learner-${name}.db`)) }))
  const terms = ['stroll', 'umbrella', 'broth']
  chooseDatabaseWith(() => inHand.getStore())
  try {
    for (const { name, database } of learners) await inHand.run(database, async () => { for (const term of terms) await saveWord(term, `${term} of ${name}`) })
    const stories = await Promise.all(learners.map(({ database }) => inHand.run(database, async () => {
      const response = await app.inject({ method: 'POST', url: '/api/stories', payload: { interfaceLocale: 'zh-CN' } })
      assert.equal(response.statusCode, 200, response.body)
      const { story } = response.json()
      assert.equal((await app.inject({ method: 'GET', url: `/api/stories/${story.id}` })).statusCode, 200, 'the story is kept where the one who asked for it keeps theirs')
      return story
    })))
    stories.forEach((story, index) => assert.deepEqual(story.words.map((word: any) => word.meaning), terms.map((term) => `${term} of ${learners[index].name}`)))
    assert.equal(stage('story').length, 2)
  } finally {
    chooseDatabaseWith(() => undefined)
    for (const { database } of learners) database.close()
  }
})

test('a story needs a few saved words', async () => {
  await fresh()
  await saveWord('stroll', '散步')
  await saveWord('umbrella', '雨伞')
  const response = await app.inject({ method: 'POST', url: '/api/stories', payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 409, response.body)
  assert.equal(response.json().code, 'STORY_NEEDS_WORDS')
  assert.equal(calls.length, 0)
})

for (const provider of Object.keys(models) as ProviderId[]) {
  test(`${provider}: a story is written from saved words and can be talked about`, async () => {
    await fresh({}, provider)
    const stroll = await saveWord('stroll', '散步')
    const umbrella = await saveWord('umbrella', '雨伞')
    const broth = await saveWord('broth', '汤头')
    const bargain = await saveWord('bargain', '讲价')
    const response = await app.inject({ method: 'POST', url: '/api/stories', payload: { interfaceLocale: 'zh-CN' } })
    assert.equal(response.statusCode, 200, response.body)
    assert.equal(stage('story').length, 1)
    assert.ok(stage('story')[0].body.includes('stroll') && stage('story')[0].body.includes('讲价'))
    const { story } = response.json()
    assert.equal(story.title, 'A Rainy Walk')
    assert.equal(story.languageCode, 'en')
    assert.equal(story.sentences.length, 5)
    assert.deepEqual(story.sentences[0], { text: 'Mia went for a stroll after lunch.', marks: [{ wordId: stroll, surface: 'stroll' }] })
    assert.deepEqual(story.sentences[3].marks, [])
    assert.deepEqual(story.words.map((word: any) => [word.wordId, word.used, word.saved]), [[stroll, true, true], [umbrella, true, true], [broth, true, true], [bargain, false, true]])
    assert.equal(story.conversationId, null)

    const read = await app.inject({ method: 'GET', url: `/api/stories/${story.id}` })
    assert.deepEqual(read.json().story, story)
    assert.equal(story.words[0].meaning, '散步')
    // A meaning written in Chinese is not shown as if it were English.
    const english = (await app.inject({ method: 'GET', url: `/api/stories/${story.id}?interfaceLocale=en-US` })).json().story
    assert.deepEqual(english.words.map((word: any) => word.meaning), ['', '', '', ''])
    assert.deepEqual(english.sentences, story.sentences)
    const listed = await app.inject({ method: 'GET', url: '/api/stories' })
    assert.deepEqual(listed.json().stories.map((item: any) => item.id), [story.id])

    calls = []
    const talk = await app.inject({ method: 'POST', url: `/api/stories/${story.id}/talk`, payload: { interfaceLocale: 'zh-CN' } })
    assert.equal(talk.statusCode, 200, talk.body)
    assert.equal(calls.length, 0, 'starting to talk costs no model call')
    const conversationId = talk.json().id as string
    const conversation = (await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}?interfaceLocale=zh-CN` })).json()
    assert.equal(conversation.title, 'A Rainy Walk')
    assert.deepEqual(conversation.messages.map((message: any) => [message.role, message.content]), [['assistant', storyParts.question]])
    assert.deepEqual(arrangedRows(conversationId).map((item) => [item.word_id, item.source]), [[stroll, 'story'], [umbrella, 'story'], [broth, 'story']])

    const again = await app.inject({ method: 'POST', url: `/api/stories/${story.id}/talk`, payload: { interfaceLocale: 'zh-CN' } })
    assert.equal(again.json().id, conversationId)
    assert.equal((await app.inject({ method: 'GET', url: `/api/stories/${story.id}` })).json().story.conversationId, conversationId)

    const turn = await send(conversationId, 'I usually wait in a shop and drink hot broth.')
    assert.match(lastReplyPrompt(), /Shared material: /u)
    assert.ok(lastReplyPrompt().includes('Mia went for a stroll after lunch.'))
    assert.deepEqual(promptedWords(lastReplyPrompt()), ['stroll', 'umbrella'])
    assert.deepEqual(turn.assistantMessage.meta.reviewedWords, [{ wordId: broth, term: 'broth', result: 'right' }])
  })
}

test('story words are still arranged when words in conversation are switched off', async () => {
  await fresh({ reviewInConversation: false })
  for (const [term, meaning] of [['stroll', '散步'], ['umbrella', '雨伞'], ['broth', '汤头']]) await saveWord(term, meaning)
  const { story } = (await app.inject({ method: 'POST', url: '/api/stories', payload: { interfaceLocale: 'zh-CN' } })).json()
  const conversationId = (await app.inject({ method: 'POST', url: `/api/stories/${story.id}/talk`, payload: {} })).json().id
  await send(conversationId, 'I stay at home.')
  assert.deepEqual(promptedWords(lastReplyPrompt()), ['stroll', 'umbrella'])
})

test('a story that leaves the saved words out is not kept', async () => {
  await fresh()
  for (const [term, meaning] of [['stroll', '散步'], ['umbrella', '雨伞'], ['broth', '汤头']]) await saveWord(term, meaning)
  answer = stages({ story: () => JSON.stringify({ title: 'A Day', sentences: ['Tom got up early.', 'He made tea.', 'He read a book.', 'Then he slept.'], question: 'What do you do in the morning?' }) })
  const response = await app.inject({ method: 'POST', url: '/api/stories', payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 502, response.body)
  assert.equal(stage('story').length, 2)
  assert.equal((db.prepare('SELECT COUNT(*) AS total FROM word_stories').get() as { total: number }).total, 0)
  const missing = await app.inject({ method: 'GET', url: '/api/stories/none' })
  assert.equal(missing.statusCode, 404)
  assert.equal(missing.json().code, 'STORY_NOT_FOUND')
})

test('subtitles and lyrics lose their numbers, timestamps and markup', () => {
  assert.equal(cleanPasted('1\n00:00:01,000 --> 00:00:03,500\n<i>Where are you going?</i>\n\n2\n00:00:04,000 --> 00:00:06,000\nTo the market.\n'), 'Where are you going?\n\nTo the market.')
  assert.equal(cleanPasted('WEBVTT\n\n00:01.000 --> 00:04.000\nHello there.'), 'Hello there.')
  assert.equal(cleanPasted('[ti:Song]\n[ar:Someone]\n[00:12.30]First line\n[00:15.80][01:20.10]Second line'), 'First line\nSecond line')
  assert.equal(cleanPasted('In 2024 the market closed.\n\n\n\n40\nstalls were left.'), 'In 2024 the market closed.\n\n40\nstalls were left.')
})

const pasted = [
  '1', '00:00:01,000 --> 00:00:04,000', 'The old night market opened again last week.',
  '', '2', '00:00:04,500 --> 00:00:09,000', 'More than forty stalls sell food, toys and small things for the home.',
  '', '3', '00:00:09,500 --> 00:00:14,000', 'One vendor said she had waited two years for this day to come.',
].join('\n')

test('pasted material is retold with questions and words, and can be talked about', async () => {
  await fresh()
  const short = await app.inject({ method: 'POST', url: '/api/imports', payload: { text: 'Too short to use.', interfaceLocale: 'zh-CN' } })
  assert.equal(short.statusCode, 400, short.body)
  assert.equal(short.json().code, 'IMPORT_TOO_SHORT')
  assert.equal(calls.length, 0)

  const response = await app.inject({ method: 'POST', url: '/api/imports', payload: { text: pasted, interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(stage('import').length, 1)
  const request = stage('import')[0].body
  assert.ok(request.includes('The old night market opened again last week.'))
  assert.ok(!request.includes('-->'), 'timestamps are not sent to the model')
  const { content } = response.json()
  assert.equal(content.title, importParts.title)
  assert.equal(content.summary, importParts.summary)
  assert.deepEqual(content.questions, importParts.questions)
  // A word the summary does not contain cannot be pointed at, so it is dropped.
  assert.deepEqual(content.words, importParts.words.slice(0, 2).map((word) => ({ ...word, wordId: null })))
  assert.deepEqual(content.source, { kind: 'text', url: null, title: '' })

  assert.deepEqual((await app.inject({ method: 'GET', url: `/api/imports/${content.id}?interfaceLocale=fr-FR` })).json().content.words.map((word: any) => word.meaning), ['', ''])
  const listed = (await app.inject({ method: 'GET', url: '/api/imports' })).json()
  assert.deepEqual(listed.items.map((item: any) => [item.id, item.title]), [[content.id, importParts.title]])
  assert.deepEqual((await app.inject({ method: 'GET', url: `/api/imports/${content.id}` })).json().content, content)


  const kept = await app.inject({ method: 'POST', url: `/api/imports/${content.id}/words`, payload: { term: 'vendor' } })
  assert.equal(kept.statusCode, 200, kept.body)
  const vendor = wordRow(kept.json().wordId)
  assert.deepEqual([vendor.term, vendor.meaning, vendor.language, vendor.interface_locale, vendor.source_sentence], ['vendor', '摊主', 'en', 'zh-CN', 'One vendor said she waited two years for this day.'])
  assert.equal((await app.inject({ method: 'POST', url: `/api/imports/${content.id}/words`, payload: { term: 'vendor' } })).json().wordId, vendor.id)
  assert.equal((db.prepare('SELECT COUNT(*) AS total FROM word_entries').get() as { total: number }).total, 1)
  assert.deepEqual((await app.inject({ method: 'GET', url: `/api/imports/${content.id}` })).json().content.words.map((word: any) => word.wordId), [null, vendor.id])
  assert.equal((await app.inject({ method: 'POST', url: `/api/imports/${content.id}/words`, payload: { term: 'lantern' } })).json().code, 'IMPORT_WORD_NOT_FOUND')

  const refresh = await app.inject({ method: 'POST', url: `/api/imports/${content.id}/refresh`, payload: {} })
  assert.equal(refresh.statusCode, 409)
  assert.equal(refresh.json().code, 'IMPORT_NOT_A_LINK')

  calls = []
  const talk = await app.inject({ method: 'POST', url: `/api/imports/${content.id}/talk`, payload: { question: 2, interfaceLocale: 'zh-CN' } })
  assert.equal(talk.statusCode, 200, talk.body)
  assert.equal(calls.length, 0)
  const conversationId = talk.json().id as string
  const conversation = (await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}?interfaceLocale=zh-CN` })).json()
  assert.deepEqual(conversation.messages.map((message: any) => message.content), [importParts.questions[2]])
  await send(conversationId, 'I think people like to meet there.')
  assert.match(lastReplyPrompt(), /Shared material: /u)
  assert.ok(lastReplyPrompt().includes('The old night market in the city opened again last week.'))

  const removed = await app.inject({ method: 'DELETE', url: `/api/imports/${content.id}` })
  assert.equal(removed.statusCode, 200)
  const gone = await app.inject({ method: 'GET', url: `/api/imports/${content.id}` })
  assert.equal(gone.statusCode, 404)
  assert.equal(gone.json().code, 'IMPORT_NOT_FOUND')
})

test('a link is read, retold, and can be read again', async () => {
  await fresh()
  page = {
    status: 200, type: 'text/html; charset=utf-8',
    body: '<html><head><title>City News: Night Market</title><script>var x = 1</script></head><body><h1>Night market returns</h1><p>The old night market opened again last week after two years.</p><p>More than forty stalls sell food and small things, and many people came on the first evening.</p></body></html>',
  }
  const address = `http://${PAGE_HOST}/news/market`
  const response = await app.inject({ method: 'POST', url: '/api/imports', payload: { text: `  ${address}  `, interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(pageReads, 1)
  const { content } = response.json()
  assert.deepEqual(content.source, { kind: 'url', url: address, title: 'City News: Night Market' })
  const request = stage('import')[0].body
  assert.ok(request.includes('More than forty stalls sell food'))
  assert.ok(!request.includes('var x = 1'))

  const refreshed = await app.inject({ method: 'POST', url: `/api/imports/${content.id}/refresh`, payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(refreshed.statusCode, 200, refreshed.body)
  assert.equal(pageReads, 2)
  assert.notEqual(refreshed.json().content.id, content.id)
  assert.equal((await app.inject({ method: 'GET', url: '/api/imports' })).json().items.length, 2)
})

test('an address that is not public, not the web, or not readable is refused without a model call', async () => {
  await fresh()
  for (const url of ['http://localhost:4174/api/export', 'http://127.0.0.1/secret', 'http://192.168.1.10/router', 'ftp://example.com/file.txt', 'not an address']) {
    const response = await app.inject({ method: 'POST', url: '/api/imports', payload: { url, interfaceLocale: 'zh-CN' } })
    assert.equal(response.statusCode, 400, `${url}: ${response.body}`)
    assert.equal(response.json().code, 'IMPORT_URL_INVALID')
  }
  page = { status: 404, type: 'text/html', body: 'gone' }
  const missing = await app.inject({ method: 'POST', url: '/api/imports', payload: { url: `http://${PAGE_HOST}/gone`, interfaceLocale: 'zh-CN' } })
  assert.equal(missing.statusCode, 502, missing.body)
  assert.equal(missing.json().code, 'IMPORT_READ_FAILED')
  assert.equal(calls.length, 0)
  assert.equal(pageReads, 1)
})

test('what to talk about next is suggested once a day, with the saved words and weak spots each suits', async () => {
  await fresh()
  const first = await app.inject({ method: 'GET', url: '/api/path?interfaceLocale=zh-CN' })
  assert.deepEqual(first.json(), { path: null })

  // Two past-tense mistakes make tense a weak spot, and the talk gives a usual topic.
  const earlier = await startConversation()
  await send(earlier, 'Yesterday I go to the park with my sister.', [{ original: 'I go to', improved: 'I went to', explanation: '过去的事用过去式。', severity: 'meaning', category: 'tense' }])
  await send(earlier, 'We see many birds there.', [{ original: 'We see', improved: 'We saw', explanation: '过去的事用过去式。', severity: 'meaning', category: 'tense' }])
  const stroll = await saveWord('stroll', '散步')
  const umbrella = await saveWord('umbrella', '雨伞')
  calls = []

  const response = await app.inject({ method: 'POST', url: '/api/path', payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(stage('setups').length, 1)
  const request = stage('setups')[0].body
  assert.ok(request.includes('path.savedWords are words the learner saved'))
  assert.ok(request.includes('stroll') && request.includes('umbrella'))
  assert.ok(request.includes('usualTopics') && request.includes('walks'))
  const { path: suggested } = response.json()
  assert.equal(suggested.languageCode, 'en')
  assert.equal(suggested.items.length, 3)
  assert.deepEqual(suggested.items.map((item: any) => item.title), ['雨天散步', '街角的小店', '周末市集'])
  assert.deepEqual(suggested.items[0].words, [{ wordId: stroll, term: 'stroll', meaning: '散步' }])
  assert.equal(suggested.items[0].mistake, 'tense')
  // A word the learner did not save is ignored, a made-up weak spot is ignored, and no word is offered twice.
  assert.deepEqual(suggested.items[1].words, [{ wordId: umbrella, term: 'umbrella', meaning: '雨伞' }])
  assert.equal(suggested.items[1].mistake, null)
  assert.deepEqual(suggested.items[2].words, [])
  assert.equal(suggested.items[0].conversationId, null)

  calls = []
  const cached = await app.inject({ method: 'GET', url: '/api/path?interfaceLocale=zh-CN' })
  assert.deepEqual(cached.json().path, suggested)
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/path?interfaceLocale=en-US' })).json(), { path: null })

  const started = await app.inject({ method: 'POST', url: `/api/path/${suggested.items[0].id}/start`, payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(started.statusCode, 200, started.body)
  assert.equal(calls.length, 0)
  const conversationId = started.json().id as string
  const conversation = (await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}?interfaceLocale=zh-CN` })).json()
  assert.equal(conversation.title, '雨天散步')
  assert.deepEqual(conversation.messages.map((message: any) => message.content), ['Oh, hello! It looks like rain again today.'])
  assert.deepEqual(arrangedRows(conversationId).map((item) => [item.word_id, item.source]), [[stroll, 'path']])
  const again = await app.inject({ method: 'POST', url: `/api/path/${suggested.items[0].id}/start`, payload: {} })
  assert.equal(again.json().id, conversationId)
  assert.equal((await app.inject({ method: 'GET', url: '/api/path?interfaceLocale=zh-CN' })).json().path.items[0].conversationId, conversationId)

  const unknown = await app.inject({ method: 'POST', url: '/api/path/none/start', payload: {} })
  assert.equal(unknown.statusCode, 404)
  assert.equal(unknown.json().code, 'PATH_ITEM_NOT_FOUND')

  // A day later the suggestions are no longer offered.
  db.prepare('UPDATE learning_paths SET created_at = ?').run(new Date(Date.now() - 25 * 3_600_000).toISOString())
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/path?interfaceLocale=zh-CN' })).json(), { path: null })
})

test('with words in conversation switched off, suggestions carry no saved words', async () => {
  await fresh({ reviewInConversation: false })
  await saveWord('stroll', '散步')
  const response = await app.inject({ method: 'POST', url: '/api/path', payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  assert.deepEqual(response.json().path.items.map((item: any) => item.words), [[], [], []])
})

test('ordinary scene suggestions are asked for as before', async () => {
  await fresh()
  const response = await app.inject({ method: 'POST', url: '/api/conversation-setups/suggest', payload: { domain: 'daily', interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  const request = stage('setups')[0].body
  assert.ok(!request.includes('practiceWords'))
  assert.equal(response.json().setups[0].practiceWords, undefined)
})

test('surprise me draws a kind of conversation, a place and a person, and opens the conversation', async () => {
  assert.deepEqual(randomScene(() => 0), { domain: 'daily', place: 'a bakery just before closing, with a talkative shop owner' })
  assert.deepEqual(randomScene(() => 0.9999), { domain: 'opinion', place: 'a train ride with a newspaper, with a neighbour' })

  await fresh()
  const response = await app.inject({ method: 'POST', url: '/api/conversation-setups/random', payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(stage('setups').length, 1)
  const request = stage('setups')[0].body
  assert.match(request, /Create exactly 1 opening/u)
  const scenes = Object.values(RANDOM_SCENES)
  assert.equal(scenes.some((scene) => scene.places.some((place) => scene.people.some((person) => request.includes(`${place}, with ${person}`)))), true)
  assert.equal(request.includes('practiceWords'), false)

  const conversation = (await app.inject({ method: 'GET', url: `/api/conversations/${response.json().id}?interfaceLocale=zh-CN` })).json()
  assert.equal(conversation.title, '雨天散步')
  assert.deepEqual(conversation.messages.map((message: any) => [message.role, message.content]), [['assistant', 'Oh, hello! It looks like rain again today.']])

  answer = stages({ setups: () => JSON.stringify({ setups: [] }) })
  const empty = await app.inject({ method: 'POST', url: '/api/conversation-setups/random', payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(empty.statusCode, 502, empty.body)
})
