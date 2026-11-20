// Generated from src/components/MessageBubble.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { MemoryCandidate, Message, MessageMeta } from '../../types'
import { api } from '../../api'
import { modelErrorKey, translationErrorMessage } from '../../provider-error-copy'
import { browserSpeech, type SpeechFailure } from '../../speech'
import { displayTargetLanguage } from '../../../shared/locales'
import { useAppStore } from '../../stores/app'
import { spokenRate, type LevelAfterHelp } from '../../level'
import { sentencesOf, showText, textHeld } from '../../listening'

export function useMessageBubble(props: { message: Message; feedback?: MessageMeta; partnerInitial: string; targetLanguageCode: string }, emit: (event: any, ...args: any[]) => void) {
const route = useRoute()
const { t, locale } = useI18n()
const showTranslation = ref(false)
const translating = ref(false)
const translationError = ref('')

// "Didn't get it": the ways to have a partner's line made easier to follow.
const SLOWER = 0.75
const store = useAppStore()
const helpOpen = ref(false)
const simplifying = ref(false)
const hinting = ref(false)
const helpError = ref('')
const showOriginal = ref(false)
const showHint = ref(false)
const isPartnerLine = computed(() => props.message.role === 'assistant')
// A reply that quotes what was looked up on the web keeps its wording: the sources point at it.
const canSimplify = computed(() => isPartnerLine.value && !props.message.meta.grounding)
const lineHint = computed(() => props.message.meta.lineHints?.[String(locale.value)] || '')
const slowId = computed(() => `message-${props.message.id}-slow`)
const slowPlaying = computed(() => browserSpeech.activeId.value === slowId.value)
const canHear = computed(() => {
  // Re-evaluate after browsers asynchronously publish their installed voices.
  browserSpeech.voicesVersion.value
  return browserSpeech.supported.value && browserSpeech.hasTrustedVoice(props.targetLanguageCode)
})
const conversationPath = computed(() => `/conversations/${encodeURIComponent(String(route.params.id))}`)
const messagePath = computed(() => `${conversationPath.value}/messages/${encodeURIComponent(props.message.id)}`)

/** Needing help with a line says how hard it was; the conversation may ease off on it. */
function signal(kind: 'lookup' | 'translate' | 'slower' | 'reveal') {
  if (!isPartnerLine.value) return
  api.post<LevelAfterHelp>(`${conversationPath.value}/signals`, { messageId: props.message.id, kind })
    .then((level) => emit('level', level))
    .catch(() => undefined)
}

function helpFailure(error: unknown, fallback: string) {
  const key = modelErrorKey(error)
  return t(key || fallback)
}

async function saySimpler() {
  if (simplifying.value || !canSimplify.value) return
  simplifying.value = true
  helpError.value = ''
  try {
    const data = await api.post<{ content: string; originalReply: string; simplerCount: number; lowered: boolean; level: LevelAfterHelp }>(`${messagePath.value}/simpler`, {})
    const meta = props.message.meta
    props.message.content = data.content
    meta.originalReply = data.originalReply
    meta.simplerCount = data.simplerCount
    // What was said about the earlier wording no longer fits the line.
    delete meta.roleReplyTranslation
    delete meta.roleReplyTranslations
    delete meta.lineHints
    showTranslation.value = false
    showHint.value = false
    emit('level', { ...data.level, lowered: data.lowered })
  } catch (error) {
    helpError.value = helpFailure(error, 'help.simplerFailed')
  } finally { simplifying.value = false }
}

async function giveHint() {
  if (lineHint.value) { showHint.value = !showHint.value; return }
  if (hinting.value) return
  hinting.value = true
  helpError.value = ''
  try {
    const data = await api.post<{ hint: string; interfaceLocale: string; lowered?: boolean; level?: LevelAfterHelp }>(`${messagePath.value}/hint`, { interfaceLocale: String(locale.value) })
    props.message.meta.lineHints ||= {}
    props.message.meta.lineHints[data.interfaceLocale] = data.hint
    showHint.value = data.interfaceLocale === String(locale.value)
    if (data.level) emit('level', { ...data.level, lowered: data.lowered })
  } catch (error) {
    helpError.value = helpFailure(error, 'common.operationFailed')
  } finally { hinting.value = false }
}

function speechFailure(failure: SpeechFailure) {
  if (failure === 'unsupported') return t('speech.unsupported')
  if (failure === 'voice-unavailable') return t('speech.voiceUnavailable', { language: displayTargetLanguage(props.targetLanguageCode, locale.value) })
  return t('speech.failed')
}

/** Reads the line aloud again, slower than it is usually read. Pressed while it plays, it stops. */
function saySlower() {
  const outcome = browserSpeech.speak({
    id: slowId.value,
    text: props.message.content,
    languageCode: props.targetLanguageCode,
    rate: spokenRate(store.settings?.learning.speechRate, SLOWER),
    onError: (failure) => store.notify(speechFailure(failure)),
  })
  if (outcome === 'started') signal('slower')
}

// Heard before seen: the text of this line stays out of view until it is asked for.
const textHidden = computed(() => isPartnerLine.value && textHeld(props.message.id))
const sentences = computed(() => sentencesOf(props.message.content, props.targetLanguageCode))
const wholeId = computed(() => `message-${props.message.id}`)
const partPrefix = computed(() => `${wholeId.value}-part-`)
const wholePlaying = computed(() => browserSpeech.activeId.value === wholeId.value)
const partPlaying = computed(() => {
  const active = browserSpeech.activeId.value
  return active?.startsWith(partPrefix.value) ? Number(active.slice(partPrefix.value.length)) : -1
})

/** Reads the line again, or one sentence of it. Pressed while that plays, it stops. */
function hearAgain(part = -1) {
  const text = part < 0 ? props.message.content : sentences.value[part]
  if (!text) return
  browserSpeech.speak({
    id: part < 0 ? wholeId.value : `${partPrefix.value}${part}`,
    text,
    languageCode: props.targetLanguageCode,
    rate: spokenRate(store.settings?.learning.speechRate),
    onError: (failure) => store.notify(speechFailure(failure)),
  })
}

/** Asking for the text says the line was not followed by ear alone. */
function revealText() {
  if (!textHidden.value) return
  showText(props.message.id)
  signal('reveal')
}

function pickWord(term: string) {
  emit('lookup', term, props.message.content)
  signal('lookup')
}
const groundingLinks = computed(() => (props.message.role === 'assistant' ? props.message.meta.grounding?.citations || [] : [])
  .filter((item) => {
    try { return ['http:', 'https:'].includes(new URL(item.url).protocol) }
    catch { return false }
  })
  .filter((item, index, values) => values.findIndex((candidate) => candidate.url === item.url) === index)
  .slice(0, 5)
  .map((item) => {
    const host = new URL(item.url).hostname.replace(/^www\./u, '')
    const title = item.title.trim() || host
    return { ...item, label: title.length > 42 ? `${title.slice(0, 39)}…` : title, host }
  }))
const coachingVisible = computed(() => {
  if (props.message.role !== 'user' || !props.feedback) return false
  const savedLocale = props.feedback.interfaceLocale
  if (savedLocale) return savedLocale === String(locale.value)
  return false
})
const memoryCandidates = computed(() => {
  if (props.message.role !== 'user' || !props.feedback) return []
  const savedLocale = props.feedback.interfaceLocale
  if (savedLocale && savedLocale !== String(locale.value)) return []
  return props.feedback.memoryCandidates || []
})
// The memories a reply was written with are shown on the reply itself.
const usedMemories = computed(() => (props.message.role === 'assistant' ? props.message.meta.usedMemories || [] : []))
// Candidates stored before the layers existed still carry the earlier names.
function memoryLayer(category: string) {
  return category === 'learning' ? 'learning' : category === 'plan' || category === 'scene' ? 'plan' : 'about'
}
/** Where a statement would be kept, and until when if it has an end. */
function memoryDestination(memory: MemoryCandidate) {
  const layer = t(`memory.category.${memoryLayer(memory.category)}`)
  if (!memory.validTo) return layer
  const date = new Intl.DateTimeFormat(String(locale.value), { dateStyle: 'medium' }).format(new Date(memory.validTo))
  return `${layer} · ${t('memory.until', { date })}`
}
async function toggleTranslation() {
  const existing = props.message.meta.roleReplyTranslations?.[String(locale.value)]
  if (existing) { showTranslation.value = !showTranslation.value; return }
  if (translating.value) return
  translating.value = true
  translationError.value = ''
  try {
    const requestedLocale = String(locale.value)
    const data = await api.post<{ translation: string; interfaceLocale: string }>(`/conversations/${route.params.id}/messages/${props.message.id}/translation`, { interfaceLocale: requestedLocale })
    props.message.meta.roleReplyTranslations ||= {}
    props.message.meta.roleReplyTranslations[data.interfaceLocale] = data.translation
    showTranslation.value = data.interfaceLocale === String(locale.value)
    signal('translate')
  } catch (error) {
    translationError.value = translationErrorMessage(error, String(locale.value))
  } finally { translating.value = false }
}

function lookupText(context: string, enabled = true) {
  return { context, enabled, onLookup: (term: string, sentence: string) => { emit('lookup', term, sentence); signal('lookup') } }
}

  return { route, t, locale, showTranslation, translating, translationError, SLOWER, store, helpOpen, simplifying, hinting, helpError, showOriginal, showHint, isPartnerLine, canSimplify, lineHint, slowId, slowPlaying, canHear, conversationPath, messagePath, signal, helpFailure, saySimpler, giveHint, speechFailure, saySlower, textHidden, sentences, wholeId, partPrefix, wholePlaying, partPlaying, hearAgain, revealText, pickWord, groundingLinks, coachingVisible, memoryCandidates, usedMemories, memoryLayer, memoryDestination, toggleTranslation, lookupText }
}
