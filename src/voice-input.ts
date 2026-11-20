/**
 * Turning speech into text in the page.
 *
 * The browser's own recognition is used where it works. Where it does not, the microphone is
 * recorded here and the recording goes to the configured model. This file holds the parts that
 * decide what a browser can do and what to tell the learner, plus thin wrappers around the two
 * browser interfaces. What the pages show lives in voice.ts.
 */
import { VOICE_MAX_SECONDS, VOICE_SAMPLE_RATE, recognitionLocale } from '../shared/voice'
import { chosenSpeechLocale } from './speech'

export type VoiceBrowser = 'chrome' | 'edge' | 'safari' | 'firefox' | 'opera' | 'samsung' | 'other'
export type VoiceSystem = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'other'
/** Browsers whose speech recognition is known to work, by name as the learner knows them. */
export type SuggestedBrowser = 'Chrome' | 'Safari'

export interface VoiceEnvironment {
  userAgent: string
  platform?: string
  maxTouchPoints?: number
  /** The page may use the microphone: https, or this computer itself. */
  secure: boolean
  hasRecognition: boolean
  /** Opened from the home screen, where iOS gives pages no speech recognition. */
  standalone?: boolean
}

export function voiceSystem(userAgent: string, platform = '', maxTouchPoints = 0): VoiceSystem {
  if (/iPhone|iPad|iPod/u.test(userAgent)) return 'ios'
  // An iPad asking for desktop pages calls itself a Mac; a Mac has no touch screen.
  if (/Macintosh/u.test(userAgent) && maxTouchPoints > 1) return 'ios'
  if (/Android/u.test(userAgent)) return 'android'
  if (/Macintosh|Mac OS X/u.test(userAgent) || /^Mac/u.test(platform)) return 'macos'
  if (/Windows/u.test(userAgent) || /^Win/u.test(platform)) return 'windows'
  if (/Linux|X11|CrOS/u.test(userAgent) || /Linux/u.test(platform)) return 'linux'
  return 'other'
}

