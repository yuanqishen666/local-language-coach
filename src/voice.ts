/**
 * Listening to the learner, for every page that does: one microphone, one listener at a time.
 *
 * A page asks to listen and is told what was said, or why listening did not work. Whether the
 * browser writes the speech down or a recording goes to the configured model is decided here,
 * from the setting, from what this browser can do, and from what the provider takes.
 */
import { readonly, ref } from 'vue'
import { api } from './api'
import { modelErrorKey } from './provider-error-copy'
import { useAppStore } from './stores/app'
import { displayTargetLanguage } from '../shared/locales'
import { VOICE_MAX_SECONDS, VOICE_MIN_SECONDS, type SpeechCapabilities } from '../shared/voice'
import {
  VoiceCaptureError, appendSpoken, base64Of, canRecord, chooseVoiceRoute, createSilenceWatch, currentVoiceEnvironment, encodeWav,
  otherBrowsers, pausesBetween, recognitionBroken, recognitionSupport, startRecognizer, startRecorder,
  type Recognizer, type Recorder, type Recording, type SpeakingStats, type SuggestedBrowser, type VoiceProblem, type VoiceRoute,
} from './voice-input'

type Translate = (key: string, values?: Record<string, unknown>) => string

/** With nothing heard for this long, listening gives up rather than keep the microphone open. */
const IDLE_LIMIT_MS = 30_000
/** A browser that was told to stop gets this long to hand over its last words. */
const STOP_GRACE_MS = 3000

export interface VoiceResult {
  text: string
  /** Nothing was heard at all. */
  silent: boolean
  stats: SpeakingStats
  route: VoiceRoute
  /** What was recorded, when a recording was made. */
  recording?: Recording
}

export interface VoiceIssue {
  /** unavailable: there is no way to listen here. model: the provider did not write the recording down. */
  problem: VoiceProblem | 'unavailable' | 'model'
  error?: unknown
  /** The browser's recognition gave out and recordings now go to the model instead. */
  switched?: boolean
}

export interface VoiceOptions {
  /** Who is listening. Pages show their own controls as active by this. */
  owner: string
  languageCode: string
  /** Once something was said, a silence this long ends the listening. Without it only stopVoice does. */
  endAfterPauseMs?: number
  /** Leave the microphone open afterwards for the next round of a call. */
  keepMic?: boolean
  /** Listen this way whatever the setting says. */
  route?: VoiceRoute
  /** A recording is handed over as it is, without being written down. */
  transcribe?: boolean
  onDone(result: VoiceResult): void
  onProblem(issue: VoiceIssue): void
}

interface Session {
  options: VoiceOptions
  route: VoiceRoute
  recognizer?: Recognizer
  /** Text of the browser's earlier runs in this session, and of the run going on. */
  settled: string
  running: string
  times: number[]
  lastSoundAt: number
  quickEnds: number
  restarted: boolean
  finishing: boolean
  watch?: ReturnType<typeof createSilenceWatch>
  timers: Array<ReturnType<typeof setTimeout>>
  pause?: ReturnType<typeof setTimeout>
}

const owner = ref<string | null>(null)
const phase = ref<'idle' | 'listening' | 'writing'>('idle')
const heard = ref('')
const capabilities = ref<SpeechCapabilities>({ modelAudio: false, provider: null })
const support = ref(recognitionSupport(currentVoiceEnvironment()))

interface Broken { problem: VoiceProblem; languageCode: string }

// Kept until the page is loaded again: what stopped it may have been put right by then.
const broken = ref<Broken | null>(null)

function baseCode(languageCode: string) {
  return String(languageCode || '').trim().toLowerCase().split(/[-_]/u)[0]
}

/** Why the browser's recognition is not used for this language, when it gave out earlier in this visit. */
function brokenFor(languageCode: string): VoiceProblem | null {
  const value = broken.value
  if (!value) return null
  return value.problem !== 'language' || value.languageCode === baseCode(languageCode) ? value.problem : null
}

function rememberBroken(problem: VoiceProblem, languageCode: string) {
  broken.value = { problem, languageCode: baseCode(languageCode) }
}

let asked: Promise<void> | null = null

/** Asks what the configured provider can do with a recording. */
export function loadSpeechCapabilities(force = false) {
  if (!asked || force) {
    asked = api.get<SpeechCapabilities>('/speech/capabilities')
      .then((value) => { capabilities.value = value })
      .catch(() => undefined)
  }
  return asked
}

/** How speech would be turned into text right now, or 'none' when there is no way. */
export function voiceRouteFor(languageCode: string): VoiceRoute | 'none' {
  return chooseVoiceRoute({
    preferred: useAppStore().settings?.learning.voiceInput,
    browserOk: support.value.available && !brokenFor(languageCode),
    modelOk: capabilities.value.modelAudio && canRecord(),
  })
}

let session: Session | null = null
let recorder: Recorder | null = null
let recorderFeed: ((level: number, ms: number) => void) | null = null

