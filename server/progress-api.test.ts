import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-progress-api-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'
process.env.LLC_LAN_HOSTS = 'yujian-test.lan'

let answer: (body: string) => string = () => '{}'
let bodies: string[] = []

globalThis.fetch = async (_input, init = {}) => {
  const body = String(init.body || '')
  bodies.push(body)
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: answer(body) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } })
}

const { app } = await import('./index.js')
// The module, not its `db`: the handle changes when the learner's profile does.
const database = await import('./services/database.js')
const { defaultConfig, getConfig, saveConfigAndSecrets } = await import('./services/config.js')
const { recordLearningEvents } = await import('./services/memory-store.js')
const { STRUCTURED_CONTRACT_VERSION } = await import('./ai/provider.js')
const { normalizeTurnAnalysis } = await import('./ai/engine.js')
const { turnAnalysisSystem } = await import('./ai/prompts.js')
const { fewerMistakes, localDay, progressFor, weekStart, PROGRESS_WEEKS } = await import('./progress-routes.js')
const { entryPage, isPrivateIpv4, lanHosts, newAccessCode } = await import('./lan.js')
const { TARGET_LANGUAGES, UI_LOCALES } = await import('../shared/locales.js')
const { BEDTIME_RULE, bedtimeOpening } = await import('../shared/quick-talk.js')
const { countsAsError, normalizeCertainty, normalizeRegister, normalizeVariant, speechVariant, variantPromptName, variantRegionName, variantsFor } = await import('../shared/variants.js')

async function configure(learning: Partial<(typeof defaultConfig)['learning']> = {}) {
  const config = structuredClone(defaultConfig)
  config.setupComplete = true
  config.llm.defaultProvider = 'openai'
  config.learning = { ...config.learning, targetLanguage: 'Spanish', targetLanguageCode: 'es', ...learning }
  config.providers = config.providers.map((provider) => provider.id === 'openai' ? {
    ...provider,
    enabled: true,
    model: 'gpt-4.1',
    capability: {
      outputMode: 'json_schema' as const, conversationReady: true as const, lookupReady: true, baseUrl: provider.baseUrl,
      model: 'gpt-4.1', contractVersion: STRUCTURED_CONTRACT_VERSION, testedAt: '2026-11-20T00:00:00.000Z',
    },
  } : provider)
  await saveConfigAndSecrets(config, { 'providers.openai.apiKey': 'test-key' })
  return config
}

let serial = 0
const nextId = (prefix: string) => `${prefix}-${serial += 1}`

function conversation(language = 'es') {
  const id = nextId('c')
  database.db.prepare("INSERT INTO conversations (id, mode, title, target_language, target_language_code, created_at, updated_at) VALUES (?, 'conversation', 'Talk', 'Spanish', ?, ?, ?)")
    .run(id, language, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')
  return id
}

function said(conversationId: string, content: string, at: string) {
  database.db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)").run(nextId('m'), conversationId, content, at)
}

function mistake(category: string, at: string, original = 'yo ir', improved = 'yo voy') {
  database.db.prepare("INSERT INTO learning_events (id, target_language_code, kind, category, severity, original, improved, created_at) VALUES (?, 'es', 'error', ?, 'naturalness', ?, ?, ?)")
    .run(nextId('e'), category, original, improved, at)
}

test.after(async () => {
  await app.close()
  database.db.close()
  await rm(dataDir, { recursive: true, force: true })
})

