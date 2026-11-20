import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-placement-api-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'

type Stage = 'items' | 'grade' | 'other'
interface ModelCall { stage: Stage; host: string; body: string; kind: 'reading' | 'listening'; levels: string[]; ids: string[] }

let answer: (call: ModelCall) => string = () => '{}'
let calls: ModelCall[] = []

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  const body = String(init.body || '')
  const stage: Stage = body.includes('Write placement test items') ? 'items' : body.includes('Grade a placement test') ? 'grade' : 'other'
  // The request is JSON inside JSON, so quotes arrive escaped.
  const plain = body.replaceAll('\\"', '"')
  const levels = [...(plain.match(/"levels":\[([^\]]*)\]/u)?.[1] || '').matchAll(/[ABC][12]/gu)].map((match) => match[0])
  const call: ModelCall = {
    stage, host: url.hostname, body, levels,
    kind: plain.includes('"kind":"listening"') ? 'listening' : 'reading',
    ids: [...new Set([...plain.matchAll(/"id":"(answer-\d+)"/gu)].map((match) => match[1]))],
  }
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
const { CEFR_LEVELS, stepOf, stepParts } = await import('../shared/proficiency.js')
const { TARGET_LANGUAGES, UI_LOCALES } = await import('../shared/locales.js')
const { textLength } = await import('./proficiency-text.js')
const {
  expressionBand, expressionCeiling, expressionTaskAt, itemLevel, itemProblems, itemSpec, levelsToPrepare, placementPlan, shuffleItem,
} = await import('./placement.js')
const { EXPRESSION_QUESTIONS } = await import('./ai/placement.js')

const models = { openai: 'gpt-4.1', anthropic: 'claude-sonnet-5-5', gemini: 'gemini-3-pro', deepseek: 'deepseek-chat', kimi: 'kimi-k3' } as const
type ProviderId = keyof typeof models
const providerIds = Object.keys(models) as ProviderId[]