function closeRecorder() {
  recorderFeed = null
  recorder?.close()
  recorder = null
}

function end(current: Session) {
  for (const timer of current.timers) clearTimeout(timer)
  clearTimeout(current.pause)
  if (session !== current) return
  session = null
  owner.value = null
  phase.value = 'idle'
  heard.value = ''
}

function textOf(current: Session) {
  return appendSpoken(current.settled, current.running, current.options.languageCode).trim()
}

function deliver(current: Session) {
  if (session !== current) return
  const text = textOf(current)
  const times = current.times
  const stats: SpeakingStats = { seconds: times.length ? Math.max(1, Math.round((times[times.length - 1] - times[0]) / 1000)) : 0, pauses: pausesBetween(times) }
  end(current)
  current.options.onDone({ text, silent: !text, stats, route: 'browser' })
}

function fail(current: Session, problem: VoiceProblem) {
  if (session !== current) return
  const languageCode = current.options.languageCode
  end(current)
  if (current.route === 'model' && !current.options.keepMic) closeRecorder()
  let switched = false
  // Safari without Siri says so at once and works as soon as Siri is on: nothing to remember.
  const siriOff = problem === 'service' && support.value.browser === 'safari'
  if (current.route === 'browser' && recognitionBroken(problem) && !siriOff) {
    rememberBroken(problem, languageCode)
    switched = voiceRouteFor(languageCode) === 'model'
  }
  current.options.onProblem({ problem, switched })
}

function listenWithBrowser(current: Session) {
  const languageCode = current.options.languageCode
  const startedAt = Date.now()
  try {
    current.recognizer = startRecognizer(languageCode, {
      onText(settled, changing) {
        if (session !== current) return
        current.running = appendSpoken(settled, changing, languageCode)
        current.times.push(Date.now())
        current.lastSoundAt = Date.now()
        heard.value = textOf(current)
        const pauseMs = current.options.endAfterPauseMs
        if (pauseMs && !current.finishing) {
          clearTimeout(current.pause)
          current.pause = setTimeout(() => { if (session === current && textOf(current)) stopVoice() }, pauseMs)
        }
      },
      onEnd(outcome) {
        if (session !== current) return
        current.recognizer = undefined
        const heardSomething = Boolean(current.running)
        current.settled = textOf(current)
        current.running = ''
        if (outcome === 'stopped' || current.finishing) { deliver(current); return }
        // Browsers stop listening by themselves after a pause. The learner has not said they are done.
        if (outcome === 'ended' || outcome === 'no-speech') {
          if (!heardSomething && Date.now() - startedAt < 500) current.quickEnds += 1
          if (current.quickEnds >= 3) { fail(current, 'silent'); return }
          if (Date.now() - current.lastSoundAt > IDLE_LIMIT_MS) { deliver(current); return }
          current.restarted = true
          listenWithBrowser(current)
          return
        }
        // Some browsers only start listening from a tap; a restart is not one. What was heard still counts.
        if (outcome === 'denied' && current.restarted) { deliver(current); return }
        fail(current, outcome)
      },
    }, { continuous: support.value.system !== 'android' })
  } catch {
    fail(current, 'failed')
  }
}

async function listenWithRecorder(current: Session) {
  const pauseMs = current.options.endAfterPauseMs
  const watch = createSilenceWatch(pauseMs ?? Number.POSITIVE_INFINITY)
  current.watch = watch
  recorderFeed = (level, ms) => {
    if (session !== current || current.finishing) return
    if (watch.feed(level, ms)) stopVoice()
  }
  try {
    if (recorder) recorder.hold(false)
    else {
      const opened = await startRecorder((level, ms) => recorderFeed?.(level, ms))
      // Cancelled while the browser was still asking for the microphone.
      if (session !== current) { opened.close(); return }
      recorder = opened
    }
  } catch (error) {
    fail(current, error instanceof VoiceCaptureError ? error.problem : 'failed')
    return
  }
  current.timers.push(setTimeout(() => { if (session === current) stopVoice() }, VOICE_MAX_SECONDS * 1000))
  if (pauseMs) current.timers.push(setTimeout(() => { if (session === current && !watch.spoke) stopVoice() }, IDLE_LIMIT_MS))
}

async function finishRecording(current: Session) {
  const watch = current.watch
  if (!recorder || !watch) { end(current); current.options.onDone({ text: '', silent: true, stats: { seconds: 0, pauses: 0 }, route: 'model' }); return }
  const recording = recorder.cut()
  if (current.options.keepMic) recorder.hold(true)
  else closeRecorder()
  const stats: SpeakingStats = { seconds: Math.round(watch.spokenSeconds), pauses: watch.pauses }
  if (!watch.spoke || recording.seconds < VOICE_MIN_SECONDS) {
    end(current)
    current.options.onDone({ text: '', silent: true, stats, route: 'model' })
    return
  }
  if (current.options.transcribe === false) {
    end(current)
    current.options.onDone({ text: '', silent: false, stats, route: 'model', recording })
    return
  }
  phase.value = 'writing'
  try {
    const data = await api.post<{ text: string }>('/speech/transcribe', { audio: base64Of(encodeWav(recording.samples)), languageCode: current.options.languageCode })
    if (session !== current) return
    const text = String(data.text || '').trim()
    end(current)
    current.options.onDone({ text, silent: !text, stats, route: 'model', recording })
  } catch (error) {
    if (session !== current) return
    end(current)
    current.options.onProblem({ problem: 'model', error })
  }
}

