<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { Message, MessageMeta } from '../types'
import { api } from '../api'
import { translationErrorMessage } from '../provider-error-copy'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ message: Message; feedback?: MessageMeta; partnerInitial: string }>()
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
  const explanation = [props.feedback.reconstruction?.explanation, ...(props.feedback.corrections || []).map((item) => item.explanation)].filter(Boolean).join(' ')
  if (!explanation) return false
  if (String(locale.value) === 'zh-CN') return /[\u3400-\u9fff]/u.test(explanation)
  if (String(locale.value) === 'en-US') return !/[\u3400-\u9fff]/u.test(explanation)
  return false
})
let pressTimer: number | undefined

async function toggleTranslation() {
  const existing = props.message.meta.roleReplyTranslations?.[String(locale.value)]
  if (existing) { showTranslation.value = !showTranslation.value; return }
  if (translating.value) return
  translating.value = true
  translationError.value = ''
  try {
    const data = await api.post<{ translation: string }>(`/conversations/${route.params.id}/messages/${props.message.id}/translation`)
    props.message.meta.roleReplyTranslations ||= {}
    props.message.meta.roleReplyTranslations[String(locale.value)] = data.translation
    showTranslation.value = true
  } catch (error) {
    translationError.value = translationErrorMessage(error, String(locale.value))
  } finally { translating.value = false }
}

function selected() {
  if (props.message.role !== 'assistant') return
  const text = window.getSelection()?.toString().trim()
  if (text && text.length < 80) emit('lookup', text, props.message.content)
}
function pressStart(event: PointerEvent) {
  if (props.message.role !== 'assistant' || event.pointerType === 'mouse') return
  pressTimer = window.setTimeout(() => {
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY)
    if (!range) return
    const raw = range.startContainer.textContent || ''
    const segment = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(raw)].find((item) => range.startOffset >= item.index && range.startOffset <= item.index + item.segment.length && item.isWordLike)
    if (segment) emit('lookup', segment.segment, props.message.content)
  }, 520)
}
function pressEnd() { clearTimeout(pressTimer) }
</script>

<template>
  <article class="message" :class="message.role">
    <div v-if="message.role === 'assistant'" class="avatar">{{ partnerInitial }}</div>
    <div class="message-stack">
      <div class="bubble" @mouseup="selected" @dblclick="selected" @pointerdown="pressStart" @pointerup="pressEnd" @pointercancel="pressEnd">
        <p>{{ message.content }}</p>
        <div v-if="message.role === 'assistant'" class="bubble-tools">
          <button :disabled="translating" @click="toggleTranslation"><AppIcon name="book" :size="13" />{{ translating ? t('message.translating') : showTranslation ? t('message.hideTranslation') : t('message.showTranslation') }}</button>
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

      <section v-if="coachingVisible && feedback?.reconstruction" class="coach-card rescue">
        <div class="coach-label"><AppIcon name="spark" :size="14" />{{ feedback.reconstruction.type === 'optional' ? t('message.moreNatural') : t('message.howToSay') }}</div>
        <s>{{ feedback.reconstruction.original }}</s><strong>{{ feedback.reconstruction.improved }}</strong>
        <p>{{ feedback.reconstruction.explanation }}</p>
      </section>
      <section v-for="correction in coachingVisible ? feedback?.corrections || [] : []" :key="correction.original + correction.improved" class="coach-card correction">
        <div class="coach-label">{{ correction.severity === 'meaning' ? t('message.meaningFix') : t('message.naturalPhrasing') }}</div>
        <div><s>{{ correction.original }}</s><AppIcon name="arrow" :size="14" /><strong>{{ correction.improved }}</strong></div>
        <p>{{ correction.explanation }}</p>
      </section>
      <section v-for="memory in coachingVisible ? feedback?.memoryCandidates || [] : []" :key="memory.key + memory.value" class="memory-candidate">
        <div><small>{{ t('conversation.memoriesTitle') }}</small><b>{{ memory.value }}</b></div>
        <button @click="emit('remember', memory)"><AppIcon name="plus" :size="13" />{{ t('conversation.confirmRemember') }}</button>
      </section>
      <p v-if="message.role === 'user' && message.status === 'failed'" class="message-status failed" role="status">{{ t('message.failed') }}</p>
    </div>
  </article>
</template>

