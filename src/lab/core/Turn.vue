<script setup lang="ts">
import { computed, inject, ref, type Component } from 'vue'
import type { Message, MessageMeta } from '../../types'
import { textLookupDirective as vTextLookup } from '../../text-lookup'
import Icon from '../kit/Icon.vue'
import WordText from '../kit/WordText.vue'
import Speak from './Speak.vue'
import { useMessageBubble } from '../logic/MessageBubble'

const props = defineProps<{ message: Message; feedback?: MessageMeta; partnerInitial: string; targetLanguageCode: string }>()
const emit = defineEmits<{
  lookup: [term: string, sentence: string]
  remember: [item: NonNullable<MessageMeta['memoryCandidates']>[number]]
}>()
const { t, locale, showTranslation, translating, translationError, groundingLinks, coachingVisible, memoryCandidates, toggleTranslation, lookupText } = useMessageBubble(props, emit)
const mascot = inject<Component | null>('labMascot', null)

// Presentation only: corrections become margin notes, tied to the words they are about.
type Note = { id: string; kind: 'rewrite' | 'fix' | 'polish'; label: string; original: string; improved: string; explanation: string }
const notes = computed<Note[]>(() => {
  const list: Note[] = []
  if (!coachingVisible.value || !props.feedback) return list
  const rewrite = props.feedback.reconstruction
  if (rewrite) list.push({ id: 'reconstruction', kind: 'rewrite', label: rewrite.type === 'optional' ? t('message.moreNatural') : t('message.howToSay'), original: rewrite.original, improved: rewrite.improved, explanation: rewrite.explanation })
  ;(props.feedback.corrections || []).forEach((item, index) => {
    const fix = item.severity === 'meaning'
    list.push({ id: String(index), kind: fix ? 'fix' : 'polish', label: fix ? t('message.meaningFix') : t('message.naturalPhrasing'), original: item.original, improved: item.improved, explanation: item.explanation })
  })
  return list
})
const noteCount = computed(() => notes.value.length + memoryCandidates.value.length)
const toggleLabel = computed(() => notes.value[0]?.label || (memoryCandidates.value[0]?.action === 'update' ? t('conversation.memoryUpdateTitle') : t('conversation.memoriesTitle')))

const pieces = computed(() => {
  const content = props.message.content
  const folded = content.toLowerCase()
  const foldable = folded.length === content.length
  const ranges: Array<{ start: number; end: number; note: number }> = []
  notes.value.forEach((note, index) => {
    const needle = note.original.trim()
    if (!needle || (note.kind === 'rewrite' && needle.length > content.trim().length * 0.8)) return
    let start = content.indexOf(needle)
    if (start < 0 && foldable && needle.toLowerCase().length === needle.length) start = folded.indexOf(needle.toLowerCase())
    if (start >= 0) ranges.push({ start, end: start + needle.length, note: index })
  })
  // A specific correction wins over a whole-sentence rewrite when both cover the same words.
  const ordered = [...ranges.filter((range) => notes.value[range.note].kind !== 'rewrite'), ...ranges.filter((range) => notes.value[range.note].kind === 'rewrite')]
  const taken: typeof ranges = []
  for (const range of ordered) {
    if (!taken.some((item) => range.start < item.end && item.start < range.end)) taken.push(range)
  }
  taken.sort((a, b) => a.start - b.start)
  const out: Array<{ text: string; note: number }> = []
  let cursor = 0
  for (const range of taken) {
    if (range.start > cursor) out.push({ text: content.slice(cursor, range.start), note: -1 })
    out.push({ text: content.slice(range.start, range.end), note: range.note })
    cursor = range.end
  }
  if (cursor < content.length) out.push({ text: content.slice(cursor), note: -1 })
  return out
})

const hot = ref(-1)
const open = ref(false)
</script>

