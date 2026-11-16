<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { Message, MessageMeta } from '../types'
import { api } from '../api'
import { translationErrorMessage } from '../provider-error-copy'
import { textLookupDirective as vTextLookup } from '../text-lookup'
import AppIcon from './AppIcon.vue'
import SpeakButton from './SpeakButton.vue'

const props = defineProps<{ message: Message; feedback?: MessageMeta; partnerInitial: string; targetLanguageCode: string }>()
const emit = defineEmits<{
  lookup: [term: string, sentence: string]
  remember: [item: NonNullable<MessageMeta['memoryCandidates']>[number]]
}>()
const route = useRoute()
const { t, locale } = useI18n()
const showTranslation = ref(false)
const translating = ref(false)
const translationError = ref('')
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
  } catch (error) {
    translationError.value = translationErrorMessage(error, String(locale.value))
  } finally { translating.value = false }
}

function lookupText(context: string, enabled = true) {
  return { context, enabled, onLookup: (term: string, sentence: string) => emit('lookup', term, sentence) }
}
</script>

<template>
  <article class="message" :class="message.role">
    <div v-if="message.role === 'assistant'" class="avatar">{{ partnerInitial }}</div>
    <div class="message-stack">
      <div v-text-lookup="lookupText(message.content, message.role === 'assistant')" class="bubble">
        <p>{{ message.content }}</p>
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
        <button @click="emit('remember', memory)"><AppIcon name="plus" :size="13" />{{ memory.action === 'update' ? t('conversation.confirmMemoryUpdate') : t('conversation.confirmRemember') }}</button>
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