async function useProvider(id: ProviderId, learning: Partial<(typeof defaultConfig)['learning']> = {}, setupComplete = true) {
  const config = structuredClone(defaultConfig)
  config.setupComplete = setupComplete
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

// Three plain sentences per language, repeated until a text is as long as its level asks.
const sentences: Record<string, string[]> = {
  en: ['I go to the shop with my friend.', 'We buy bread and milk for the week.', 'Then we walk home and make dinner.'],
  es: ['Voy a la tienda con mi amigo.', 'Compramos pan y leche para la semana.', 'Luego vamos a casa y hacemos la cena.'],
  fr: ['Je vais au magasin avec mon ami.', 'Nous achetons du pain et du lait.', 'Puis nous rentrons à la maison pour manger.'],
  ja: ['私は友達と店に行きます。', 'パンと牛乳を買います。', 'それから家に帰ってご飯を作ります。'],
  de: ['Ich gehe mit meinem Freund in den Laden.', 'Wir kaufen Brot und Milch für die Woche.', 'Dann gehen wir nach Hause und machen Essen.'],
  ko: ['나는 친구와 가게에 갑니다.', '우리는 빵과 우유를 삽니다.', '그리고 집에 가서 저녁을 만듭니다.'],
  it: ['Vado al negozio con il mio amico.', 'Compriamo pane e latte per la settimana.', 'Poi andiamo a casa e facciamo la cena.'],
  zh: ['我和朋友去商店。', '我们买面包和牛奶。', '然后我们回家做晚饭。'],
  pt: ['Eu vou à loja com o meu amigo.', 'Nós compramos pão e leite para a semana.', 'Depois vamos para casa e fazemos o jantar.'],
  hi: ['मैं अपने दोस्त के साथ दुकान जाता हूँ।', 'हम रोटी और दूध खरीदते हैं।', 'फिर हम घर जाकर खाना बनाते हैं।'],
}

const choices: Record<string, { question: string; options: string[] }> = {
  'zh-CN': { question: '这段话说了什么？', options: ['他们去了商店。', '他们在家睡觉。', '他们去上班了。', '他们在看电影。'] },
  'en-US': { question: 'What does the text say?', options: ['They went to the shop.', 'They slept at home.', 'They went to work.', 'They watched a film.'] },
  'es-419': { question: '¿Qué dice el texto?', options: ['Fueron a la tienda.', 'Durmieron en casa.', 'Fueron al trabajo.', 'Vieron una película.'] },
  'fr-FR': { question: 'Que dit le texte ?', options: ['Ils sont allés au magasin.', 'Ils ont dormi à la maison.', 'Ils sont allés au travail.', 'Ils ont regardé un film.'] },
  'ja-JP': { question: 'この文章は何について書いていますか。', options: ['店に行きました。', '家で寝ました。', '仕事に行きました。', '映画を見ました。'] },
  'de-DE': { question: 'Was steht im Text?', options: ['Sie sind in den Laden gegangen.', 'Sie haben zu Hause geschlafen.', 'Sie sind zur Arbeit gegangen.', 'Sie haben einen Film gesehen.'] },
  'ko-KR': { question: '이 글은 무엇을 말합니까?', options: ['가게에 갔습니다.', '집에서 잤습니다.', '일하러 갔습니다.', '영화를 봤습니다.'] },
  'it-IT': { question: 'Che cosa dice il testo?', options: ['Sono andati al negozio.', 'Hanno dormito a casa.', 'Sono andati al lavoro.', 'Hanno visto un film.'] },
  'pt-BR': { question: 'O que o texto diz?', options: ['Eles foram à loja.', 'Eles dormiram em casa.', 'Eles foram ao trabalho.', 'Eles viram um filme.'] },
  'hi-IN': { question: 'यह पाठ क्या कहता है?', options: ['वे दुकान गए।', 'वे घर पर सोए।', 'वे काम पर गए।', 'उन्होंने फ़िल्म देखी।'] },
}

let written = 0
function passage(code: string, level: string, kind: 'reading' | 'listening') {
  const spec = itemSpec(level as any, kind, code)
  const pool = sentences[code]
  written += 1
  let value = ''
  for (let index = 0; textLength(value, code) < spec.minLength; index += 1) value += (value ? ' ' : '') + pool[(written + index) % pool.length]
  return value
}

function itemsFor(code: string, locale: string) {
  return (call: ModelCall) => JSON.stringify({
    items: call.levels.map((level) => ({ level, text: passage(code, level, call.kind), ...choices[locale], answer: 0 })),
  })
}

const spoken = 'Yesterday I went to the market with my sister and we bought some bread, because we wanted to cook dinner for our parents at home.'

function gradeAnswer(level = 'B1', part = 'mid') {
  return (call: ModelCall) => JSON.stringify({
    answers: call.ids.map((id) => ({ id, level, part, vocabulary: level, grammar: 'A2' })),
    evidence: [
      { quote: 'we wanted to cook dinner for our parents', comment: '你能用 because 把原因说清楚。' },
      { quote: 'this sentence was never written', comment: '这条依据不是你的原话。' },
      { quote: 'Yesterday I went to the market', comment: 'You can talk about the past.' },
    ],
  })
}

function model(code = 'en', locale = 'zh-CN', grade = gradeAnswer()) {
  return (call: ModelCall) => call.stage === 'items' ? itemsFor(code, locale)(call) : call.stage === 'grade' ? grade(call) : '{}'
}

function reset() {
  db.exec(`DELETE FROM proficiency_profiles; DELETE FROM proficiency_history; DELETE FROM placement_sessions; DELETE FROM placement_items;
    DELETE FROM app_flags WHERE key = 'proficiency_seeded';`)
  calls = []
}

function stored(question: { text?: string; options?: string[] }) {
  const items = db.prepare('SELECT id, level, kind, item_json FROM placement_items').all() as Array<{ id: string; level: string; kind: string; item_json: string }>
  const found = items.find((item) => {
    const value = JSON.parse(item.item_json)
    return value.text === question.text && JSON.stringify(value.options) === JSON.stringify(question.options)
  })
  assert.ok(found, 'the question comes from the stored items')
  return { ...found, item: JSON.parse(found.item_json) as { answer: number; options: string[] } }
}

async function start(payload: Record<string, unknown> = {}) {
  const response = await app.inject({ method: 'POST', url: '/api/placement', payload: { interfaceLocale: 'zh-CN', ...payload } })
  assert.equal(response.statusCode, 200, response.body)
  return response.json()
}

async function reply(sessionId: string, payload: Record<string, unknown>) {
  const response = await app.inject({ method: 'POST', url: `/api/placement/${sessionId}/answer`, payload })
  assert.equal(response.statusCode, 200, response.body)
  return response.json()
}

async function finish(sessionId: string) {
  const response = await app.inject({ method: 'POST', url: `/api/placement/${sessionId}/finish` })
  assert.equal(response.statusCode, 200, response.body)
  return response.json().result
}

/** Answers every question: choices right or wrong as told, open questions with the given text. */
async function take(progress: any, options: { right: (index: number, level: string) => boolean; text?: string; stopAfter?: number }) {
  const seen: Array<{ kind: string; level?: string; task?: string; band?: string }> = []
  let current = progress
  while (current.question && (options.stopAfter === undefined || seen.length < options.stopAfter)) {
    const question = current.question
    if (question.kind === 'expression') {
      seen.push({ kind: question.kind, task: question.task, band: question.band })
      current = await reply(current.sessionId, { questionId: question.id, text: options.text ?? spoken })
    } else {
      const item = stored(question)
      seen.push({ kind: question.kind, level: item.level })
      const right = options.right(seen.length - 1, item.level)
      current = await reply(current.sessionId, { questionId: question.id, choice: right ? item.item.answer : (item.item.answer + 1) % 4 })
    }
  }
  return { seen, progress: current }
}

test.after(async () => {
  await app.close()
  db.close()
  await rm(dataDir, { recursive: true, force: true })
})

test('the order of a test, with and without a voice to read aloud', () => {
  assert.deepEqual(placementPlan('full', true), ['reading', 'reading', 'listening', 'reading', 'reading', 'listening', 'reading', 'expression', 'expression', 'expression'])
  assert.equal(placementPlan('full', false).filter((kind) => kind === 'reading').length, 7)
  assert.equal(placementPlan('full', false).length, 10)
  assert.deepEqual(placementPlan('quick', true), ['reading', 'reading', 'listening', 'reading', 'expression'])
  assert.equal(placementPlan('quick', false).includes('listening'), false)
  assert.deepEqual([0, 1, 2].map((position) => expressionTaskAt('full', position)), ['recent', 'opinion', 'hypothetical'])
  assert.equal(expressionTaskAt('quick', 0), 'opinion')
  assert.deepEqual([stepOf('A1'), stepOf('A2', 'high'), stepOf('B1', 'low'), stepOf('B2', 'high'), stepOf('C1', 'low'), stepOf('C2')].map(expressionBand), ['low', 'low', 'mid', 'mid', 'high', 'high'])
  // Every open question has wording for the grader.
  for (const task of ['recent', 'opinion', 'hypothetical'] as const) for (const band of ['low', 'mid', 'high'] as const) assert.ok(EXPRESSION_QUESTIONS[task][band].length > 10)
})

test('the level of the next question follows the running estimate', () => {
  assert.equal(itemLevel(stepOf('B1'), 'full', stepOf('A2')), 'B1')
  assert.equal(itemLevel(-1, 'full', stepOf('A2')), 'A1')
  assert.equal(itemLevel(30, 'full', stepOf('A2')), 'C2')
  // A short check stays within one level of where it started.
  assert.equal(itemLevel(stepOf('C2'), 'quick', stepOf('B1')), 'B2')
  assert.equal(itemLevel(stepOf('A1'), 'quick', stepOf('B1')), 'A2')
  assert.deepEqual(levelsToPrepare('B1'), ['B1', 'B2', 'A2'])
  assert.deepEqual(levelsToPrepare('A1'), ['A1', 'A2', 'B1'])
  assert.deepEqual(levelsToPrepare('C2'), ['C2', 'C1', 'B2'])
  assert.deepEqual(levelsToPrepare('B1', 1), ['B1'])
})

test('what an item has to look like grows with the level, in every language', () => {
  for (const language of TARGET_LANGUAGES) {
    for (const kind of ['reading', 'listening'] as const) {
      const specs = CEFR_LEVELS.map((level) => itemSpec(level, kind, language.code))
      for (let index = 1; index < specs.length; index += 1) {
        assert.ok(specs[index].minLength > specs[index - 1].minLength, `${language.code} ${kind} ${specs[index].level}`)
        assert.ok(specs[index].maxLength > specs[index - 1].maxLength)
        assert.ok(specs[index].maxSentenceLength >= specs[index - 1].maxSentenceLength)
      }
      assert.equal(specs[0].unit, language.code === 'zh' || language.code === 'ja' ? 'characters' : 'words')
    }
    // The sample text used in these tests is accepted at every level in every language.
    for (const level of CEFR_LEVELS) {
      const item = { text: passage(language.code, level, 'reading'), ...choices['en-US'], answer: 2 }
      assert.deepEqual(itemProblems(item, itemSpec(level, 'reading', language.code), language.code), [], `${language.code} ${level}`)
    }
  }
})

test('an item with a flaw is found', () => {
  const spec = itemSpec('A2', 'reading', 'en')
  const good = { text: passage('en', 'A2', 'reading'), ...choices['en-US'], answer: 1 }
  assert.deepEqual(itemProblems(good, spec, 'en'), [])
  assert.deepEqual(itemProblems({ ...good, options: good.options.slice(0, 3) }, spec, 'en'), ['options'])
  assert.deepEqual(itemProblems({ ...good, options: ['Yes.', 'yes', 'No.', 'Maybe.'] }, spec, 'en'), ['options'])
  assert.deepEqual(itemProblems({ ...good, options: ['Yes.', '', 'No.', 'Maybe.'] }, spec, 'en'), ['options'])
  assert.deepEqual(itemProblems({ ...good, answer: 4 }, spec, 'en'), ['answer'])
  assert.deepEqual(itemProblems({ ...good, answer: 1.5 }, spec, 'en'), ['answer'])
  assert.deepEqual(itemProblems({ ...good, text: 'I go home.' }, spec, 'en'), ['length'])
  assert.deepEqual(itemProblems({ ...good, text: Array.from({ length: 30 }, () => sentences.en[0]).join(' ') }, spec, 'en'), ['length'])
  assert.deepEqual(itemProblems({ ...good, question: ' ' }, spec, 'en'), ['empty'])
  const long = 'I go to the shop with my friend and then we buy bread and milk and eggs and tea and rice and fish for the whole week at home.'
  assert.deepEqual(itemProblems({ ...good, text: long + ' ' + sentences.en[1] }, spec, 'en'), ['sentence_length'])
  const hard = 'The committee ratified the ordinance notwithstanding protracted deliberation. Ideological rifts jeopardised the fragile consensus. Stakeholders scrutinised every amendment relentlessly. Nobody conceded anything whatsoever.'
  assert.ok(itemProblems({ ...good, text: hard }, spec, 'en').includes('vocabulary'))
  // The same text is fine for a reader at C2.
  assert.equal(itemProblems({ ...good, text: Array.from({ length: 4 }, () => hard).join(' ') }, itemSpec('C2', 'reading', 'en'), 'en').includes('vocabulary'), false)
})

test('shuffling keeps the right answer right', () => {
  const item = { text: 'x', question: 'y', options: ['a', 'b', 'c', 'd'], answer: 2 }
  const positions = new Set<number>()
  for (let seed = 0; seed < 40; seed += 1) {
    let state = seed
    const shuffled = shuffleItem(item, () => { state = (state * 9301 + 49297) % 233280; return state / 233280 })
    assert.equal(shuffled.options[shuffled.answer], 'c')
    assert.deepEqual([...shuffled.options].sort(), ['a', 'b', 'c', 'd'])
    positions.add(shuffled.answer)
  }
  assert.equal(positions.size, 4)
})

test('a short answer cannot be given a high level', () => {
  assert.equal(expressionCeiling('I like tea.', 'en'), stepOf('A1', 'high'))
  assert.equal(expressionCeiling('I like tea because it is warm and good.', 'en'), stepOf('A2', 'high'))
  assert.equal(expressionCeiling(spoken, 'en'), stepOf('B2', 'high'))
  assert.equal(expressionCeiling(Array.from({ length: 4 }, () => spoken).join(' '), 'en'), stepOf('C2', 'high'))
  // Chinese and Japanese are measured in characters.
  assert.equal(expressionCeiling('我喜欢喝茶。', 'zh'), stepOf('A1', 'high'))
  assert.equal(expressionCeiling('我喜欢喝茶，因为茶很好喝。', 'zh'), stepOf('A2', 'high'))
})

test('a full test: questions adapt, answers stay on the server, and the result becomes the level', async () => {
  reset()
  await useProvider('openai')
  answer = model()
  const first = await start()
  assert.equal(first.total, 10)
  assert.equal(first.index, 0)
  assert.equal(first.mode, 'full')
  assert.equal(first.languageCode, 'en')
  assert.equal(first.done, false)
  assert.deepEqual(Object.keys(first.question).sort(), ['id', 'kind', 'options', 'question', 'text'])
  assert.equal(first.question.options.length, 4)
  // With no level on record the test starts at A2.
  assert.equal(stored(first.question).level, 'A2')
  assert.deepEqual(calls[0].levels, ['A2', 'B1', 'A1'])

  const { seen, progress } = await take(first, { right: () => true })
  assert.deepEqual(seen.map((item) => item.kind), placementPlan('full', false))
  const levels = seen.filter((item) => item.kind === 'reading').map((item) => item.level!)
  assert.equal(levels[0], 'A2')
  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(CEFR_LEVELS.indexOf(levels[index] as any) >= CEFR_LEVELS.indexOf(levels[index - 1] as any), 'right answers never lead to an easier question')
  }
  // Seven right answers from A2 reach the top two levels; each step is smaller than the last.
  assert.equal(levels.at(-1), 'C1')
  assert.ok(new Set(levels).size >= 4)
  // Open questions are pitched where the choices ended up, from the concrete to the abstract.
  assert.deepEqual(seen.filter((item) => item.kind === 'expression').map((item) => [item.task, item.band]), [['recent', 'high'], ['opinion', 'high'], ['hypothetical', 'high']])
  assert.equal(progress.done, true)
  assert.equal(progress.question, null)
  assert.equal(progress.index, 10)

  const result = await finish(first.sessionId)
  assert.equal(stage('grade').length, 1)
  assert.equal(result.partial, false)
  assert.equal(result.answered, 10)
  assert.equal(result.previousStep, null)
  assert.equal(result.parts.listening, null)
  assert.ok(result.parts.reading >= stepOf('C1', 'low'))
  assert.equal(result.parts.expression, stepOf('B1'))
  // Reading well and writing at B1 lands in between, closer to the writing.
  assert.ok(result.step > stepOf('B1') && result.step < result.parts.reading)
  assert.equal(result.skills.grammar, stepOf('A2'))
  assert.equal(result.skills.vocabulary, stepOf('B1'))
  // Understanding and expression are far apart, so the result is not held with confidence.
  assert.equal(result.confidence, 'medium')
  // Only evidence that quotes the learner, with a comment in the interface language, is kept.
  assert.deepEqual(result.evidence, [{ quote: 'we wanted to cook dinner for our parents', comment: '你能用 because 把原因说清楚。' }])
  assert.equal(result.profile.source, 'test')
  assert.equal(result.profile.step, result.step)
  assert.equal(result.profile.workingStep, result.step)

  const overview = (await app.inject({ method: 'GET', url: '/api/proficiency' })).json()
  assert.equal(overview.profile.step, result.step)
  assert.equal(overview.history[0].reason, 'test')
  assert.equal(overview.history[0].evidence.answered, 10)
  assert.equal(overview.history[0].evidence.expression, stepOf('B1'))
  assert.equal(overview.quickCheck, null)

  // Finishing twice gives the same result and does not grade again.
  calls = []
  assert.deepEqual(await finish(first.sessionId), result)
  assert.equal(calls.length, 0)
  const closed = await app.inject({ method: 'POST', url: `/api/placement/${first.sessionId}/answer`, payload: { questionId: 'x', choice: 0 } })
  assert.equal(closed.statusCode, 409)
  assert.equal(closed.json().code, 'PLACEMENT_CLOSED')
  const reopened = (await app.inject({ method: 'GET', url: `/api/placement/${first.sessionId}` })).json()
  assert.equal(reopened.done, true)
  assert.equal(reopened.result.step, result.step)
})

