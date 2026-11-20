import { readonly, ref } from 'vue'
import { targetLanguage } from '../shared/locales'
import { normalizeSpeechRate } from '../shared/speech'

export type SpeechFailure = 'unsupported' | 'voice-unavailable' | 'playback-failed'

export interface SpeechVoiceLike {
  default: boolean
  lang: string
  localService: boolean
  name: string
  voiceURI: string
}

export interface SpeechErrorLike {
  error?: string
}

export interface SpeechUtteranceLike {
  text: string
  lang: string
  pitch: number
  rate: number
  volume: number
  voice: SpeechVoiceLike | null
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechErrorLike) => void) | null
}

export interface SpeechEngineLike {
  cancel(): void
  getVoices(): SpeechVoiceLike[]
  speak(utterance: SpeechUtteranceLike): void
  addEventListener?(type: 'voiceschanged', listener: () => void): void
  removeEventListener?(type: 'voiceschanged', listener: () => void): void
}

export interface SpeechRequest {
  id: string
  text: string
  languageCode: string
  rate?: number
  maxChunkLength?: number
  onError?: (failure: SpeechFailure) => void
}

interface SpeechEnvironment {
  getEngine(): SpeechEngineLike | null
  createUtterance(text: string): SpeechUtteranceLike
}

const localeAliases: Record<string, string[]> = {
  'en-us': ['en-ca', 'en-gb', 'en-au'],
  'es-419': ['es-mx', 'es-us', 'es-co', 'es-ar', 'es-es'],
  'fr-fr': ['fr-ca', 'fr-be', 'fr-ch'],
  'ja-jp': ['ja'],
  'de-de': ['de-at', 'de-ch'],
  'ko-kr': ['ko'],
  'it-it': ['it-ch'],
  'zh-cn': ['zh-hans', 'zh-sg', 'cmn-hans-cn', 'cmn-cn'],
  'pt-br': ['pt-pt'],
  'hi-in': ['hi'],
}

function normalizedLocale(value: string) {
  try {
    return Intl.getCanonicalLocales(value.replaceAll('_', '-'))[0]?.toLowerCase() || value.toLowerCase()
  } catch {
    return value.replaceAll('_', '-').toLowerCase()
  }
}

function localeBase(value: string) {
  return normalizedLocale(value).split('-')[0]
}

const trustedSystemVoiceNames = new Set([
  // Apple voices that are intended for ordinary narration rather than sound effects.
  'alex', 'allison', 'ava', 'daniel', 'eddy', 'evan', 'fiona', 'flo', 'grandma', 'grandpa',
  'jamie', 'karen', 'lee', 'malcolm', 'matilda', 'moira', 'nathan', 'noelle', 'oliver',
  'reed', 'rishi', 'rocko', 'samantha', 'sandy', 'serena', 'shelley', 'stephanie', 'susan',
  'tessa', 'tom',
  'alice', 'amelie', 'amélie', 'anna', 'audrey', 'aurélie', 'chantal', 'federica', 'felipe',
  'helena', 'jacques', 'joana', 'jorge', 'juan', 'kanya', 'kyoko', 'lekha', 'luca', 'luciana',
  'martin', 'markus', 'mónica', 'monica', 'nicolas', 'otoya', 'paola', 'paulina', 'petra',
  'soledad', 'thomas', 'ximena', 'yannick', 'yuna',
  'li-mu', 'mei-jia', 'sin-ji', 'ting-ting', 'tingting', '婷婷', '李沐', '美佳',
])

function normalizedVoiceName(value: string) {
  return value.replaceAll('\u00a0', ' ').trim().replace(/\s+/gu, ' ')
}

function voiceQualityScore(voice: SpeechVoiceLike) {
  const name = normalizedVoiceName(voice.name)
  if (/\b(natural|neural|premium|enhanced)\b/iu.test(name)) return 1000
  if (/^google\s/iu.test(name)) return 900

  const simpleName = name
    .replace(/\s*\([^)]*\)\s*$/u, '')
    .trim()
    .toLocaleLowerCase('en-US')
  if (trustedSystemVoiceNames.has(simpleName)) return 800
  return -1
}

