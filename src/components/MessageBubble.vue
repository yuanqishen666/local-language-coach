<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { MemoryCandidate, Message, MessageMeta } from '../types'
import { api } from '../api'
import { modelErrorKey, translationErrorMessage } from '../provider-error-copy'
import { browserSpeech, type SpeechFailure } from '../speech'
import { displayTargetLanguage } from '../../shared/locales'
import { replyParts, toldInParts } from '../../shared/reply'
import { useAppStore } from '../stores/app'
import { spokenRate, type LevelAfterHelp } from '../level'
import { sentencesOf, showText, textHeld } from '../listening'
import { textLookupDirective as vTextLookup } from '../text-lookup'
import AppIcon from './AppIcon.vue'
import SpeakButton from './SpeakButton.vue'

const props = defineProps<{ message: Message; feedback?: MessageMeta; partnerInitial: string; targetLanguageCode: string }>()
const emit = defineEmits<{
  lookup: [term: string, sentence: string]
  remember: [item: MemoryCandidate]
  dismiss: [item: MemoryCandidate]
  undo: [item: MemoryCandidate]
  level: [level: LevelAfterHelp]
}>()
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
// A reply told in several parts would come back as one line, without who says what.
const canSimplify = computed(() => isPartnerLine.value && !props.message.meta.grounding && !toldInParts(props.message.meta.beats))
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

// A reply can be told in several parts: narration, and lines each said by someone named. Any other message is one line.
const beats = computed(() => replyParts(props.message.content, isPartnerLine.value ? props.message.meta.beats : undefined))
// Narration is read, never heard, so it stays in view while the lines are held back.
const narration = computed(() => beats.value.filter((beat) => beat.type === 'narration'))

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
</script>

<template>
  <article class="message" :class="message.role">
    <div v-if="message.role === 'assistant'" class="avatar">{{ partnerInitial }}</div>
    <div class="message-stack">
      <div v-text-lookup="lookupText(message.content, message.role === 'assistant')" class="bubble">
        <template v-for="(beat, at) in beats" :key="at">
          <p v-if="beat.type === 'narration'" class="reply-told">{{ beat.text }}</p>
          <template v-else>
            <small v-if="beat.name" class="reply-name">{{ beat.name }}</small>
            <p>{{ beat.text }}</p>
          </template>
        </template>
        <div v-if="message.role === 'assistant'" class="bubble-tools">
          <button class="translation-toggle" :disabled="translating" data-content-repeat-ok="repeated-action" @click="toggleTranslation"><AppIcon name="book" :size="13" />{{ translating ? t('message.translating') : showTranslation ? t('message.hideTranslation') : t('message.showTranslation') }}</button>
          <SpeakButton :speech-id="`message-${message.id}`" :text="message.content" :language-code="targetLanguageCode" show-label />
        </div>
        <p v-if="showTranslation" class="translation">{{ message.meta.roleReplyTranslations?.[String(locale)] }}</p>
        <p v-if="translationError" class="translation-error">{{ translationError }}</p>
      </div>

      <aside v-if="message.role === 'assistant' && (groundingLinks.length || message.meta.grounding?.searchSuggestionsHtml)" class="grounding" :aria-label="t('message.webLinks')">
        <div v-if="groundingLinks.length" class="grounding-links">
          <a v-for="link in groundingLinks" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer" :title="link.title">
            <AppIcon name="link" :size="11" /><span>{{ link.label }}</span><small>{{ link.host }}</small>
          </a>
        </div>
        <iframe
          v-if="message.meta.grounding?.provider === 'gemini' && message.meta.grounding.searchSuggestionsHtml"
          class="google-suggestions"
          :srcdoc="message.meta.grounding.searchSuggestionsHtml"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          :title="t('message.googleSearchSuggestions')"
        />
      </aside>

      <section v-if="coachingVisible && feedback?.reconstruction" class="coach-note rescue">
        <div class="coach-label"><AppIcon name="spark" :size="14" />{{ feedback.reconstruction.type === 'optional' ? t('message.moreNatural') : t('message.howToSay') }}</div>
        <s v-text-lookup="lookupText(feedback.reconstruction.original)">{{ feedback.reconstruction.original }}</s>
        <div class="spoken-phrase"><strong v-text-lookup="lookupText(feedback.reconstruction.improved)" data-content-repeat-ok="responsive-alternative">{{ feedback.reconstruction.improved }}</strong><SpeakButton :speech-id="`coaching-${message.id}-reconstruction`" :text="feedback.reconstruction.improved" :language-code="targetLanguageCode" compact /></div>
        <p v-text-lookup="lookupText(feedback.reconstruction.explanation)" data-content-repeat-ok="responsive-alternative">{{ feedback.reconstruction.explanation }}</p>
      </section>
      <section v-for="(correction, correctionIndex) in coachingVisible ? feedback?.corrections || [] : []" :key="correction.original + correction.improved" class="coach-note correction">
        <div class="coach-label">{{ correction.severity === 'meaning' ? t('message.meaningFix') : t('message.naturalPhrasing') }}</div>
        <div class="correction-line"><s v-text-lookup="lookupText(correction.original)">{{ correction.original }}</s><AppIcon name="arrow" :size="14" /><span class="spoken-phrase"><strong v-text-lookup="lookupText(correction.improved)" data-content-repeat-ok="responsive-alternative">{{ correction.improved }}</strong><SpeakButton :speech-id="`coaching-${message.id}-${correctionIndex}`" :text="correction.improved" :language-code="targetLanguageCode" compact /></span></div>
        <p v-text-lookup="lookupText(correction.explanation)" data-content-repeat-ok="responsive-alternative">{{ correction.explanation }}</p>
      </section>
      <section v-for="memory in memoryCandidates" :key="memory.key + memory.value" class="memory-candidate">
        <div><small>{{ memory.action === 'update' ? t('conversation.memoryUpdateTitle') : t('conversation.memoriesTitle') }}</small><s v-if="memory.action === 'update' && memory.previousValue">{{ memory.previousValue }}</s><b>{{ memory.value }}</b></div>
        <button v-if="memory.savedMemoryId" @click="emit('undo', memory)">{{ t('conversation.undoRemember') }}</button>
        <template v-else>
          <button @click="emit('remember', memory)"><AppIcon name="plus" :size="13" />{{ memory.action === 'update' ? t('conversation.confirmMemoryUpdate') : t('conversation.keepAlways') }}</button>
          <button @click="emit('dismiss', memory)">{{ t('conversation.keepHere') }}</button>
        </template>
      </section>
      <p v-if="message.role === 'user' && message.status === 'failed'" class="message-status failed" role="status">{{ t('message.failed') }}</p>
    </div>
  </article>