function stage(name: Stage) {
  return calls.filter((call) => call.stage === name)
}

test('wrong answers lead down, and "not sure" counts as wrong', async () => {
  reset()
  await useProvider('openai')
  answer = model('en', 'zh-CN', gradeAnswer('A1', 'high'))
  const first = await start({ startLevel: 'B2' })
  assert.equal(stored(first.question).level, 'B2')
  const { seen } = await take(first, { right: () => false, text: 'I like tea. It is good.' })
  const levels = seen.filter((item) => item.kind === 'reading').map((item) => item.level!)
  assert.equal(levels.at(-1), 'A1')
  assert.deepEqual(seen.filter((item) => item.kind === 'expression').map((item) => item.band), ['low', 'low', 'low'])
  const result = await finish(first.sessionId)
  assert.ok(result.step <= stepOf('A1', 'high'))
  assert.ok(result.parts.reading <= stepOf('A2', 'low'))

  reset()
  const second = await start({ startLevel: 'B1' })
  const unsure = await reply(second.sessionId, { questionId: second.question.id, choice: null })
  assert.equal(unsure.index, 1)
  assert.equal(stored(unsure.question).level, 'A2')
})

test('a repeated or stale answer changes nothing, and a reload returns the same question', async () => {
  reset()
  await useProvider('openai')
  answer = model()
  const first = await start()
  const item = stored(first.question)
  const next = await reply(first.sessionId, { questionId: first.question.id, choice: item.item.answer })
  assert.equal(next.index, 1)
  const repeated = await reply(first.sessionId, { questionId: first.question.id, choice: item.item.answer })
  assert.equal(repeated.index, 1)
  assert.equal(repeated.question.id, next.question.id)
  const reloaded = (await app.inject({ method: 'GET', url: `/api/placement/${first.sessionId}` })).json()
  assert.equal(reloaded.question.id, next.question.id)
  assert.equal(reloaded.result, null)
  assert.equal((await app.inject({ method: 'GET', url: '/api/placement/none' })).statusCode, 404)
})

