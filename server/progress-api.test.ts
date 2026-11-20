import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-progress-api-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'
process.env.LLC_LAN_HOSTS = 'yujian-test.lan'

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