</template>

<style scoped>
.message{width:100%;min-width:0;display:flex;gap:11px;max-width:760px;margin:0 auto 22px}.message.user{justify-content:flex-end}.avatar{width:30px;height:30px;border-radius:9px;background:var(--green);color:white;display:grid;place-items:center;font-size:11px;font-weight:800;flex:0 0 auto;margin-top:2px}.message-stack{width:fit-content;min-width:0;max-width:min(82%,620px);display:flex;flex-direction:column;gap:8px}.bubble{width:fit-content;max-width:100%;overflow-wrap:anywhere;background:var(--paper);border:1px solid var(--line);border-radius:4px 15px 15px 15px;padding:14px 16px;box-shadow:0 3px 12px rgba(35,39,32,.03);user-select:text}.user .bubble{background:var(--green);border-color:var(--green);color:white;border-radius:15px 4px 15px 15px}.bubble>p:first-child{margin:0;line-height:1.75;font-size:14px;white-space:pre-wrap}.bubble-tools{border-top:1px solid var(--line);margin-top:12px;padding-top:9px;display:flex;justify-content:flex-start;align-items:center;gap:8px}.translation-toggle{min-height:34px;border:0;background:transparent;padding:0;color:var(--green-2);display:flex;gap:5px;align-items:center;font-size:11px;font-weight:700}.bubble-tools :deep(.speak-button){color:var(--green-2)}.translation{font-size:11px!important;color:var(--muted);border-left:2px solid var(--amber);padding-left:9px;margin:10px 0 0!important}.translation-error{font-size:11px!important;color:var(--red);margin:8px 0 0!important}.coach-note{width:min(100%,560px);background:#f7f1df;border:1px solid #e8d9b2;border-radius:12px;padding:12px 14px;color:var(--ink);align-self:flex-end}.coach-note.rescue{background:#eaf0e9;border-color:#d1ded4}.coach-label{font-size:11px;letter-spacing:.04em;font-weight:800;color:#7c672e;margin-bottom:8px;display:flex;align-items:center;gap:5px}.rescue .coach-label{color:var(--green)}.coach-note s{display:block;color:#9a8478;font-size:11px;margin-bottom:4px}.coach-note strong{display:block;font-size:13px;line-height:1.5;color:var(--green)}.coach-note p{font-size:11px;color:var(--muted);margin:7px 0 0;line-height:1.55}.spoken-phrase{min-width:0;display:flex;align-items:center;gap:5px}.spoken-phrase strong{min-width:0;flex:1}.correction-line{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.correction-line s,.correction-line strong{display:inline}.correction-line .spoken-phrase{flex:1 1 180px}.memory-candidate{width:min(100%,560px);border:1px dashed #c8cec4;border-radius:11px;background:rgba(251,250,246,.75);padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--ink)}.memory-candidate small,.memory-candidate b{display:block}.memory-candidate small{font-size:11px;color:var(--muted);margin-bottom:3px}.memory-candidate b{font-size:11px}.memory-candidate button{border:0;background:transparent;color:var(--green);font-size:11px;font-weight:750;display:flex;align-items:center;gap:4px;white-space:nowrap}.user .message-stack{align-items:flex-end}.message-status{margin:0 3px;font-size:11px;color:var(--muted)}.message-status.failed{color:var(--red)}
.memory-candidate s{display:block;font-size:11px;color:#9a8478;margin:2px 0}.grounding{width:min(100%,620px);display:flex;flex-direction:column;gap:6px}.grounding-links{display:flex;flex-wrap:wrap;gap:5px}.grounding-links a{max-width:100%;display:inline-flex;align-items:center;gap:4px;padding:5px 7px;border:1px solid var(--line);border-radius:8px;background:rgba(251,250,246,.8);color:var(--green-2);font-size:11px;text-decoration:none}.grounding-links a:hover{border-color:#aebbad;background:var(--paper)}.grounding-links span{max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}.grounding-links small{color:var(--muted);font-size:11px}.google-suggestions{width:100%;height:48px;border:0;background:transparent;overflow:hidden}
.translation-toggle{font-size:11px}.translation-error,.coach-label,.coach-note p,.message-status,.memory-candidate button{font-size:11px!important}.coach-note s,.memory-candidate b{font-size:11px}.grounding-links a{font-size:11px}.grounding-links small{font-size:11px}
@media(max-width:600px){.message-stack{max-width:calc(100% - 60px)}.bubble{padding:12px 14px}.grounding-links small{display:none}}
</style>
