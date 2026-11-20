import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-speech-api-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'

interface Call { url: URL; headers: Record<string, string>; json?: Record<string, any>; form?: FormData }

let calls: Call[] = []
let respond: (call: Call) => Response = () => new Response('{}', { status: 200 })

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

globalThis.fetch = async (input, init = {}) => {
  const call: Call = { url: new URL(String(input)), headers: Object.fromEntries(new Headers(init.headers).entries()) }
  if (init.body instanceof FormData) call.form = init.body
  else if (typeof init.body === 'string') call.json = JSON.parse(init.body) as Record<string, any>
  calls.push(call)
  return respond(call)
}

const { app } = await import('./index.js')
const { db } = await import('./services/database.js')
const { defaultConfig, saveConfigAndSecrets, validateConfig } = await import('./services/config.js')
const { STRUCTURED_CONTRACT_VERSION } = await import('./ai/provider.js')
const { audioProvider } = await import('./ai/audio.js')
const { conversationStats, skillObservations, helpLowersDifficulty, MIN_HEARD_LINES } = await import('./proficiency.js')
const { VOICE_MAX_BYTES, VOICE_SAMPLE_RATE, recognitionLocale, wavSeconds } = await import('../shared/voice.js')
const { stepFromSetting } = await import('./proficiency-store.js')

const models = { openai: 'gpt-4.1', anthropic: 'claude-sonnet-5-5', gemini: 'gemini-3-pro', deepseek: 'deepseek-chat', kimi: 'kimi-k3' } as const
type ProviderId = keyof typeof models

async function useProvider(id: ProviderId | null, learning: Partial<(typeof defaultConfig)['learning']> = {}) {
  const config = structuredClone(defaultConfig)
  config.setupComplete = true
  config.llm.defaultProvider = id || 'openai'
  config.learning = { ...config.learning, targetLanguage: 'Japanese', targetLanguageCode: 'ja', ...learning }
  config.providers = config.providers.map((provider) => provider.id === id ? {
    ...provider,
    enabled: true,
    model: models[id],
    capability: {
      outputMode: 'json_schema' as const,
      conversationReady: true as const,
      lookupReady: true as const,
      baseUrl: provider.baseUrl,
      model: models[id],
      contractVersion: STRUCTURED_CONTRACT_VERSION,
      testedAt: '2026-11-20T00:00:00.000Z',
    },
  } : provider)
  await saveConfigAndSecrets(config, id ? { [`providers.${id}.apiKey`]: 'test-key' } : {})
  calls = []
}