test('with a voice, two questions are heard instead of read', async () => {
  reset()
  await useProvider('openai')
  answer = model()
  const first = await start({ listening: true })
  const { seen } = await take(first, { right: (index) => index % 2 === 0, stopAfter: 3 })
  assert.deepEqual(seen.map((item) => item.kind), ['reading', 'reading', 'listening'])
  const session = (await app.inject({ method: 'GET', url: `/api/placement/${first.sessionId}` })).json()
  assert.equal(session.index, 3)
  const kinds = (db.prepare('SELECT DISTINCT kind FROM placement_items ORDER BY kind').all() as Array<{ kind: string }>).map((item) => item.kind)
  assert.deepEqual(kinds, ['listening', 'reading'])
  // A heard question says how fast to read it; a read one does not.
  const heard = db.prepare("SELECT state_json FROM placement_sessions WHERE id = ?").get(first.sessionId) as { state_json: string }
  assert.equal(JSON.parse(heard.state_json).answers[2].kind, 'listening')
  reset()
  const again = await start({ listening: true, startLevel: 'A1' })
  let current = again
  for (let index = 0; index < 2; index += 1) current = await reply(current.sessionId, { questionId: current.question.id, choice: null })
  assert.equal(current.question.kind, 'listening')
  assert.ok(current.question.speechRateFactor < 0.9)
  assert.ok(current.question.text)
})