test('a day and a week are the learner\'s own, not the server\'s', () => {
  // Friday 20 November, 23:30 UTC, is already Saturday morning at UTC+8.
  assert.equal(localDay('2026-11-20T23:30:00.000Z', -480), '2026-11-21')
  assert.equal(localDay('2026-11-20T23:30:00.000Z', 0), '2026-11-20')
  assert.equal(localDay('2026-11-20T02:00:00.000Z', 300), '2026-11-19')
  // The week began on Monday 16 November, at midnight on that clock.
  assert.equal(new Date(weekStart(new Date('2026-11-20T12:00:00.000Z'), 0)).toISOString(), '2026-11-16T00:00:00.000Z')
  assert.equal(new Date(weekStart(new Date('2026-11-20T12:00:00.000Z'), -480)).toISOString(), '2026-11-15T16:00:00.000Z')
  // Sunday evening UTC is Monday at UTC+8: the new week has begun there.
  assert.equal(new Date(weekStart(new Date('2026-11-22T18:00:00.000Z'), -480)).toISOString(), '2026-11-22T16:00:00.000Z')
  assert.equal(new Date(weekStart(new Date('2026-11-22T18:00:00.000Z'), 0)).toISOString(), '2026-11-16T00:00:00.000Z')
})

test('a kind of mistake counts as fewer only when it really fell for the amount written', () => {
  assert.deepEqual(fewerMistakes({ messages: 10, errors: { tense: 6, article: 2 } }, { messages: 10, errors: { tense: 1, article: 2 } }), { category: 'tense', before: 6, now: 1 })
  // Half as many mistakes in half as many messages is no change.
  assert.equal(fewerMistakes({ messages: 20, errors: { tense: 6 } }, { messages: 10, errors: { tense: 3 } }), null)
  // Too little written in either week to say anything.
  assert.equal(fewerMistakes({ messages: 10, errors: { tense: 6 } }, { messages: 2, errors: {} }), null)
  assert.equal(fewerMistakes({ messages: 3, errors: { tense: 6 } }, { messages: 10, errors: {} }), null)
  // Seen once before is not a pattern, and "other" is not a kind.
  assert.equal(fewerMistakes({ messages: 10, errors: { tense: 1, other: 8 } }, { messages: 10, errors: {} }), null)
})