<style scoped>
.message{width:100%;min-width:0;display:flex;gap:11px;max-width:760px;margin:0 auto 22px}.message.user{justify-content:flex-end}.avatar{width:30px;height:30px;border-radius:9px;background:var(--green);color:white;display:grid;place-items:center;font-size:11px;font-weight:800;flex:0 0 auto;margin-top:2px}.message-stack{width:fit-content;min-width:0;max-width:min(82%,620px);display:flex;flex-direction:column;gap:8px}.bubble{width:fit-content;max-width:100%;overflow-wrap:anywhere;background:var(--paper);border:1px solid var(--line);border-radius:4px 15px 15px 15px;padding:14px 16px;box-shadow:0 3px 12px rgba(35,39,32,.03);user-select:text}.user .bubble{background:var(--green);border-color:var(--green);color:white;border-radius:15px 4px 15px 15px}.bubble>p:first-child{margin:0;line-height:1.75;font-size:14px;white-space:pre-wrap}.bubble-tools{border-top:1px solid var(--line);margin-top:12px;padding-top:9px;display:flex;justify-content:space-between;align-items:center;gap:12px}.bubble-tools button{border:0;background:transparent;padding:0;color:var(--green-2);display:flex;gap:5px;align-items:center;font-size:11px;font-weight:700}.bubble-tools span{font-size:11px;color:#999c95}.translation{font-size:11px!important;color:var(--muted);border-left:2px solid var(--amber);padding-left:9px;margin:10px 0 0!important}.translation-error{font-size:11px!important;color:var(--red);margin:8px 0 0!important}.coach-card{width:min(100%,560px);background:#f7f1df;border:1px solid #e8d9b2;border-radius:12px;padding:12px 14px;color:var(--ink);align-self:flex-end}.coach-card.rescue{background:#eaf0e9;border-color:#d1ded4}.coach-label{font-size:11px;letter-spacing:.04em;font-weight:800;color:#7c672e;margin-bottom:8px;display:flex;align-items:center;gap:5px}.rescue .coach-label{color:var(--green)}.coach-card s{display:block;color:#9a8478;font-size:11px;margin-bottom:4px}.coach-card strong{display:block;font-size:13px;line-height:1.5;color:var(--green)}.coach-card p{font-size:11px;color:var(--muted);margin:7px 0 0;line-height:1.55}.correction>div:nth-child(2){display:flex;align-items:center;gap:7px;flex-wrap:wrap}.correction>div s,.correction>div strong{display:inline}.memory-candidate{width:min(100%,560px);border:1px dashed #c8cec4;border-radius:11px;background:rgba(251,250,246,.75);padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--ink)}.memory-candidate small,.memory-candidate b{display:block}.memory-candidate small{font-size:11px;color:var(--muted);margin-bottom:3px}.memory-candidate b{font-size:11px}.memory-candidate button{border:0;background:transparent;color:var(--green);font-size:11px;font-weight:750;display:flex;align-items:center;gap:4px;white-space:nowrap}.user .message-stack{align-items:flex-end}.message-status{margin:0 3px;font-size:11px;color:var(--muted)}.message-status.failed{color:var(--red)}
.grounding{width:min(100%,620px);display:flex;flex-direction:column;gap:6px}.grounding-links{display:flex;flex-wrap:wrap;gap:5px}.grounding-links a{max-width:100%;display:inline-flex;align-items:center;gap:4px;padding:5px 7px;border:1px solid var(--line);border-radius:8px;background:rgba(251,250,246,.8);color:var(--green-2);font-size:11px;text-decoration:none}.grounding-links a:hover{border-color:#aebbad;background:var(--paper)}.grounding-links span{max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}.grounding-links small{color:var(--muted);font-size:11px}.google-suggestions{width:100%;height:48px;border:0;background:transparent;overflow:hidden}
.bubble-tools{justify-content:flex-start}.bubble-tools button{font-size:11px}.translation-error,.coach-label,.coach-card p,.message-status,.memory-candidate button{font-size:11px!important}.coach-card s,.memory-candidate b{font-size:11px}.grounding-links a{font-size:11px}.grounding-links small{font-size:11px}
@media(max-width:600px){.message-stack{max-width:calc(100% - 60px)}.bubble{padding:12px 14px}.grounding-links small{display:none}}
</style>