<template>
  <article class="c-turn" :class="[message.role, { 'has-notes': noteCount > 0 }]">
    <div class="c-msg">
      <template v-if="message.role === 'assistant'">
        <i class="c-who" aria-hidden="true"><component :is="mascot" v-if="mascot" /><template v-else>{{ partnerInitial }}</template></i>
        <div class="c-side">
          <div class="c-said">
            <p v-text-lookup="lookupText(message.content)" class="c-line" :lang="targetLanguageCode"><WordText :text="message.content" :language-code="targetLanguageCode" @pick="(term) => emit('lookup', term, message.content)" /></p>
            <p v-if="showTranslation" class="c-gloss">{{ message.meta.roleReplyTranslations?.[String(locale)] }}</p>
          </div>
          <p v-if="translationError" class="c-error">{{ translationError }}</p>
          <div class="c-tools">
            <button type="button" class="c-textbtn" :class="{ on: showTranslation }" :disabled="translating" @click="toggleTranslation"><Icon name="language" :size="14" :weight="2" />{{ translating ? t('message.translating') : showTranslation ? t('message.hideTranslation') : t('message.showTranslation') }}</button>
            <Speak :speech-id="`message-${message.id}`" :text="message.content" :language-code="targetLanguageCode" show-label />
          </div>
          <aside v-if="groundingLinks.length || message.meta.grounding?.searchSuggestionsHtml" class="c-refs" :aria-label="t('message.webLinks')">
            <small class="c-label">{{ t('message.webLinks') }}</small>
            <a v-for="link in groundingLinks" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer" :title="link.title">
              <Icon name="link" :size="13" :weight="2" /><span>{{ link.label }}</span><small>{{ link.host }}</small>
            </a>
            <iframe
              v-if="message.meta.grounding?.provider === 'gemini' && message.meta.grounding.searchSuggestionsHtml"
              :srcdoc="message.meta.grounding.searchSuggestionsHtml"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              :title="t('message.googleSearchSuggestions')"
            />
          </aside>
        </div>
      </template>

      <template v-else>
        <div class="c-said">
          <p class="c-line"><template v-for="(piece, at) in pieces" :key="at"><mark v-if="piece.note >= 0" :class="[notes[piece.note].kind, { hot: hot === piece.note }]" @mouseenter="hot = piece.note" @mouseleave="hot = -1">{{ piece.text }}</mark><template v-else>{{ piece.text }}</template></template></p>
        </div>
        <p v-if="message.status === 'failed'" class="c-error" role="status">{{ t('message.failed') }}</p>
        <button v-if="noteCount" type="button" class="c-notes-toggle" :aria-expanded="open" @click="open = !open">
          <Icon name="edit" :size="13" :weight="2" /><span>{{ toggleLabel }}</span><b v-if="noteCount > 1">{{ noteCount }}</b><Icon name="chevron" :size="13" :weight="2.2" />
        </button>
      </template>
    </div>

    <aside v-if="noteCount" class="c-margin" :class="{ open }">
      <section v-for="(note, index) in notes" :key="note.id" class="c-note" :class="[note.kind, { hot: hot === index }]" @mouseenter="hot = index" @mouseleave="hot = -1">
        <header><small class="c-label">{{ note.label }}</small><Speak :speech-id="`coaching-${message.id}-${note.id}`" :text="note.improved" :language-code="targetLanguageCode" compact /></header>
        <s v-text-lookup="lookupText(note.original)">{{ note.original }}</s>
        <strong v-text-lookup="lookupText(note.improved)" :lang="targetLanguageCode">{{ note.improved }}</strong>
        <p v-text-lookup="lookupText(note.explanation)">{{ note.explanation }}</p>
      </section>
      <section v-for="memory in memoryCandidates" :key="memory.key + memory.value" class="c-note keep">
        <header><small class="c-label">{{ memory.action === 'update' ? t('conversation.memoryUpdateTitle') : t('conversation.memoriesTitle') }}</small></header>
        <s v-if="memory.action === 'update' && memory.previousValue">{{ memory.previousValue }}</s>
        <b>{{ memory.value }}</b>
        <button type="button" class="c-btn small" @click="emit('remember', memory)"><Icon name="check" :size="14" :weight="2.4" />{{ memory.action === 'update' ? t('conversation.confirmMemoryUpdate') : t('conversation.confirmRemember') }}</button>
      </section>
    </aside>
  </article>
</template>