/** A silent recording of the form the page sends. */
function wav(seconds: number) {
  const samples = Math.round(seconds * VOICE_SAMPLE_RATE)
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const tag = (at: number, text: string) => { for (let index = 0; index < text.length; index += 1) bytes[at + index] = text.charCodeAt(index) }
  tag(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); tag(8, 'WAVE'); tag(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, VOICE_SAMPLE_RATE, true); view.setUint32(28, VOICE_SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  tag(36, 'data'); view.setUint32(40, samples * 2, true)
  return bytes
}

const spoken = Buffer.from(wav(2)).toString('base64')

function transcribe(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/speech/transcribe', payload })
}

function remarks(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/speech/remarks', payload })
}

test.after(async () => {
  await app.close()
  db.close()
  await rm(dataDir, { recursive: true, force: true })
})

test('a recording is measured from its header, and each learning language has a locale to recognise', () => {
  assert.equal(wavSeconds(wav(2)), 2)
  assert.equal(wavSeconds(new Uint8Array(10)), -1)
  assert.equal(wavSeconds(new TextEncoder().encode('x'.repeat(80))), -1)
  assert.equal(wav(90).length, VOICE_MAX_BYTES)
  assert.deepEqual(['en', 'es', 'fr', 'ja', 'de', 'ko', 'it', 'zh', 'pt', 'hi'].map(recognitionLocale), ['en-US', 'es-MX', 'fr-FR', 'ja-JP', 'de-DE', 'ko-KR', 'it-IT', 'zh-CN', 'pt-BR', 'hi-IN'])
  assert.equal(recognitionLocale('pt-BR'), 'pt-BR')
  assert.equal(recognitionLocale('es-419'), 'es-MX')
})

test('only OpenAI and Gemini take recordings', async () => {
  assert.deepEqual((['openai', 'gemini', 'anthropic', 'deepseek', 'kimi'] as const).map((kind) => audioProvider({ id: kind, kind })), ['openai', 'gemini', null, null, null])
  assert.equal(audioProvider({ id: 'custom', kind: 'openai' }), null)
  const expected: Array<[ProviderId | null, unknown]> = [
    ['openai', { modelAudio: true, provider: 'openai' }],
    ['gemini', { modelAudio: true, provider: 'gemini' }],
    ['anthropic', { modelAudio: false, provider: null }],
    ['deepseek', { modelAudio: false, provider: null }],
    ['kimi', { modelAudio: false, provider: null }],
    [null, { modelAudio: false, provider: null }],
  ]
  for (const [id, capabilities] of expected) {
    await useProvider(id)
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/speech/capabilities' })).json(), capabilities, String(id))
  }
  assert.equal(calls.length, 0)
})

test('what is not a usable recording is turned away before any model is asked', async () => {
  await useProvider('openai')
  const cases: Array<[Record<string, unknown>, number, string]> = [
    [{}, 400, 'SPEECH_AUDIO_INVALID'],
    [{ audio: 'bm90IGEgcmVjb3JkaW5nIGF0IGFsbCwganVzdCBzb21lIHRleHQgdGhhdCBpcyBsb25nIGVub3VnaCB0byBwYXNzIHRoZSBoZWFkZXI=' }, 400, 'SPEECH_AUDIO_INVALID'],
    [{ audio: Buffer.from(wav(0.1)).toString('base64') }, 400, 'SPEECH_TOO_SHORT'],
  ]
  for (const [payload, status, code] of cases) {
    const response = await transcribe(payload)
    assert.deepEqual([response.statusCode, response.json().code], [status, code])
  }
  const noSentence = await remarks({ audio: spoken, sentence: '  ' })
  assert.deepEqual([noSentence.statusCode, noSentence.json().code], [400, 'SPEECH_SENTENCE_INVALID'])
  const longSentence = await remarks({ audio: spoken, sentence: 'a'.repeat(241) })
  assert.equal(longSentence.json().code, 'SPEECH_SENTENCE_INVALID')
  assert.equal(calls.length, 0)
})

test('OpenAI writes down a recording with its speech model, in the language being learned', async () => {
  await useProvider('openai')
  respond = () => jsonResponse({ text: ' きのう公園に行きました。 ' })
  const response = await transcribe({ audio: spoken })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { text: 'きのう公園に行きました。' })
  assert.equal(calls.length, 1)
  const [call] = calls
  assert.equal(call.url.href, 'https://api.openai.com/v1/audio/transcriptions')
  assert.equal(call.headers.authorization, 'Bearer test-key')
  assert.deepEqual([call.form?.get('model'), call.form?.get('language')], ['gpt-4o-mini-transcribe', 'ja'])
  assert.equal((call.form?.get('file') as Blob).size, wav(2).length)

  // The language named with the recording wins when the app teaches it; anything else falls back.
  calls = []
  await transcribe({ audio: spoken, languageCode: 'pt-BR' })
  await transcribe({ audio: spoken, languageCode: 'tlh' })
  assert.deepEqual(calls.map((item) => item.form?.get('language')), ['pt', 'ja'])
})

test('a key without the newer speech model still gets an answer from the older one', async () => {
  await useProvider('openai')
  respond = (call) => call.form?.get('model') === 'whisper-1'
    ? jsonResponse({ text: 'hello there' })
    : jsonResponse({ error: { message: 'The model does not exist or you do not have access to it.' } }, 404)
  const response = await transcribe({ audio: spoken, languageCode: 'en' })
  assert.deepEqual(response.json(), { text: 'hello there' })
  assert.deepEqual(calls.map((call) => call.form?.get('model')), ['gpt-4o-mini-transcribe', 'whisper-1'])

  // When no speech model is open to the key, the provider's answer is what the page gets.
  calls = []
  respond = () => jsonResponse({ error: { message: 'no access' } }, 404)
  const refused = await transcribe({ audio: spoken, languageCode: 'en' })
  assert.deepEqual([refused.statusCode, refused.json().code], [422, 'PROVIDER_NOT_FOUND'])
  assert.equal(calls.length, 2)

  // A wrong key is not tried twice.
  calls = []
  respond = () => jsonResponse({ error: { message: 'bad key' } }, 401)
  const denied = await transcribe({ audio: spoken, languageCode: 'en' })
  assert.deepEqual([denied.statusCode, denied.json().code], [422, 'PROVIDER_AUTH_FAILED'])
  assert.equal(calls.length, 1)
})