test('progress is counted from the learner\'s own messages, corrections, used words and level history', async () => {
  await configure()
  const now = new Date('2026-11-20T12:00:00.000Z')
  const first = conversation()
  const second = conversation()
  const french = conversation('fr')
  // This week: six messages over two days, in two conversations.
  for (const at of ['2026-11-16T09:00:00.000Z', '2026-11-16T09:01:00.000Z', '2026-11-16T09:02:00.000Z']) said(first, 'Hoy voy al mercado', at)
  for (const at of ['2026-11-18T20:00:00.000Z', '2026-11-18T20:01:00.000Z', '2026-11-18T20:02:00.000Z']) said(second, 'Me gusta el pan', at)
  // Last week: five messages on one day. Another language and the partner's lines are not counted.
  for (let minute = 0; minute < 5; minute += 1) said(first, 'Ayer fui al cine', `2026-11-10T10:0${minute}:00.000Z`)
  said(french, 'Bonjour tout le monde', '2026-11-17T10:00:00.000Z')
  database.db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('partner-1', ?, 'assistant', 'Hola', '2026-11-16T09:00:30.000Z')").run(first)
  // Too long ago for the grid.
  said(first, 'Hola', '2025-01-01T10:00:00.000Z')
  for (let index = 0; index < 4; index += 1) mistake('tense', '2026-11-10T10:00:00.000Z')
  mistake('article', '2026-11-10T10:00:00.000Z')
  mistake('article', '2026-11-17T10:00:00.000Z')
  database.db.prepare("INSERT INTO conversation_words (conversation_id, word_id, term, meaning, source, arranged_at, used_at) VALUES (?, 'w1', 'mercado', 'market', 'due', '2026-11-16T09:00:00.000Z', '2026-11-16T09:01:00.000Z')").run(first)
  database.db.prepare("INSERT INTO conversation_words (conversation_id, word_id, term, meaning, source, arranged_at, used_at) VALUES (?, 'w1', 'mercado', 'market', 'due', '2026-11-18T20:00:00.000Z', '2026-11-18T20:01:00.000Z')").run(second)
  database.db.prepare("INSERT INTO conversation_words (conversation_id, word_id, term, meaning, source, arranged_at, used_at) VALUES (?, 'w2', 'cine', 'cinema', 'due', '2026-11-10T10:00:00.000Z', '2026-11-10T10:01:00.000Z')").run(first)
  database.db.prepare("INSERT INTO conversation_words (conversation_id, word_id, term, meaning, source, arranged_at) VALUES (?, 'w3', 'pan', 'bread', 'due', '2026-11-18T20:00:00.000Z')").run(second)
  database.db.prepare("INSERT INTO proficiency_history (id, language_code, kind, from_step, to_step, reason, created_at) VALUES ('h1', 'es', 'estimate', NULL, 3, 'test', '2026-10-01T00:00:00.000Z')").run()
  database.db.prepare("INSERT INTO proficiency_history (id, language_code, kind, from_step, to_step, reason, created_at) VALUES ('h2', 'es', 'estimate', 3, 4, 'sustained_above', '2026-11-12T00:00:00.000Z')").run()
  database.db.prepare("INSERT INTO proficiency_history (id, language_code, kind, from_step, to_step, reason, created_at) VALUES ('h3', 'es', 'difficulty', 4, 5, 'easy_streak', '2026-11-13T00:00:00.000Z')").run()

  const progress = progressFor('es', now, 0)
  assert.equal(progress.unit, 'words')
  assert.equal(progress.weeks, PROGRESS_WEEKS)
  assert.equal(progress.today, '2026-11-20')
  assert.deepEqual(progress.days, [
    { date: '2026-11-10', messages: 5, amount: 20 },
    { date: '2026-11-16', messages: 3, amount: 12 },
    { date: '2026-11-18', messages: 3, amount: 12 },
  ])
  assert.equal(progress.week.messages, 6)
  assert.equal(progress.week.amount, 24)
  assert.equal(progress.week.conversations, 2)
  assert.equal(progress.week.days, 2)
  assert.deepEqual(progress.week.previous, { messages: 5, amount: 20 })
  // "mercado" was first used this week, and is listed once; "pan" was arranged and never used.
  assert.deepEqual(progress.week.firstUsed, [{ term: 'mercado', meaning: 'market' }])
  assert.deepEqual(progress.week.fewer, { category: 'tense', before: 4, now: 0 })
  assert.equal(progress.lastWeek.messages, 5)
  assert.deepEqual(progress.lastWeek.firstUsed, [{ term: 'cine', meaning: 'cinema' }])
  assert.equal(progress.lastWeek.fewer, null)
  // Only changes to the estimate make the curve; the working difficulty moves far more often.
  assert.deepEqual(progress.level, [
    { at: '2026-10-01T00:00:00.000Z', step: 3, reason: 'test' },
    { at: '2026-11-12T00:00:00.000Z', step: 4, reason: 'sustained_above' },
  ])
  // On a clock eight hours ahead, the evening messages of the 18th fall on the 19th.
  assert.deepEqual(progressFor('es', now, -480).days.map((day) => day.date), ['2026-11-10', '2026-11-16', '2026-11-19'])
  assert.equal(progressFor('fr', now, 0).week.messages, 1)

  const served = await app.inject({ method: 'GET', url: '/api/progress?offset=0' })
  assert.equal(served.statusCode, 200, served.body)
  assert.equal(served.json().languageCode, 'es')
  assert.equal(Array.isArray(served.json().days), true)
})

