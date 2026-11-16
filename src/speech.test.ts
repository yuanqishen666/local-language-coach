import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSpeechController,
  selectSpeechVoice,
  speechLocaleFor,
  splitSpeechText,
  type SpeechEngineLike,
  type SpeechFailure,
  type SpeechUtteranceLike,
  type SpeechVoiceLike,
} from './speech.js'
import {
  DEFAULT_SPEECH_RATE,
  normalizeSpeechRate,
  speechPlatformFor,
} from '../shared/speech.js'

function voice(lang: string, options: Partial<SpeechVoiceLike> = {}): SpeechVoiceLike {
  return {
    default: false,
    lang,
    localService: true,
    name: `Google ${lang}`,
    voiceURI: lang,
    ...options,
  }
}

function utterance(text: string): SpeechUtteranceLike {
  return { text, lang: '', pitch: 1, rate: 1, volume: 1, voice: null, onstart: null, onend: null, onerror: null }
}

test('target languages resolve to their intended speech locale', () => {
  const expected = {
    en: 'en-US',
    es: 'es-419',
    fr: 'fr-FR',
    ja: 'ja-JP',
    de: 'de-DE',
    ko: 'ko-KR',
    it: 'it-IT',
    zh: 'zh-CN',
    pt: 'pt-BR',
    hi: 'hi-IN',
  }
  for (const [code, locale] of Object.entries(expected)) assert.equal(speechLocaleFor(code), locale, code)
})

test('voice selection prefers exact locale and a high-quality provider voice', () => {
  const voices = [
    voice('en-GB', { default: true }),
    voice('en-US', { default: true, name: 'Samantha' }),
    voice('en-US', { name: 'Google US English', localService: false }),
  ]
  assert.equal(selectSpeechVoice(voices, 'en-US')?.name, 'Google US English')
})

test('voice selection uses regional aliases and never crosses languages', () => {
  assert.equal(selectSpeechVoice([voice('es-ES'), voice('es-MX')], 'es-419')?.lang, 'es-MX')
  assert.equal(selectSpeechVoice([voice('fr-CA')], 'fr-FR')?.lang, 'fr-CA')
  assert.equal(selectSpeechVoice([voice('de-DE')], 'ja-JP'), null)
})

test('voice selection rejects novelty and unknown low-confidence voices', () => {
  const voices = [
    voice('en-US', { default: true, name: 'Albert' }),
    voice('en-US', { name: 'Bad News' }),
    voice('en-US', { name: 'eSpeak NG English' }),
  ]
  assert.equal(selectSpeechVoice(voices, 'en-US'), null)
  assert.equal(selectSpeechVoice([...voices, voice('en-US', { name: 'Google US English' })], 'en-US')?.name, 'Google US English')
})

test('all ten target languages select their matching trusted voice', () => {
  const expected = [
    ['en-US', 'Google US English'],
    ['es-419', 'Google español de Estados Unidos'],
    ['fr-FR', 'Google français'],
    ['ja-JP', 'Google 日本語'],
    ['de-DE', 'Google Deutsch'],
    ['ko-KR', 'Google 한국의'],
    ['it-IT', 'Google italiano'],
    ['zh-CN', 'Google 普通话（中国大陆）'],
    ['pt-BR', 'Google português do Brasil'],
    ['hi-IN', 'Google हिन्दी'],
  ] as const

  for (const [locale, name] of expected) {
    const lang = locale === 'es-419' ? 'es-US' : locale
    assert.equal(selectSpeechVoice([voice(lang, { name })], locale)?.name, name, locale)
  }
})

test('speech rate defaults to a slower learning pace and stays within the supported range', () => {
  assert.equal(normalizeSpeechRate(undefined), DEFAULT_SPEECH_RATE)
  assert.equal(normalizeSpeechRate(0.77), 0.75)
  assert.equal(normalizeSpeechRate(0.2), 0.6)
  assert.equal(normalizeSpeechRate(2), 1.2)
})