/** Starts listening. Call it from a tap. Whoever was listening before is dropped. */
export function startVoice(options: VoiceOptions) {
  cancelVoice()
  const route = options.route === 'model' && !(capabilities.value.modelAudio && canRecord()) ? 'none' : options.route || voiceRouteFor(options.languageCode)
  if (route === 'none') { options.onProblem({ problem: 'unavailable' }); return }
  const current: Session = { options, route, settled: '', running: '', times: [], lastSoundAt: Date.now(), quickEnds: 0, restarted: false, finishing: false, timers: [] }
  session = current
  owner.value = options.owner
  phase.value = 'listening'
  heard.value = ''
  if (route === 'browser') listenWithBrowser(current)
  else void listenWithRecorder(current)
}

/** The learner is done speaking: what was heard is handed over. */
export function stopVoice() {
  const current = session
  if (!current || current.finishing) return
  current.finishing = true
  clearTimeout(current.pause)
  if (current.route === 'model') { void finishRecording(current); return }
  if (!current.recognizer) { deliver(current); return }
  current.timers.push(setTimeout(() => deliver(current), STOP_GRACE_MS))
  current.recognizer.stop()
}

/** Stops listening and drops what was heard. */
export function cancelVoice() {
  const current = session
  if (!current) return
  current.recognizer?.cancel()
  if (current.route === 'model') {
    if (current.options.keepMic && recorder) recorder.hold(true)
    else closeRecorder()
  }
  end(current)
}

/** Stops listening and lets go of the microphone. */
export function releaseVoice() {
  cancelVoice()
  closeRecorder()
}

export const voice = {
  /** Who is listening, if anyone. */
  owner: readonly(owner),
  phase: readonly(phase),
  /** What the browser has written down so far. Empty while a recording is being made. */
  heard: readonly(heard),
  capabilities: readonly(capabilities),
  support: readonly(support),
}

function browserList(names: SuggestedBrowser[], locale: string) {
  // Chinese sets Latin names apart from the words around them, which the list formatter does not.
  if (locale.startsWith('zh')) return names.join(' 或 ')
  try { return new Intl.ListFormat(locale, { style: 'long', type: 'disjunction' }).format(names) }
  catch { return names.join(' / ') }
}

/** Why there is no way to listen here, and what to open the app in instead. */
export function voiceUnavailableText(t: Translate, locale: string, languageCode: string) {
  const state = support.value
  if (state.reason === 'insecure') return t('voice.unavailable.insecure')
  if (state.reason === 'in-app') return t('voice.unavailable.inApp', { browsers: browserList(state.suggest, locale) })
  // The interface is there but gave out when it was used: any other browser that has it is worth naming.
  const suggest = state.available && brokenFor(languageCode) ? otherBrowsers(state.system, state.browser) : state.suggest
  return suggest.length ? t('voice.unavailable.browser', { browsers: browserList(suggest, locale) }) : t('voice.unavailable.none')
}

/** What to tell the learner when listening did not work. */
export function voiceIssueText(issue: VoiceIssue, t: Translate, locale: string, languageCode: string) {
  const problem = issue.problem
  if (problem === 'unavailable') return voiceUnavailableText(t, locale, languageCode)
  if (problem === 'model') return t(modelErrorKey(issue.error) || 'voice.problem.model')
  if (problem === 'denied') return t('voice.problem.denied')
  if (problem === 'no-mic') return t('voice.problem.noMic')
  if (problem === 'no-speech') return t('voice.problem.noSpeech')
  if (problem === 'failed') return t('voice.problem.failed')
  if (issue.switched) return t('voice.problem.switched')
  const state = support.value
  const cause = problem === 'network' ? t('voice.problem.network')
    : problem === 'language' ? t('voice.problem.language', { language: displayTargetLanguage(baseCode(languageCode), locale) })
    : problem === 'service' && state.browser === 'safari' ? t('voice.problem.siri')
    : t('voice.problem.silent')
  if (problem === 'service' && state.browser === 'safari') return cause
  const others = otherBrowsers(state.system, state.browser)
  // Chinese and Japanese sentences follow one another without a space.
  const gap = /^(zh|ja)/u.test(locale) ? '' : ' '
  return others.length ? `${cause}${gap}${t('voice.problem.tryBrowser', { browsers: browserList(others, locale) })}` : cause
}