test('questions already written are used before new ones are asked for', async () => {
  reset()
  await useProvider('openai')
  answer = model()
  const first = await start()
  await take(first, { right: () => true, stopAfter: 2 })
  const requests = stage('items').length
  const before = (db.prepare('SELECT COUNT(*) AS total FROM placement_items').get() as { total: number }).total
  // A second test starts with what the first left unused at its level.
  calls = []
  const second = await start()
  assert.notEqual(second.sessionId, first.sessionId)
  const used = stored(second.question)
  assert.equal(used.level, 'A2')
  const counts = db.prepare('SELECT use_count FROM placement_items WHERE id = ?').get(used.id) as { use_count: number }
  // Either an unused A2 item was waiting, or exactly one request wrote new ones.
  assert.ok(stage('items').length <= 1)
  assert.ok(counts.use_count >= 1)
  assert.ok(requests >= 1 && before >= 3)
  // The same question is never given twice in one test.
  const { seen } = await take(second, { right: () => false, stopAfter: 7 })
  const state = JSON.parse((db.prepare('SELECT state_json FROM placement_sessions WHERE id = ?').get(second.sessionId) as { state_json: string }).state_json)
  assert.equal(new Set(state.usedItemIds).size, state.usedItemIds.length)
  assert.equal(seen.length, 7)
})