/**
 * The regional variety the learner chose for a language, as a speech locale: "en-GB". A voice of that
 * region is taken first; any other voice of the language still serves when the browser has none.
 */
const chosenLocales = new Map<string, string>()

export function chooseSpeechLocale(languageCode: string, locale: string) {
  const base = localeBase(languageCode)
  if (locale) chosenLocales.set(base, locale)
  else chosenLocales.delete(base)
}

export function chosenSpeechLocale(languageCode: string) {
  return chosenLocales.get(localeBase(languageCode)) || ''
}

export function speechLocaleFor(languageCode: string) {
  return chosenSpeechLocale(languageCode) || targetLanguage(languageCode).locale
}

function voiceScore(voice: SpeechVoiceLike, requestedLocale: string) {
  const requested = normalizedLocale(requestedLocale)
  const voiceLocale = normalizedLocale(voice.lang)
  let languageScore = -1
  if (voiceLocale === requested) languageScore = 400
  else {
    const aliasIndex = (localeAliases[requested] || []).indexOf(voiceLocale)
    if (aliasIndex >= 0) languageScore = 350 - aliasIndex
    else if (localeBase(voiceLocale) === localeBase(requested)) languageScore = 300
  }
  if (languageScore < 0) return languageScore
  const qualityScore = voiceQualityScore(voice)
  if (qualityScore < 0) return qualityScore

  // Locale accuracy must outweigh a nicer voice from a different region. Within the
  // same locale, prefer natural/neural voices, then Google voices, then curated system voices.
  return languageScore * 10_000 + qualityScore * 10 + (voice.default ? 2 : 0) + (voice.localService ? 1 : 0)
}