test('recommended speech browser follows the current desktop operating system', () => {
  assert.equal(speechPlatformFor('MacIntel'), 'macos')
  assert.equal(speechPlatformFor('Win32'), 'windows')
  assert.equal(speechPlatformFor('Linux x86_64'), 'linux')
  assert.equal(speechPlatformFor('Linux armv8l', 'Mozilla/5.0 (Linux; Android 16)'), 'other')
})

test('long speech is split on sentence boundaries and hard limits', () => {
  const text = `First sentence. ${'A long sentence with several words '.repeat(12)}Final sentence.`
  const chunks = splitSpeechText(text, 'en-US', 80)
  assert.ok(chunks.length > 3)
  assert.ok(chunks.every((chunk) => [...chunk].length <= 80))
  assert.match(chunks[0], /^First sentence\./u)
})

test('speech controller sequences chunks and stops active playback', () => {
  const spoken: SpeechUtteranceLike[] = []
  let cancellations = 0
  const engine: SpeechEngineLike = {
    cancel() { cancellations += 1 },
    getVoices() { return [voice('en-US', { default: true })] },
    speak(value) { spoken.push(value) },
  }
  const controller = createSpeechController({ getEngine: () => engine, createUtterance: utterance })
  const result = controller.speak({ id: 'message-1', text: 'One sentence has enough words. A second sentence has enough words.', languageCode: 'en', rate: 0.75, maxChunkLength: 40 })
  assert.equal(result, 'started')
  assert.equal(controller.activeId.value, 'message-1')
  assert.equal(spoken.length, 1)
  assert.equal(spoken[0].rate, 0.75)
  spoken[0].onend?.()
  assert.equal(spoken.length, 2)
  spoken[1].onend?.()
  assert.equal(controller.activeId.value, null)

  controller.speak({ id: 'message-2', text: 'Again.', languageCode: 'en' })
  assert.equal(controller.activeId.value, 'message-2')
  assert.equal(spoken.at(-1)?.rate, DEFAULT_SPEECH_RATE)
  controller.stop()
  assert.equal(controller.activeId.value, null)
  assert.ok(cancellations >= 2)
})

test('speech controller reports missing language voices and unsupported browsers', () => {
  const failures: SpeechFailure[] = []
  const engine: SpeechEngineLike = {
    cancel() {},
    getVoices() { return [voice('de-DE')] },
    speak() { throw new Error('should not speak') },
  }
  const controller = createSpeechController({ getEngine: () => engine, createUtterance: utterance })
  assert.equal(controller.speak({ id: 'ja', text: 'こんにちは', languageCode: 'ja', onError: (value) => failures.push(value) }), 'voice-unavailable')
  assert.deepEqual(failures, ['voice-unavailable'])

  const unsupported = createSpeechController({ getEngine: () => null, createUtterance: utterance })
  assert.equal(unsupported.speak({ id: 'en', text: 'Hello', languageCode: 'en', onError: (value) => failures.push(value) }), 'unsupported')
  assert.equal(failures.at(-1), 'unsupported')
})

test('speech controller exposes availability only for trusted target-language voices', () => {
  const availableEngine: SpeechEngineLike = {
    cancel() {},
    getVoices() { return [voice('en-US', { name: 'Albert' }), voice('ja-JP', { name: 'Google 日本語' })] },
    speak() {},
  }
  const controller = createSpeechController({ getEngine: () => availableEngine, createUtterance: utterance })
  assert.equal(controller.hasTrustedVoice('en'), false)
  assert.equal(controller.hasTrustedVoice('ja'), true)
})

test('canceled playback returns to idle without showing an error', () => {
  let current: SpeechUtteranceLike | null = null
  const failures: SpeechFailure[] = []
  const engine: SpeechEngineLike = {
    cancel() {},
    getVoices() { return [voice('en-US', { name: 'Google US English' })] },
    speak(value) { current = value },
  }
  const controller = createSpeechController({ getEngine: () => engine, createUtterance: utterance })
  controller.speak({ id: 'message', text: 'Hello', languageCode: 'en', onError: (value) => failures.push(value) })
  assert.ok(current)
  ;(current as SpeechUtteranceLike).onerror?.({ error: 'canceled' })
  assert.equal(controller.activeId.value, null)
  assert.deepEqual(failures, [])
})