test('an unusable question is asked for again, and the test can be picked up after a failure', async () => {
  reset()
  await useProvider('openai')
  const bad = (call: ModelCall) => JSON.stringify({ items: call.levels.map((level) => ({ level, text: passage('en', level, 'reading'), question: choices['zh-CN'].question, options: ['是', '是', '不是', '不知道'], answer: 0 })) })
  answer = bad
  const failed = await app.inject({ method: 'POST', url: '/api/placement', payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(failed.statusCode, 502, failed.body)
  assert.equal((db.prepare('SELECT COUNT(*) AS total FROM placement_items').get() as { total: number }).total, 0)
  const session = db.prepare("SELECT id FROM placement_sessions WHERE status = 'active'").get() as { id: string }
  // Text in the wrong language, or choices in the wrong language, are turned down too.
  answer = (call) => JSON.stringify({ items: call.levels.map((level) => ({ level, text: passage('es', level, 'reading'), ...choices['zh-CN'], answer: 0 })) })
  assert.equal((await app.inject({ method: 'GET', url: `/api/placement/${session.id}` })).statusCode, 502)
  answer = (call) => JSON.stringify({ items: call.levels.map((level) => ({ level, text: passage('en', level, 'reading'), ...choices['de-DE'], answer: 0 })) })
  assert.equal((await app.inject({ method: 'GET', url: `/api/placement/${session.id}` })).statusCode, 502)
  assert.equal((db.prepare('SELECT COUNT(*) AS total FROM placement_items').get() as { total: number }).total, 0)
  // Once the model answers properly, the same test goes on.
  answer = model()
  const resumed = await app.inject({ method: 'GET', url: `/api/placement/${session.id}` })
  assert.equal(resumed.statusCode, 200, resumed.body)
  assert.equal(resumed.json().index, 0)
  assert.equal(resumed.json().question.options.length, 4)
})

test('the right answer may be given as an index, a letter, or the choice itself', async () => {
  reset()
  await useProvider('openai')
  const forms = ['B', '1', choices['zh-CN'].options[1]]
  answer = (call) => JSON.stringify({ items: call.levels.map((level, index) => ({ level, text: passage('en', level, 'reading'), ...choices['zh-CN'], answer: forms[index % forms.length] })) })
  const first = await start()
  assert.equal(first.question.options.length, 4)
  const items = db.prepare('SELECT item_json FROM placement_items').all() as Array<{ item_json: string }>
  assert.equal(items.length, 3)
  for (const item of items) {
    const value = JSON.parse(item.item_json)
    assert.equal(value.options[value.answer], choices['zh-CN'].options[1])
  }
})

test('stopping early still gives a result, held with low confidence', async () => {
  reset()
  await useProvider('openai')
  answer = model()
  const first = await start()
  await take(first, { right: () => true, stopAfter: 3 })
  calls = []
  const result = await finish(first.sessionId)
  assert.equal(result.partial, true)
  assert.equal(result.answered, 3)
  assert.equal(result.total, 10)
  assert.equal(result.confidence, 'low')
  assert.equal(result.parts.expression, null)
  assert.deepEqual(result.evidence, [])
  // No open answer, so nothing was sent for grading.
  assert.equal(calls.length, 0)
  assert.equal(result.profile.confidence, 'low')
})

test('a test with nothing answered leaves no trace on the level', async () => {
  reset()
  await useProvider('openai')
  answer = model()
  const first = await start()
  assert.equal(await finish(first.sessionId), null)
  const session = db.prepare('SELECT status FROM placement_sessions WHERE id = ?').get(first.sessionId) as { status: string }
  assert.equal(session.status, 'abandoned')
  assert.equal((await app.inject({ method: 'GET', url: '/api/proficiency' })).json().history.length <= 1, true)
  assert.equal((db.prepare("SELECT COUNT(*) AS total FROM proficiency_history WHERE reason = 'test'").get() as { total: number }).total, 0)
})

test('an open answer in another language shows nothing and is not sent for grading', async () => {
  reset()
  await useProvider('openai')
  answer = model()
  const first = await start()
  await take(first, { right: (index) => index < 4, text: '昨天我和姐姐去了市场，我们买了一些面包，因为我们想给爸爸妈妈做晚饭。' })
  calls = []
  const result = await finish(first.sessionId)
  assert.equal(stage('grade').length, 0)
  assert.equal(result.parts.expression, 0)
  assert.ok(result.step < result.parts.reading)
  assert.equal(result.skills.vocabulary, undefined)
})

test('open questions left empty are passed over', async () => {
  reset()
  await useProvider('openai')
  answer = model()
  const first = await start()
  await take(first, { right: () => true, text: '   ' })
  calls = []
  const result = await finish(first.sessionId)
  assert.equal(stage('grade').length, 0)
  assert.equal(result.parts.expression, null)
  assert.equal(result.answered, 7)
  assert.equal(result.confidence, 'low')
  assert.equal(result.partial, false)
})

test('a grade that leaves an answer out is asked for again', async () => {
  reset()
  await useProvider('openai')
  let grades = 0
  answer = (call) => {
    if (call.stage === 'items') return itemsFor('en', 'zh-CN')(call)
    grades += 1
    if (grades === 1) return JSON.stringify({ answers: call.ids.slice(0, 1).map((id) => ({ id, level: 'B1', part: 'mid', vocabulary: 'B1', grammar: 'B1' })), evidence: [] })
    return gradeAnswer('B2', 'low')(call)
  }
  const first = await start()
  await take(first, { right: () => true })
  const result = await finish(first.sessionId)
  assert.equal(grades, 2)
  assert.equal(result.parts.expression, stepOf('B2', 'low'))
})

test('a short check needs a level to start from, stays near it, and nudges rather than replaces', async () => {
  reset()
  await useProvider('openai')
  answer = model('en', 'zh-CN', gradeAnswer('B2', 'mid'))
  // Without a level on record there is nothing to check, so the full test is given.
  assert.equal((await start({ mode: 'quick' })).mode, 'full')
  reset()
  await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { level: 'B1' } })
  const first = await start({ mode: 'quick' })
  assert.equal(first.mode, 'quick')
  assert.equal(first.total, 5)
  const { seen } = await take(first, { right: () => true })
  assert.deepEqual(seen.map((item) => item.kind), placementPlan('quick', false))
  for (const item of seen.filter((entry) => entry.kind === 'reading')) assert.ok(['A2', 'B1', 'B2'].includes(item.level!), item.level)
  assert.deepEqual(seen.at(-1), { kind: 'expression', task: 'opinion', band: 'mid' })
  const result = await finish(first.sessionId)
  assert.equal(result.mode, 'quick')
  assert.equal(result.previousStep, stepOf('B1'))
  // Everything right moves the estimate up, by about half of what the five answers alone would say.
  assert.ok(result.step > stepOf('B1') && result.step <= stepOf('B2', 'low'), String(result.step))
  assert.equal(result.confidence, 'medium')
  const overview = (await app.inject({ method: 'GET', url: '/api/proficiency' })).json()
  assert.equal(overview.history[0].reason, 'quick_check')
})