export function selectSpeechVoice(voices: readonly SpeechVoiceLike[], requestedLocale: string) {
  return voices
    .map((voice, index) => ({ voice, index, score: voiceScore(voice, requestedLocale) }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.voice || null
}

function splitLongPart(value: string, maxLength: number) {
  const chunks: string[] = []
  let characters = [...value.trim()]
  while (characters.length > maxLength) {
    let splitAt = maxLength
    for (let index = maxLength; index >= Math.floor(maxLength * 0.55); index -= 1) {
      if (/\s/u.test(characters[index - 1] || '')) {
        splitAt = index
        break
      }
    }
    chunks.push(characters.slice(0, splitAt).join('').trim())
    characters = characters.slice(splitAt)
    while (characters.length && /\s/u.test(characters[0])) characters.shift()
  }
  if (characters.length) chunks.push(characters.join('').trim())
  return chunks.filter(Boolean)
}

export function splitSpeechText(text: string, locale: string, maxLength = 220) {
  const normalized = text.trim().replace(/\s+/gu, ' ')
  if (!normalized) return []
  const safeMaxLength = Math.max(40, maxLength)
  let sentences: string[]
  try {
    sentences = [...new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(normalized)]
      .map((item) => item.segment.trim())
      .filter(Boolean)
  } catch {
    sentences = normalized.match(/[^.!?。！？]+[.!?。！？]?/gu)?.map((item) => item.trim()).filter(Boolean) || [normalized]
  }

  const chunks: string[] = []
  for (const sentence of sentences) {
    const parts = splitLongPart(sentence, safeMaxLength)
    for (const part of parts) {
      const previous = chunks.at(-1)
      if (previous && [...`${previous} ${part}`].length <= safeMaxLength) chunks[chunks.length - 1] = `${previous} ${part}`
      else chunks.push(part)
    }
  }
  return chunks
}

export function createSpeechController(environment: SpeechEnvironment) {
  const activeId = ref<string | null>(null)
  const supported = ref(Boolean(environment.getEngine()))
  const voicesVersion = ref(0)
  let operation = 0
  let listeningEngine: SpeechEngineLike | null = null

  const handleVoicesChanged = () => { voicesVersion.value += 1 }

  function initialize() {
    const engine = environment.getEngine()
    supported.value = Boolean(engine)
    if (!engine || listeningEngine === engine) return
    if (listeningEngine?.removeEventListener) listeningEngine.removeEventListener('voiceschanged', handleVoicesChanged)
    listeningEngine = engine
    engine.addEventListener?.('voiceschanged', handleVoicesChanged)
    try { engine.getVoices() } catch { /* Voice discovery can fail in restricted browser contexts. */ }
    voicesVersion.value += 1
  }

  function hasTrustedVoice(languageCode: string) {
    const engine = environment.getEngine()
    supported.value = Boolean(engine)
    if (!engine) return false
    try {
      return Boolean(selectSpeechVoice(engine.getVoices(), speechLocaleFor(languageCode)))
    } catch {
      return false
    }
  }

  function stop() {
    operation += 1
    activeId.value = null
    try { environment.getEngine()?.cancel() } catch { /* The browser already stopped playback. */ }
  }

  function fail(run: number, request: SpeechRequest, failure: SpeechFailure) {
    if (run !== operation) return
    activeId.value = null
    request.onError?.(failure)
  }

  function speak(request: SpeechRequest) {
    if (activeId.value === request.id) {
      stop()
      return 'stopped' as const
    }

    const engine = environment.getEngine()
    supported.value = Boolean(engine)
    if (!engine) {
      request.onError?.('unsupported')
      return 'unsupported' as const
    }

    const locale = speechLocaleFor(request.languageCode)
    const chunks = splitSpeechText(request.text, locale, request.maxChunkLength)
    if (!chunks.length) return 'empty' as const

    let voices: SpeechVoiceLike[] = []
    try { voices = engine.getVoices() } catch { /* Fall through to the trusted-voice requirement. */ }
    const voice = selectSpeechVoice(voices, locale)
    if (!voice) {
      request.onError?.('voice-unavailable')
      return 'voice-unavailable' as const
    }

    operation += 1
    const run = operation
    try { engine.cancel() } catch { /* Nothing was playing. */ }
    activeId.value = request.id
    let chunkIndex = 0

    const playNext = () => {
      if (run !== operation) return
      const chunk = chunks[chunkIndex]
      if (!chunk) {
        activeId.value = null
        return
      }
      chunkIndex += 1
      let utterance: SpeechUtteranceLike
      try {
        utterance = environment.createUtterance(chunk)
      } catch {
        fail(run, request, 'playback-failed')
        return
      }
      utterance.lang = locale
      utterance.rate = normalizeSpeechRate(request.rate)
      utterance.pitch = 1
      utterance.volume = 1
      utterance.voice = voice
      utterance.onstart = () => {
        if (run === operation) activeId.value = request.id
      }
      utterance.onend = () => {
        if (run !== operation) return
        if (chunkIndex < chunks.length) playNext()
        else activeId.value = null
      }
      utterance.onerror = (event) => {
        if (run !== operation) return
        activeId.value = null
        if (event.error === 'canceled' || event.error === 'interrupted') return
        request.onError?.(event.error === 'language-unavailable' || event.error === 'voice-unavailable'
          ? 'voice-unavailable'
          : 'playback-failed')
      }
      try { engine.speak(utterance) }
      catch { fail(run, request, 'playback-failed') }
    }

    playNext()
    return 'started' as const
  }

  function dispose() {
    stop()
    listeningEngine?.removeEventListener?.('voiceschanged', handleVoicesChanged)
    listeningEngine = null
  }

  return {
    activeId: readonly(activeId),
    supported: readonly(supported),
    voicesVersion: readonly(voicesVersion),
    hasTrustedVoice,
    initialize,
    speak,
    stop,
    dispose,
  }
}

function browserEngine() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  return window.speechSynthesis as unknown as SpeechEngineLike
}

export const browserSpeech = createSpeechController({
  getEngine: browserEngine,
  createUtterance(text) {
    return new SpeechSynthesisUtterance(text) as unknown as SpeechUtteranceLike
  },
})