test('Gemini writes down a recording with the configured model', async () => {
  await useProvider('gemini')
  respond = () => jsonResponse({ candidates: [{ content: { parts: [{ text: '{"text":"Ayer fui al parque."}' }] }, finishReason: 'STOP' }] })
  const response = await transcribe({ audio: spoken, languageCode: 'es' })
  assert.deepEqual(response.json(), { text: 'Ayer fui al parque.' })
  const [call] = calls
  assert.equal(call.url.href, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro:generateContent')
  assert.equal(call.headers['x-goog-api-key'], 'test-key')
  const parts = call.json?.contents[0].parts as Array<Record<string, any>>
  assert.equal(parts[0].text.includes('learning Spanish'), true)
  assert.equal(parts[0].text.includes('Do not correct'), true)
  assert.deepEqual([parts[1].inlineData.mimeType, parts[1].inlineData.data], ['audio/wav', spoken])

  // Silence comes back as nothing said, not as an error.
  respond = () => jsonResponse({ candidates: [{ content: { parts: [{ text: '{"text":""}' }] }, finishReason: 'STOP' }] })
  assert.deepEqual((await transcribe({ audio: spoken, languageCode: 'es' })).json(), { text: '' })
})

test('providers without audio say so, and nothing is sent to them', async () => {
  for (const id of ['anthropic', 'deepseek', 'kimi'] as const) {
    await useProvider(id)
    const response = await transcribe({ audio: spoken })
    assert.deepEqual([response.statusCode, response.json().code], [409, 'SPEECH_MODEL_UNAVAILABLE'], id)
    const read = await remarks({ audio: spoken, sentence: 'Hello.' })
    assert.equal(read.json().code, 'SPEECH_MODEL_UNAVAILABLE', id)
    assert.equal(calls.length, 0)
  }
  await useProvider(null)
  const response = await transcribe({ audio: spoken })
  assert.deepEqual([response.statusCode, response.json().code], [409, 'MODEL_CONFIGURATION_REQUIRED'])
})

test('remarks on a sentence read aloud are short, in the interface language, and never more than two', async () => {
  await useProvider('openai')
  respond = () => jsonResponse({ choices: [{ finish_reason: 'stop', message: { content: 'Here you go:\n```json\n{"heard":"I sink so","remarks":["think 的 th 要把舌尖放在牙齿之间。","so 的元音再拉长一点。","第三条不该出现。"]}\n```' } }] })
  const response = await remarks({ audio: spoken, sentence: 'I think so.', languageCode: 'en', interfaceLocale: 'zh-CN' })
  assert.deepEqual(response.json(), { heard: 'I sink so', remarks: ['think 的 th 要把舌尖放在牙齿之间。', 'so 的元音再拉长一点。'] })
  const [call] = calls
  assert.equal(call.url.href, 'https://api.openai.com/v1/chat/completions')
  assert.equal(call.json?.model, 'gpt-audio-mini')
  const content = call.json?.messages[0].content as Array<Record<string, any>>
  assert.equal(content[0].text.includes('"I think so."'), true)
  assert.equal(content[0].text.includes('Simplified Chinese') || content[0].text.includes('Chinese'), true)
  assert.deepEqual([content[1].type, content[1].input_audio.format, content[1].input_audio.data], ['input_audio', 'wav', spoken])

  // An answer that is not the object asked for reads as nothing to remark on.
  respond = () => jsonResponse({ choices: [{ finish_reason: 'stop', message: { content: 'Sounds fine to me.' } }] })
  assert.deepEqual((await remarks({ audio: spoken, sentence: 'I think so.', languageCode: 'en' })).json(), { heard: '', remarks: [] })

  await useProvider('gemini')
  respond = () => jsonResponse({ candidates: [{ content: { parts: [{ text: '{"heard":"Ich denke schon","remarks":[]}' }] }, finishReason: 'STOP' }] })
  const clear = await remarks({ audio: spoken, sentence: 'Ich denke schon.', languageCode: 'de', interfaceLocale: 'fr-FR' })
  assert.deepEqual(clear.json(), { heard: 'Ich denke schon', remarks: [] })
  assert.equal(calls[0].json?.generationConfig.responseSchema.required.join(','), 'heard,remarks')
  assert.equal(calls[0].json?.contents[0].parts[0].text.includes('French'), true)
})

test('voice settings are optional, and only known values are saved', () => {
  const config = structuredClone(defaultConfig)
  assert.doesNotThrow(() => validateConfig(config))
  config.learning.voiceInput = 'model'
  config.learning.listenFirst = true
  assert.doesNotThrow(() => validateConfig(config))
  assert.throws(() => validateConfig({ ...config, learning: { ...config.learning, voiceInput: 'phone' as never } }), /Voice input/)
  assert.throws(() => validateConfig({ ...config, learning: { ...config.learning, listenFirst: 'yes' as never } }), /Listening/)
})

test('lines listened to with the text hidden say something about listening once there are enough of them', () => {
  const line = (override: Record<string, unknown> = {}) => ({
    length: 20, meaningErrors: 0, naturalnessErrors: 0, nonTarget: false, lookups: 0, translated: false, simpler: 0, slower: 0, hints: 0, answered: true, ...override,
  })
  const base = stepFromSetting('B1')
  const observe = (signals: ReturnType<typeof line>[]) => skillObservations(conversationStats(signals, 'en'), base, 'en').listening

  // Read, not listened to: nothing is said about listening.
  assert.equal(observe([line(), line(), line(), line()]), undefined)
  assert.equal(observe(Array.from({ length: MIN_HEARD_LINES - 1 }, () => line({ heard: true }))), undefined)

  const heard = (revealed: number, slower = 0, total = 10) => Array.from({ length: total }, (_, index) => line({ heard: true, revealed: index < revealed, slower: index >= revealed && index < revealed + slower ? 1 : 0 }))
  assert.deepEqual(conversationStats(heard(3, 2), 'en').heardLines, 10)
  assert.deepEqual(conversationStats(heard(3, 2), 'en').heardTrouble, 4)
  assert.equal(observe(heard(0)), base + 1)
  assert.equal(observe(heard(1)), base + 1)
  assert.equal(observe(heard(3)), base)
  assert.equal(observe(heard(5)), base - 1)
  assert.equal(observe(heard(8)), base - 2)
  // Asking for the text is about the ear, not about how hard the line is to read.
  assert.equal(helpLowersDifficulty('reveal', { lookups: 0 }), false)
  assert.equal(helpLowersDifficulty('heard', { lookups: 0 }), false)
})

test('the page reports a line as heard and its text as asked for', async () => {
  await useProvider('openai')
  const at = '2026-11-20T08:00:00.000Z'
  db.prepare("INSERT INTO conversations (id, mode, title, target_language, target_language_code, created_at, updated_at) VALUES ('c-voice', 'free', 'Voice', 'Japanese', 'ja', ?, ?)").run(at, at)
  db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('m-voice', 'c-voice', 'assistant', 'こんにちは。', ?)").run(at)
  const signal = (kind: string) => app.inject({ method: 'POST', url: '/api/conversations/c-voice/signals', payload: { messageId: 'm-voice', kind } })
  for (const kind of ['heard', 'heard', 'reveal', 'reveal']) {
    const response = await signal(kind)
    assert.equal(response.statusCode, 200)
    assert.equal(response.json().lowered, false)
  }
  const row = db.prepare("SELECT heard, revealed, lowered FROM turn_signals WHERE conversation_id = 'c-voice' AND partner_message_id = 'm-voice'").get() as Record<string, number>
  assert.deepEqual([row.heard, row.revealed, row.lowered], [1, 1, 0])
})