test('a locked difficulty stays where it is after a test', async () => {
  reset()
  await useProvider('openai')
  answer = model()
  await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { level: 'A2' } })
  await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { locked: true } })
  const first = await start()
  // The test starts from the level on record.
  assert.equal(stored(first.question).level, 'A2')
  await take(first, { right: () => true })
  const result = await finish(first.sessionId)
  assert.ok(result.step > stepOf('A2'))
  assert.equal(result.profile.locked, true)
  assert.equal(result.profile.workingStep, stepOf('A2'))
})

test('first-run setup: the default level is nobody\'s choice until setup is saved', async () => {
  reset()
  await useProvider('openai', {}, false)
  assert.equal((await app.inject({ method: 'GET', url: '/api/proficiency' })).json().profile, null)
  // Choosing to be tested clears the way: nothing is seeded later from the default in settings.
  await app.inject({ method: 'PATCH', url: '/api/proficiency', payload: { clear: true } })
  await useProvider('openai', {}, true)
  assert.equal((await app.inject({ method: 'GET', url: '/api/proficiency' })).json().profile, null)
  answer = model()
  const first = await start()
  assert.equal(stored(first.question).level, 'A2')
})

for (const id of providerIds) {
  test(`${id}: questions are written and open answers graded`, async () => {
    reset()
    await useProvider(id)
    answer = model()
    const first = await start({ listening: true })
    assert.equal(first.question.options.length, 4)
    const items = stage('items')[0].body
    assert.ok(items.includes('Write placement test items for a learner of English'))
    assert.ok(items.includes('Simplified Chinese'))
    assert.ok(items.includes('- A2: the text is 35 to 60 words long'))
    const { seen } = await take(first, { right: (index) => index % 3 !== 2 })
    assert.equal(seen.length, 10)
    assert.equal(seen.filter((item) => item.kind === 'listening').length, 2)
    const result = await finish(first.sessionId)
    const grade = stage('grade')[0].body
    assert.ok(grade.includes('Grade a placement test in English'))
    assert.ok(grade.includes('we wanted to cook dinner'))
    assert.ok(grade.includes('answer-8') && grade.includes('answer-10'))
    assert.equal(result.parts.expression, stepOf('B1'))
    assert.ok(result.parts.listening !== null)
    assert.equal(result.evidence.length, 1)
    assert.equal(stepParts(result.step).level.length, 2)
  })
}