export function voiceBrowser(userAgent: string): VoiceBrowser {
  if (/Edg(?:e|A|iOS)?\//u.test(userAgent)) return 'edge'
  if (/OPR\/|OPT\/|Opera/u.test(userAgent)) return 'opera'
  if (/SamsungBrowser\//u.test(userAgent)) return 'samsung'
  if (/Firefox\/|FxiOS\//u.test(userAgent)) return 'firefox'
  if (/Chrome\/|CriOS\/|Chromium\//u.test(userAgent)) return 'chrome'
  if (/Safari\//u.test(userAgent)) return 'safari'
  return 'other'
}

/** A page shown inside another app. Such views rarely pass the microphone on to speech recognition. */
export function embeddedBrowser(userAgent: string, system: VoiceSystem) {
  if (/MicroMessenger|FBAN|FBAV|Instagram|Line\/|DingTalk|Weibo|QQ\//iu.test(userAgent)) return true
  if (system === 'android') return /; wv\)/u.test(userAgent)
  if (system === 'ios') return !/Safari\//u.test(userAgent)
  return false
}

/** The browsers to open the app in for speech recognition, on this system. */
export function browsersFor(system: VoiceSystem): SuggestedBrowser[] {
  if (system === 'ios') return ['Safari']
  if (system === 'macos') return ['Chrome', 'Safari']
  return ['Chrome']
}

/**
 * Why the browser's recognition cannot be used here.
 * silent: the interface is there but nothing ever comes out of it.
 */
export type RecognitionBlock = 'insecure' | 'no-api' | 'in-app' | 'silent'

export interface RecognitionSupport {
  available: boolean
  reason: 'ok' | RecognitionBlock
  browser: VoiceBrowser
  system: VoiceSystem
  /** Browsers to use instead. Empty when there is none to name. */
  suggest: SuggestedBrowser[]
}

function named(browser: VoiceBrowser): SuggestedBrowser | null {
  return browser === 'chrome' ? 'Chrome' : browser === 'safari' ? 'Safari' : null
}

/** Other browsers worth trying after this one turned out not to work. */
export function otherBrowsers(system: VoiceSystem, browser: VoiceBrowser): SuggestedBrowser[] {
  return browsersFor(system).filter((name) => name !== named(browser))
}

export function recognitionSupport(env: VoiceEnvironment): RecognitionSupport {
  const system = voiceSystem(env.userAgent, env.platform, env.maxTouchPoints)
  const browser = voiceBrowser(env.userAgent)
  const inside = embeddedBrowser(env.userAgent, system) || (system === 'ios' && Boolean(env.standalone))
  const blocked = (reason: RecognitionBlock, suggest: SuggestedBrowser[]): RecognitionSupport => ({ available: false, reason, browser, system, suggest })
  if (!env.secure) return blocked('insecure', [])
  // Opening the same browser directly, not from inside another app or the home screen, is the way out.
  if (!env.hasRecognition) return inside ? blocked('in-app', browsersFor(system)) : blocked('no-api', otherBrowsers(system, browser))
  // Opera carries the interface from Chromium without a service behind it.
  if (browser === 'opera') return blocked('silent', otherBrowsers(system, browser))
  return { available: true, reason: 'ok', browser, system, suggest: [] }
}

/** How speech gets turned into text: by the browser, or by sending a recording to the configured model. */
export type VoiceRoute = 'browser' | 'model'

/**
 * The browser is used unless the learner chose the model. Whichever is preferred, the other
 * stands in when the preferred one cannot be used.
 */
export function chooseVoiceRoute(input: { preferred?: VoiceRoute; browserOk: boolean; modelOk: boolean }): VoiceRoute | 'none' {
  const order: VoiceRoute[] = input.preferred === 'model' ? ['model', 'browser'] : ['browser', 'model']
  return order.find((route) => (route === 'browser' ? input.browserOk : input.modelOk)) || 'none'
}

/** What went wrong while listening, in terms the learner can act on. */
export type VoiceProblem = 'denied' | 'no-mic' | 'network' | 'service' | 'no-speech' | 'language' | 'silent' | 'failed'

/** The error codes of the browser's recognition. Stopping it on purpose is not a problem. */
export function recognitionProblem(code: string): VoiceProblem | null {
  if (code === 'aborted') return null
  if (code === 'not-allowed') return 'denied'
  if (code === 'service-not-allowed') return 'service'
  if (code === 'audio-capture') return 'no-mic'
  if (code === 'network') return 'network'
  if (code === 'no-speech') return 'no-speech'
  if (code === 'language-not-supported') return 'language'
  return 'failed'
}

/** The errors of asking for the microphone. */
export function captureProblem(name: string): VoiceProblem {
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'no-mic'
  return 'failed'
}

/** Problems that mean this browser's recognition will not work however often it is tried. */
export function recognitionBroken(problem: VoiceProblem) {
  return problem === 'network' || problem === 'service' || problem === 'silent' || problem === 'language'
}

const UNSPACED = new Set(['zh', 'ja'])

function baseCode(languageCode: string) {
  return String(languageCode || '').trim().toLowerCase().split(/[-_]/u)[0]
}

/** What was said, added to what is already written. */
export function appendSpoken(written: string, spoken: string, languageCode: string) {
  const said = spoken.trim()
  if (!said) return written
  if (!written.trim()) return said
  const gap = UNSPACED.has(baseCode(languageCode)) || /\s$/u.test(written) ? '' : ' '
  return `${written}${gap}${said}`
}

// ---------------------------------------------------------------------------------------------
// Reading a known sentence aloud: which of its words were heard

export interface ReadPiece {
  text: string
  /** A word, as opposed to the spaces and punctuation between words. */
  word: boolean
  heard: boolean
}

export interface ReadingComparison {
  pieces: ReadPiece[]
  words: number
  missed: number
}

/** Languages whose recognised text cannot be trusted to split into the same words as the sentence. */
const BY_CHARACTER = new Set(['zh', 'ja', 'ko'])
const WORD_RUN = /[\p{L}\p{N}\p{M}]+(?:['’\-][\p{L}\p{N}\p{M}]+)*/gu

function fold(text: string) {
  const value = text.normalize('NFKC').toLowerCase().replace(/[’`]/gu, "'")
  // Accents on Latin letters are spelling the recogniser may or may not write; elsewhere the marks are the word.
  return /\p{Script=Latin}/u.test(value) ? value.normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC') : value
}

function split(text: string, languageCode: string): Array<{ text: string; word: boolean }> {
  const code = baseCode(languageCode)
  if (UNSPACED.has(code) && typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segments = new Intl.Segmenter(code, { granularity: 'word' }).segment(text)
    return Array.from(segments, (segment) => ({ text: segment.segment, word: Boolean(segment.isWordLike) }))
  }
  const pieces: Array<{ text: string; word: boolean }> = []
  let at = 0
  for (const match of text.matchAll(WORD_RUN)) {
    const start = match.index ?? 0
    if (start > at) pieces.push({ text: text.slice(at, start), word: false })
    pieces.push({ text: match[0], word: true })
    at = start + match[0].length
  }
  if (at < text.length) pieces.push({ text: text.slice(at), word: false })
  return pieces
}

function oneApart(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i += 1; j += 1; continue }
    edits += 1
    if (edits > 1) return false
    if (left.length > right.length) i += 1
    else if (right.length > left.length) j += 1
    else { i += 1; j += 1 }
  }
  return edits + (left.length - i) + (right.length - j) <= 1
}

/** Longer words may differ by a letter: recognisers spell some words in more than one way. */
function sameWord(left: string, right: string) {
  return left === right || (left.length >= 5 && right.length >= 5 && oneApart(left, right))
}

/** Which items of `wanted` appear, in order, in `got`. */
function inOrder<T>(wanted: T[], got: T[], same: (left: T, right: T) => boolean): boolean[] {
  const rows = wanted.length
  const columns = got.length
  const table = Array.from({ length: rows + 1 }, () => new Uint16Array(columns + 1))
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = columns - 1; j >= 0; j -= 1) {
      table[i][j] = same(wanted[i], got[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const found = new Array<boolean>(rows).fill(false)
  let i = 0
  let j = 0
  while (i < rows && j < columns) {
    if (same(wanted[i], got[j]) && table[i][j] === table[i + 1][j + 1] + 1) { found[i] = true; i += 1; j += 1 }
    else if (table[i + 1][j] >= table[i][j + 1]) i += 1
    else j += 1
  }
  return found
}

/**
 * Marks the words of a sentence that were not found in what the recogniser wrote down.
 * A word not found may have been read unclearly, or simply misheard: this is a hint, not a score.
 */
export function compareReading(sentence: string, heard: string, languageCode: string): ReadingComparison {
  const code = baseCode(languageCode)
  const parts = split(sentence, languageCode)
  const wordAt = parts.flatMap((part, index) => (part.word ? [index] : []))
  const heardFlags = new Map<number, boolean>()
  if (BY_CHARACTER.has(code)) {
    const letters = (text: string) => Array.from(fold(text)).filter((char) => /[\p{L}\p{N}]/u.test(char))
    const owners: number[] = []
    const wanted: string[] = []
    for (const index of wordAt) for (const char of letters(parts[index].text)) { owners.push(index); wanted.push(char) }
    const found = inOrder(wanted, letters(heard), (left, right) => left === right)
    for (const index of wordAt) {
      const mine = owners.flatMap((owner, at) => (owner === index ? [found[at]] : []))
      const hits = mine.filter(Boolean).length
      heardFlags.set(index, mine.length > 0 && hits / mine.length >= 0.6)
    }
  } else {
    const wanted = wordAt.map((index) => fold(parts[index].text))
    const got = split(heard, languageCode).filter((part) => part.word).map((part) => fold(part.text))
    const found = inOrder(wanted, got, sameWord)
    wordAt.forEach((index, at) => heardFlags.set(index, found[at]))
  }
  const pieces = parts.map((part, index) => ({ text: part.text, word: part.word, heard: part.word ? heardFlags.get(index) === true : true }))
  return { pieces, words: wordAt.length, missed: pieces.filter((piece) => piece.word && !piece.heard).length }
}

// ---------------------------------------------------------------------------------------------
// Sound: levels, pauses, and the form a recording is sent in

export function loudness(samples: Float32Array) {
  if (!samples.length) return 0
  let sum = 0
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index]
  return Math.sqrt(sum / samples.length)
}

/** A silence this long inside what someone says counts as a pause. */
export const PAUSE_COUNT_MS = 1200
const QUIETEST_SPEECH = 0.015

/**
 * Follows the level of the microphone to tell speech from the room, so a turn can end when the
 * speaker has been quiet long enough. Nothing ends before the speaker has said something.
 */
export function createSilenceWatch(pauseMs: number) {
  let room = 0.005
  let spoke = false
  let quietMs = 0
  let spokenMs = 0
  let pauses = 0
  return {
    /** Takes the level of one stretch of sound. True when the turn is over. */
    feed(level: number, ms: number) {
      if (level > Math.max(QUIETEST_SPEECH, room * 3)) {
        if (spoke && quietMs >= PAUSE_COUNT_MS) pauses += 1
        spoke = true
        quietMs = 0
        spokenMs += ms
      } else {
        room = Math.min(0.05, room * 0.95 + level * 0.05)
        if (spoke) quietMs += ms
      }
      return spoke && quietMs >= pauseMs
    },
    get spoke() { return spoke },
    get pauses() { return pauses },
    get spokenSeconds() { return Math.round(spokenMs / 100) / 10 },
  }
}

/** Pauses in speech the browser wrote down, from the moments it reported new words. */
export function pausesBetween(times: number[]) {
  let pauses = 0
  for (let index = 1; index < times.length; index += 1) if (times[index] - times[index - 1] >= PAUSE_COUNT_MS) pauses += 1
  return pauses
}

export interface SpeakingStats {
  /** Seconds from the first word to the last. */
  seconds: number
  pauses: number
}

export function resample(samples: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate || !samples.length) return samples
  const ratio = fromRate / toRate
  const length = Math.floor(samples.length / ratio)
  const result = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.max(start + 1, Math.min(samples.length, Math.floor((index + 1) * ratio)))
    let sum = 0
    for (let at = start; at < end; at += 1) sum += samples[at]
    result[index] = sum / (end - start)
  }
  return result
}

/** 16-bit mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate = VOICE_SAMPLE_RATE) {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const tag = (at: number, text: string) => { for (let index = 0; index < text.length; index += 1) bytes[at + index] = text.charCodeAt(index) }
  tag(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  tag(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(44 + index * 2, Math.round(value < 0 ? value * 0x8000 : value * 0x7fff), true)
  }
  return bytes
}

export function base64Of(bytes: Uint8Array) {
  let text = ''
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(text)
}

// ---------------------------------------------------------------------------------------------
// The browser's side

interface RecognitionResultLike { isFinal: boolean; 0: { transcript: string } }
interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onaudiostart: (() => void) | null
  onresult: ((event: { results: ArrayLike<RecognitionResultLike> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionConstructor = new () => RecognitionLike

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return scope.SpeechRecognition || scope.webkitSpeechRecognition
}

export function currentVoiceEnvironment(): VoiceEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return { userAgent: '', secure: false, hasRecognition: false }
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    secure: window.isSecureContext === true,
    hasRecognition: Boolean(recognitionConstructor()),
    standalone,
  }
}

/** Whether the microphone can be recorded here at all, which sending a recording to the model needs. */
export function canRecord() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const scope = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown }
  return window.isSecureContext === true && Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(scope.AudioContext || scope.webkitAudioContext)
}

/** How long a browser gets to show any sign of life after being told to listen. */
const SILENT_AFTER_MS = 8000

export interface RecognizerEvents {
  /** What has been heard so far: the settled part, and the part still changing. */
  onText(settled: string, changing: string): void
  /** Listening is over: stopped on request, ended by the browser, or broken. */
  onEnd(outcome: 'stopped' | 'ended' | VoiceProblem): void
}

export interface Recognizer {
  /** Finish and keep what was heard. */
  stop(): void
  /** Drop it. No further events arrive. */
  cancel(): void
}

async function microphoneUndecided() {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return status.state === 'prompt'
  } catch {
    return false
  }
}

/** Starts the browser's recognition. Throws when the browser has none. */
export function startRecognizer(languageCode: string, events: RecognizerEvents, options: { continuous: boolean }): Recognizer {
  const Recognition = recognitionConstructor()
  if (!Recognition) throw new Error('Speech recognition is not available')
  const recognition = new Recognition()
  let alive = false
  let over = false
  let stopped = false
  let problem: VoiceProblem | null = null
  let watchdog: ReturnType<typeof setTimeout> | undefined

  const finish = (outcome: 'stopped' | 'ended' | VoiceProblem) => {
    if (over) return
    over = true
    clearTimeout(watchdog)
    events.onEnd(outcome)
  }
  const watch = () => {
    watchdog = setTimeout(() => {
      if (alive || over) return
      // A permission question still on screen is the learner deciding, not the browser failing.
      void microphoneUndecided().then((undecided) => {
        if (alive || over) return
        if (undecided) { watch(); return }
        try { recognition.abort() } catch { /* nothing was running */ }
        finish('silent')
      })
    }, SILENT_AFTER_MS)
  }

  recognition.lang = chosenSpeechLocale(languageCode) || recognitionLocale(languageCode)
  recognition.interimResults = true
  recognition.continuous = options.continuous
  recognition.maxAlternatives = 1
  recognition.onstart = () => { alive = true }
  recognition.onaudiostart = () => { alive = true }
  recognition.onresult = (event) => {
    alive = true
    let settled = ''
    let changing = ''
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index]
      if (result.isFinal) settled += result[0].transcript
      else changing += result[0].transcript
    }
    if (!over) events.onText(settled.trim(), changing.trim())
  }
  recognition.onerror = (event) => {
    alive = true
    problem = recognitionProblem(event.error) || problem
  }
  recognition.onend = () => finish(problem || (stopped ? 'stopped' : 'ended'))

  try {
    recognition.start()
  } catch {
    // Thrown when the browser refuses to start without a tap.
    queueMicrotask(() => finish('denied'))
    return { stop() {}, cancel() { over = true } }
  }
  watch()
  return {
    stop() {
      if (over) return
      stopped = true
      try { recognition.stop() } catch { finish('stopped') }
    },
    cancel() {
      if (over) return
      over = true
      clearTimeout(watchdog)
      try { recognition.abort() } catch { /* nothing was running */ }
    },
  }
}

export interface Recording {
  /** 16 kHz mono. */
  samples: Float32Array
  seconds: number
}

export interface Recorder {
  /** What was recorded since the start or the last cut. */
  cut(): Recording
  /** While held nothing is recorded, and what was recorded is dropped. */
  hold(value: boolean): void
  close(): void
}

const CAPTURE = `
class YujianCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(2048); this.filled = 0 }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    let at = 0
    while (at < channel.length) {
      const take = Math.min(channel.length - at, this.buffer.length - this.filled)
      this.buffer.set(channel.subarray(at, at + take), this.filled)
      this.filled += take
      at += take
      if (this.filled === this.buffer.length) { this.port.postMessage(this.buffer.slice(0)); this.filled = 0 }
    }
    return true
  }
}
registerProcessor('yujian-capture', YujianCapture)
`

export class VoiceCaptureError extends Error {
  constructor(public problem: VoiceProblem) {
    super(`Microphone: ${problem}`)
    this.name = 'VoiceCaptureError'
  }
}

/**
 * Opens the microphone and records until closed. Call it from a tap: browsers only let sound
 * start from one. `onLevel` gets the loudness of each stretch recorded and how long it lasted.
 */
export async function startRecorder(onLevel?: (level: number, ms: number) => void): Promise<Recorder> {
  const scope = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  const Context = scope.AudioContext || scope.webkitAudioContext
  if (!Context || !navigator.mediaDevices?.getUserMedia) throw new VoiceCaptureError('failed')
  // Made before anything is awaited, while the tap still counts.
  const context = new Context()
  void context.resume().catch(() => undefined)
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  } catch (error) {
    void context.close().catch(() => undefined)
    throw new VoiceCaptureError(captureProblem(error instanceof Error ? error.name : ''))
  }

  const rate = context.sampleRate
  const limit = VOICE_MAX_SECONDS * rate
  let chunks: Float32Array[] = []
  let frames = 0
  let held = false
  let closed = false
  const take = (chunk: Float32Array) => {
    if (held || closed || frames >= limit) return
    chunks.push(chunk)
    frames += chunk.length
    onLevel?.(loudness(chunk), chunk.length / rate * 1000)
  }

  const source = context.createMediaStreamSource(stream)
  const nodes: AudioNode[] = [source]
  try {
    const url = URL.createObjectURL(new Blob([CAPTURE], { type: 'text/javascript' }))
    try { await context.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
    const worklet = new AudioWorkletNode(context, 'yujian-capture', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 })
    worklet.port.onmessage = (event) => take(event.data as Float32Array)
    source.connect(worklet)
    nodes.push(worklet)
  } catch {
    // Older browsers: the same samples, taken on the page's own thread.
    const processor = context.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (event) => take(new Float32Array(event.inputBuffer.getChannelData(0)))
    const mute = context.createGain()
    mute.gain.value = 0
    source.connect(processor)
    processor.connect(mute)
    mute.connect(context.destination)
    nodes.push(processor, mute)
  }

  return {
    cut() {
      const all = new Float32Array(frames)
      let at = 0
      for (const chunk of chunks) { all.set(chunk, at); at += chunk.length }
      chunks = []
      frames = 0
      const samples = resample(all, rate, VOICE_SAMPLE_RATE)
      return { samples, seconds: samples.length / VOICE_SAMPLE_RATE }
    },
    hold(value) {
      held = value
      if (value) { chunks = []; frames = 0 }
    },
    close() {
      if (closed) return
      closed = true
      for (const node of nodes) { try { node.disconnect() } catch { /* already apart */ } }
      for (const track of stream.getTracks()) track.stop()
      void context.close().catch(() => undefined)
    },
  }
}