test('the card for a real conversation is taken from the learning record, without a request', async () => {
  await configure()
  bodies = []
  database.db.exec('DELETE FROM learning_events')
  const now = new Date().toISOString()
  const talk = conversation()
  for (let index = 0; index < 3; index += 1) said(talk, 'Hola', now)
  for (let index = 0; index < 3; index += 1) mistake('agreement', now, 'la problema', 'el problema')
  database.db.prepare("INSERT INTO learning_events (id, target_language_code, kind, category, original, improved, created_at) VALUES ('gap-1', 'es', 'gap', 'gap', 'I would like to change my appointment', 'Quisiera cambiar mi cita', ?)").run(now)
  database.db.prepare("INSERT INTO word_entries (id, term, lemma, language, meaning, details_json, due_at, created_at, updated_at) VALUES ('word-1', 'madrugar', 'madrugar', 'es', 'to get up early', '{}', ?, ?, ?)").run(now, now, now)

  const created = await app.inject({ method: 'POST', url: '/api/live' })
  assert.equal(created.statusCode, 200, created.body)
  const card = created.json()
  assert.equal(bodies.length, 0)
  assert.deepEqual(card.items.map((item: { kind: string }) => item.kind), ['pattern', 'words', 'say'])
  assert.equal(card.items[0].category, 'agreement')
  assert.equal(card.items[0].example, 'la problema → el problema')
  assert.deepEqual(card.items[1].words, [{ term: 'madrugar', meaning: 'to get up early' }])
  assert.deepEqual(card.items[2].sentences, [{ original: 'I would like to change my appointment', improved: 'Quisiera cambiar mi cita' }])
  assert.equal(card.finishedAt, null)
  assert.equal((await app.inject({ method: 'GET', url: '/api/live' })).json().current.id, card.id)

  // A second card replaces the one never come back to.
  const again = (await app.inject({ method: 'POST', url: '/api/live' })).json()
  assert.notEqual(again.id, card.id)
  assert.equal((await app.inject({ method: 'POST', url: `/api/live/${card.id}/debrief`, payload: {} })).statusCode, 404)

  // Coming back: what could not be said gets a way to say it, and what was corrected stays as the learner wrote it.
  answer = () => JSON.stringify({
    said: [{ index: 0, improved: '¿Me puede hablar más despacio, por favor?' }],
    corrected: [{ index: 0, category: 'tense', explanation: 'Yesterday is finished time, so the past form is used.' }],
  })
  const done = await app.inject({
    method: 'POST', url: `/api/live/${again.id}/debrief`,
    payload: {
      interfaceLocale: 'en-US', used: [true, false, true, true],
      stuck: ['  Could you speak more slowly?  ', ''],
      corrected: [{ said: 'Ayer voy al cine', right: 'Ayer fui al cine' }, { said: 'same', right: 'same' }, { said: '', right: 'x' }],
    },
  })
  assert.equal(done.statusCode, 200, done.body)
  const outcome = done.json().outcome
  assert.deepEqual(outcome.used, [true, false, true])
  assert.deepEqual(outcome.gaps, [{ original: 'Could you speak more slowly?', improved: '¿Me puede hablar más despacio, por favor?' }])
  assert.deepEqual(outcome.errors, [{ original: 'Ayer voy al cine', improved: 'Ayer fui al cine', explanation: 'Yesterday is finished time, so the past form is used.', category: 'tense' }])
  assert.equal(bodies.length, 1)
  assert.equal(bodies[0].includes('A language learner has just talked with a real person'), true)
  assert.equal(typeof done.json().finishedAt, 'string')

  const written = database.db.prepare('SELECT kind, category, original, improved, conversation_id FROM learning_events WHERE message_id = ? ORDER BY kind').all(`live:${again.id}`)
  assert.deepEqual(written.map((item) => ({ ...item })), [
    { kind: 'error', category: 'tense', original: 'Ayer voy al cine', improved: 'Ayer fui al cine', conversation_id: null },
    { kind: 'gap', category: 'gap', original: 'Could you speak more slowly?', improved: '¿Me puede hablar más despacio, por favor?', conversation_id: null },
  ])
  // It is in the same record the conversations write into, and the request was booked as looking back.
  const status = (await app.inject({ method: 'GET', url: '/api/learning-status' })).json()
  assert.equal(status.languages[0].gaps.some((gap: { improved: string }) => gap.improved.includes('despacio')), true)
  assert.equal((await app.inject({ method: 'GET', url: '/api/usage?offset=0' })).json().tasks.some((item: { task: string }) => item.task === 'review'), true)

  // Sent twice, it is answered once.
  const repeated = await app.inject({ method: 'POST', url: `/api/live/${again.id}/debrief`, payload: { stuck: ['again'] } })
  assert.equal(repeated.json().outcome.gaps.length, 1)
  assert.equal(bodies.length, 1)
  const listed = (await app.inject({ method: 'GET', url: '/api/live' })).json()
  assert.equal(listed.current, null)
  assert.equal(listed.past[0].id, again.id)

  // Taking the session away takes what it wrote with it.
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/live/${again.id}` })).json().deleted, true)
  assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM learning_events WHERE message_id = ?').get(`live:${again.id}`)!.count, 0)
})

test('a debrief with nothing written asks no model; one the model answers badly is not saved half done', async () => {
  await configure()
  bodies = []
  const empty = (await app.inject({ method: 'POST', url: '/api/live' })).json()
  const nothing = await app.inject({ method: 'POST', url: `/api/live/${empty.id}/debrief`, payload: { used: [true] } })
  assert.equal(nothing.statusCode, 200, nothing.body)
  assert.equal(bodies.length, 0)
  assert.deepEqual([nothing.json().outcome.gaps, nothing.json().outcome.errors], [[], []])

  // The wording offered is not in the language being learned: the learner is told, and their note is not dropped quietly.
  answer = () => JSON.stringify({ said: [{ index: 0, improved: '请说慢一点' }], corrected: [] })
  const next = (await app.inject({ method: 'POST', url: '/api/live' })).json()
  const refused = await app.inject({ method: 'POST', url: `/api/live/${next.id}/debrief`, payload: { stuck: ['Speak slowly please'] } })
  assert.equal(refused.statusCode, 502, refused.body)
  assert.equal((await app.inject({ method: 'GET', url: '/api/live' })).json().current.id, next.id)
  assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM learning_events WHERE message_id = ?').get(`live:${next.id}`)!.count, 0)

  // A correction is the other person's and stays, under no particular kind when the model names none there is.
  answer = () => JSON.stringify({ said: [], corrected: [{ index: 0, category: 'spelling-ish', explanation: '' }] })
  const poor = await app.inject({ method: 'POST', url: `/api/live/${next.id}/debrief`, payload: { corrected: [{ said: 'Tengo veinte anos', right: 'Tengo veinte años' }] } })
  assert.equal(poor.statusCode, 200, poor.body)
  assert.deepEqual(poor.json().outcome.gaps, [])
  assert.deepEqual(poor.json().outcome.errors, [{ original: 'Tengo veinte anos', improved: 'Tengo veinte años', explanation: '', category: 'other' }])
})

test('memories written out can be taken in again, by another learner too', async () => {
  await configure()
  const saved = await app.inject({ method: 'POST', url: '/api/memories', payload: { key: 'home city', value: 'Lives in Chengdu', memoryType: 'profile', interfaceLocale: 'en-US' } })
  assert.equal(saved.statusCode, 200, saved.body)
  const exported = (await app.inject({ method: 'GET', url: '/api/memories/export' })).json()
  assert.equal(exported.format, 'yujian-memories')
  const count = exported.memories.length
  assert.equal(count >= 1, true)

  // Into the same memory: nothing is doubled.
  const same = (await app.inject({ method: 'POST', url: '/api/memories/import', payload: exported })).json()
  assert.deepEqual(same, { added: 0, updated: count, skipped: 0 })

  // Into another learner's, which has none.
  const other = (await app.inject({ method: 'POST', url: '/api/profiles', payload: { name: 'Second' } })).json()
  await app.inject({ method: 'POST', url: `/api/profiles/${other.id}/activate` })
  assert.equal((await app.inject({ method: 'GET', url: '/api/memories' })).json().length, 0)
  const taken = (await app.inject({ method: 'POST', url: '/api/memories/import', payload: { ...exported, memories: [...exported.memories, { key: '', value: 'x' }, { key: 'k', value: 'v', kind: 'no-such-kind' }] } })).json()
  assert.deepEqual(taken, { added: count, updated: 0, skipped: 2 })
  const there = (await app.inject({ method: 'GET', url: '/api/memories' })).json()
  assert.equal(there.some((memory: { key: string; value: string }) => memory.key === 'home city' && memory.value === 'Lives in Chengdu'), true)

  assert.equal((await app.inject({ method: 'POST', url: '/api/memories/import', payload: { format: 'something-else', memories: [] } })).json().code, 'MEMORY_IMPORT_INVALID')
  assert.equal((await app.inject({ method: 'POST', url: '/api/memories/import', payload: { format: 'yujian-memories' } })).statusCode, 400)
  await app.inject({ method: 'POST', url: '/api/profiles/default/activate' })
})

test('another device gets in only at this computer\'s own address, with the code, once the learner has opened the app to the network', async () => {
  await configure()
  const device = { remoteAddress: '192.168.1.20' }
  const host = { host: 'yujian-test.lan:4174' }
  assert.equal(lanHosts().includes('yujian-test.lan'), true)
  assert.deepEqual(lanHosts({}, 'My-Mac.local', ''), ['my-mac.local'])
  assert.deepEqual(lanHosts({ en0: [{ address: '192.168.1.5', family: 'IPv4', internal: false }, { address: '8.8.8.8', family: 'IPv4', internal: false }, { address: '10.0.0.2', family: 'IPv4', internal: true }] } as never, 'host', ''), ['192.168.1.5'])
  assert.deepEqual([isPrivateIpv4('10.1.2.3'), isPrivateIpv4('172.20.0.1'), isPrivateIpv4('172.32.0.1'), isPrivateIpv4('192.169.0.1'), isPrivateIpv4('nope')], [true, true, false, false, false])
  assert.equal(/^[A-HJKMNP-Z2-9]{8}$/u.test(newAccessCode()), true)

  // Off: nothing is served to the network, whatever is sent.
  assert.equal((await app.inject({ method: 'GET', url: '/api/settings', headers: host, ...device })).statusCode, 403)
  assert.equal((await app.inject({ method: 'POST', url: '/api/lan/enter', headers: host, payload: { code: 'AAAAAAAA' }, ...device })).statusCode, 403)
  const off = (await app.inject({ method: 'GET', url: '/api/lan' })).json()
  assert.deepEqual([off.enabled, off.code], [false, ''])

  // Switched on from the computer itself.
  const on = (await app.inject({ method: 'PUT', url: '/api/lan', payload: { enabled: true } })).json()
  assert.equal(on.enabled, true)
  assert.equal(on.listening, false)
  assert.equal(/^[A-HJKMNP-Z2-9]{8}$/u.test(on.code), true)
  assert.equal(on.addresses.includes('http://yujian-test.lan:4174'), true)
  assert.equal((await getConfig()).server.lan, true)

  // An address that is not this computer's, or a page from another site, is turned away.
  assert.equal((await app.inject({ method: 'GET', url: '/', headers: { host: 'evil.example:4174' }, ...device })).statusCode, 403)
  assert.equal((await app.inject({ method: 'GET', url: '/', headers: { host: '127.0.0.1:4174' }, ...device })).statusCode, 403)
  assert.equal((await app.inject({ method: 'GET', url: '/api/settings', headers: { ...host, origin: 'http://evil.example' }, ...device })).statusCode, 403)

  // Without the code: the page that asks for it, in the interface language, and nothing from the API.
  const page = await app.inject({ method: 'GET', url: '/', headers: host, ...device })
  assert.equal(page.statusCode, 401)
  assert.equal(String(page.headers['content-type']).startsWith('text/html'), true)
  assert.equal(page.body.includes('访问码'), true)
  const closed = await app.inject({ method: 'GET', url: '/api/settings', headers: host, ...device })
  assert.deepEqual([closed.statusCode, closed.json().code], [401, 'LAN_CODE_REQUIRED'])

  const wrong = await app.inject({ method: 'POST', url: '/api/lan/enter', headers: host, payload: { code: 'WRONGWRONG' }, ...device })
  assert.deepEqual([wrong.statusCode, wrong.json().code], [401, 'LAN_CODE_WRONG'])
  // Typed in lower case with a space in the middle, as people do.
  const entered = await app.inject({ method: 'POST', url: '/api/lan/enter', headers: host, payload: { code: `${on.code.slice(0, 4).toLowerCase()} ${on.code.slice(4)}` }, ...device })
  assert.equal(entered.statusCode, 200, entered.body)
  const cookie = String(entered.headers['set-cookie']).split(';')[0]
  assert.equal(String(entered.headers['set-cookie']).includes('HttpOnly'), true)
  assert.equal(cookie.includes(on.code), false)

  const open = await app.inject({ method: 'GET', url: '/api/settings', headers: { ...host, cookie }, ...device })
  assert.equal(open.statusCode, 200, open.body)
  // Opening and closing the door is done at the computer.
  assert.equal((await app.inject({ method: 'GET', url: '/api/lan', headers: { ...host, cookie }, ...device })).json().code, 'LAN_LOCAL_ONLY')
  assert.equal((await app.inject({ method: 'PUT', url: '/api/lan', headers: { ...host, cookie }, payload: { enabled: false }, ...device })).statusCode, 403)

  // A new code turns the device away again.
  const renewed = (await app.inject({ method: 'POST', url: '/api/lan/code' })).json()
  assert.notEqual(renewed.code, on.code)
  assert.equal((await app.inject({ method: 'GET', url: '/api/settings', headers: { ...host, cookie }, ...device })).statusCode, 401)

  // Guessing is cut short, for that device only.
  const guesser = { remoteAddress: '192.168.1.66' }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/lan/enter', headers: host, payload: { code: 'AAAAAAAA' }, ...guesser })).statusCode, 401)
  }
  assert.equal((await app.inject({ method: 'POST', url: '/api/lan/enter', headers: host, payload: { code: renewed.code }, ...guesser })).statusCode, 429)
  assert.equal((await app.inject({ method: 'POST', url: '/api/lan/enter', headers: host, payload: { code: renewed.code }, ...device })).statusCode, 200)

  // Switched off: the cookie no longer opens anything, and this computer is served as before.
  await app.inject({ method: 'PUT', url: '/api/lan', payload: { enabled: false } })
  assert.equal((await app.inject({ method: 'GET', url: '/api/settings', headers: { ...host, cookie }, ...device })).statusCode, 403)
  assert.equal((await app.inject({ method: 'GET', url: '/api/settings' })).statusCode, 200)

  for (const locale of UI_LOCALES) {
    const html = entryPage(locale)
    assert.equal(html.includes('<form') && html.includes('/api/lan/enter'), true, locale)
  }
  assert.equal(entryPage('ja-JP').includes('アクセスコード'), true)
})

test('the variety and the register chosen reach the prompts, and wording right elsewhere is not counted as a mistake', async () => {
  assert.deepEqual(variantsFor('es-419'), ['es-419', 'es-ES', 'es-MX', 'es-AR'])
  assert.deepEqual(variantsFor('ja'), [])
  assert.equal(normalizeVariant('es', 'es-AR'), 'es-AR')
  assert.equal(normalizeVariant('es', 'pt-BR'), '')
  assert.equal(normalizeVariant('ja', 'ja-JP'), '')
  assert.equal(normalizeRegister('formal'), 'formal')
  assert.equal(normalizeRegister('shouting'), 'neutral')
  assert.equal(variantPromptName('es', 'es-AR'), 'Spanish as used in Argentina')
  assert.equal(variantPromptName('es', ''), '')
  assert.equal(variantRegionName('en-GB', 'zh-CN'), '英国')
  assert.equal(speechVariant('pt', 'pt-PT'), 'pt-PT')
  assert.equal(speechVariant('es', 'es-419'), '')

  const plain = await configure()
  const usual = turnAnalysisSystem(plain, false)
  assert.equal(usual.includes('certainty is sure when'), true)
  assert.equal(usual.includes('correct in another regional variety of the language is not an error; never report it as one.'), true)
  assert.equal(usual.includes('The learner is learning Spanish as used in'), false)

  const chosen = await configure({ variant: 'es-AR', register: 'formal' })
  const prompt = turnAnalysisSystem(chosen, false)
  assert.equal(prompt.includes('The learner is learning Spanish as used in Argentina.'), true)
  assert.equal(prompt.includes('report it with certainty=either'), true)
  assert.equal(prompt.includes('A correct sentence in a different register is not an error either'), true)

  // How sure the model was comes through; a reply that does not say is taken as sure.
  const analysis = normalizeTurnAnalysis({
    languageMatch: 'target', reconstruction: null,
    corrections: [
      { original: 'coche', improved: 'auto', explanation: 'Both are right.', severity: 'minor', category: 'word_choice', certainty: 'either' },
      { original: 'la problema', improved: 'el problema', explanation: 'Masculine.', severity: 'naturalness', category: 'agreement' },
      { original: 'mañana', improved: 'por la mañana', explanation: 'Perhaps.', severity: 'minor', category: 'phrasing', certainty: 'perhaps' },
    ],
  }, 'Tengo la problema con mi coche mañana')
  assert.deepEqual(analysis.corrections.map((item) => item.certainty), ['either', 'sure', 'sure'])
  assert.deepEqual([normalizeCertainty('unsure'), countsAsError({ certainty: 'unsure' }), countsAsError({ certainty: 'either' }), countsAsError({})], ['unsure', false, false, true])

  // Only what is surely a mistake goes into the learning record.
  const talk = conversation()
  recordLearningEvents({
    targetLanguageCode: 'es', conversationId: talk, messageId: 'variety-message', reconstruction: null, at: '2026-11-20T10:00:00.000Z',
    corrections: [
      { original: 'coche', improved: 'auto', explanation: '', severity: 'minor', category: 'word_choice', certainty: 'either' },
      { original: 'mañana', improved: 'por la mañana', explanation: '', severity: 'minor', category: 'phrasing', certainty: 'unsure' },
      { original: 'la problema', improved: 'el problema', explanation: '', severity: 'naturalness', category: 'agreement', certainty: 'sure' },
    ],
  })
  assert.deepEqual(database.db.prepare("SELECT original FROM learning_events WHERE message_id = 'variety-message'").all().map((item) => item.original), ['la problema'])
})

test('the few minutes at the end of the day open in every language that can be learned', () => {
  for (const language of TARGET_LANGUAGES) {
    assert.equal(bedtimeOpening(language.code).length > 0, true, language.code)
    assert.equal(bedtimeOpening(language.code, '', 'formal').length > 0, true, language.code)
  }
  assert.equal(bedtimeOpening('de'), 'Wie war dein Tag?')
  assert.equal(bedtimeOpening('de', '', 'formal'), 'Wie war Ihr Tag?')
  assert.equal(bedtimeOpening('pt', 'pt-PT'), 'Como foi o teu dia?')
  assert.equal(bedtimeOpening('zh-TW', 'zh-TW').includes('過'), true)
  assert.equal(bedtimeOpening('tlh'), '')
  assert.equal(BEDTIME_RULE.includes('good night'), true)
})