for (const [index, language] of TARGET_LANGUAGES.entries()) {
  const locale = UI_LOCALES[(index + 3) % UI_LOCALES.length]
  test(`${language.code} tested with a ${locale} interface`, async () => {
    reset()
    await useProvider('openai', { targetLanguage: language.name, targetLanguageCode: language.code })
    const comment = choices[locale].question
    answer = (call) => {
      if (call.stage === 'items') return itemsFor(language.code, locale)(call)
      return JSON.stringify({
        answers: call.ids.map((id) => ({ id, level: 'A2', part: 'high', vocabulary: 'A2', grammar: 'A2' })),
        evidence: [{ quote: sentences[language.code][0], comment }],
      })
    }
    const first = await start({ interfaceLocale: locale, listening: true })
    assert.equal(first.languageCode, language.code)
    assert.ok(stage('items')[0].body.includes(`Write placement test items for a learner of ${language.name}`))
    const text = Array.from({ length: 4 }, () => sentences[language.code].join(' ')).join(' ')
    const { seen } = await take(first, { right: (position) => position % 2 === 0, text })
    assert.equal(seen.length, 10)
    const result = await finish(first.sessionId)
    assert.equal(result.languageCode, language.code)
    assert.equal(result.parts.expression, stepOf('A2', 'high'))
    assert.deepEqual(result.evidence, [{ quote: sentences[language.code][0], comment }])
    const overview = (await app.inject({ method: 'GET', url: `/api/proficiency?language=${language.code}` })).json()
    assert.equal(overview.profile.source, 'test')
    // Items are kept apart by the language learned and the interface language.
    const kept = db.prepare('SELECT DISTINCT language_code, interface_locale FROM placement_items').all() as Array<{ language_code: string; interface_locale: string }>
    assert.deepEqual(kept.map((item) => [item.language_code, item.interface_locale]), [[language.code, locale]])
  })
}
