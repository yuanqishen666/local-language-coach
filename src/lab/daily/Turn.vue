<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Message, MessageMeta } from '../../types'
import type { LevelAfterHelp } from '../../level'
import { textLookupDirective as vTextLookup } from '../../text-lookup'
import Icon from '../kit/Icon.vue'
import WordText from '../kit/WordText.vue'
import Speak from './Speak.vue'
import Shadow from './Shadow.vue'
import { vTip } from '../core/tip'
import { useMessageBubble } from '../logic/MessageBubble'

const props = defineProps<{ message: Message; feedback?: MessageMeta; partnerInitial: string; targetLanguageCode: string }>()
const emit = defineEmits<{
  lookup: [term: string, sentence: string]
  remember: [item: NonNullable<MessageMeta['memoryCandidates']>[number]]
  dismiss: [item: NonNullable<MessageMeta['memoryCandidates']>[number]]
  undo: [item: NonNullable<MessageMeta['memoryCandidates']>[number]]
  level: [level: LevelAfterHelp]
}>()
const { t, locale, showTranslation, translating, translationError, groundingLinks, coachingVisible, memoryCandidates, usedMemories, memoryLayer, memoryDestination, toggleTranslation, lookupText, helpOpen, simplifying, hinting, helpError, showOriginal, showHint, canSimplify, lineHint, slowPlaying, canHear, saySimpler, giveHint, saySlower, pickWord, textHidden, sentences, wholePlaying, partPlaying, hearAgain, revealText, beats, narration } = useMessageBubble(props, emit)

// Presentation only: corrections become margin notes, tied to the words they are about. A note
// says what sort of remark it is and shows the change; the reasoning opens when it is clicked.
// A remark that the learner's wording is right too, or that may not be a mistake, says so instead of naming a fault.
type Tag = 'wrong' | 'unnatural' | 'minor' | 'say' | 'natural' | 'either' | 'unsure'
type Note = { id: string; kind: 'rewrite' | 'fix' | 'polish'; tag: Tag; label: string; help: string; original: string; improved: string; explanation: string }
const tagOrder: Tag[] = ['wrong', 'say', 'unnatural', 'natural', 'minor', 'either', 'unsure']
const notes = computed<Note[]>(() => {
  const list: Note[] = []
  if (!coachingVisible.value || !props.feedback) return list
  const rewrite = props.feedback.reconstruction
  if (rewrite) {
    const tag: Tag = rewrite.type === 'optional' ? 'natural' : 'say'
    list.push({ id: 'reconstruction', kind: 'rewrite', tag, label: t(`note.kind.${tag}`), help: t(`note.help.${tag}`), original: rewrite.original, improved: rewrite.improved, explanation: rewrite.explanation })
  }
  ;(props.feedback.corrections || []).forEach((item, index) => {
    const tag: Tag = item.certainty === 'either' || item.certainty === 'unsure' ? item.certainty : item.severity === 'meaning' ? 'wrong' : item.severity === 'minor' ? 'minor' : 'unnatural'
    list.push({ id: String(index), kind: tag === 'wrong' ? 'fix' : 'polish', tag, label: t(`note.kind.${tag}`), help: t(`note.help.${tag}`), original: item.original, improved: item.improved, explanation: item.explanation })
  })
  return list
})
// What was kept at the learner's own request shows as kept, with a way back; the rest wait for a choice.
function keepLabel(memory: { action?: string; savedMemoryId?: string }) {
  return memory.savedMemoryId ? t('conversation.memoryStored') : memory.action === 'update' ? t('conversation.memoryUpdateTitle') : t('conversation.memoriesTitle')
}
// Saved words the learner brought into this message: said in the margin, next to what was written.
const usedWords = computed(() => (coachingVisible.value && props.feedback?.reviewedWords) || [])
const noteCount = computed(() => notes.value.length + memoryCandidates.value.length + (usedWords.value.length ? 1 : 0))
// On a narrow screen the notes are folded away; the button that opens them says how many of each sort wait there.
const tallies = computed(() => {
  const list = tagOrder
    .map((tag) => ({ tag: tag as string, label: t(`note.kind.${tag}`), count: notes.value.filter((note) => note.tag === tag).length }))
    .filter((item) => item.count > 0)
  if (usedWords.value.length) list.push({ tag: 'used', label: t('wordbook.used'), count: usedWords.value.length })
  const memories = memoryCandidates.value
  if (memories.length) list.push({ tag: 'keep', label: keepLabel(memories[0]), count: memories.length })
  return list
})

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
const why = ref(-1)
const links = ref(false)
const used = ref(false)
// A heavily corrected message opens on its first notes; the rest wait behind "more".
const FIRST = 3
const all = ref(false)
const shownNotes = computed(() => (all.value ? notes.value : notes.value.slice(0, FIRST)))
function pick(index: number) {
  if (index >= FIRST) all.value = true
  why.value = why.value === index ? -1 : index
  open.value = true
}
</script>

<template>
  <article class="y-turn" :class="[message.role, { noted: noteCount > 0 }]">
    <div class="y-msg">
      <template v-if="message.role === 'assistant'">
        <p v-if="message.meta.aside" class="y-aside" :aria-label="t('help.aside')">{{ message.meta.aside }}</p>
        <template v-if="textHidden"><p v-for="(beat, at) in narration" :key="at" class="reply-told">{{ beat.text }}</p></template>
        <div v-if="textHidden" class="y-held" role="group" :aria-label="t('settings.listenFirst')">
          <button type="button" class="y-btn sm" :class="{ live: wholePlaying }" @click="hearAgain()"><Icon :name="wholePlaying ? 'stop' : 'volume'" :size="14" :weight="2" />{{ wholePlaying ? t('speech.stop') : t('listen.again') }}</button>
          <button v-tip="t('help.slowerTip')" type="button" class="y-link" :class="{ on: slowPlaying }" @click="saySlower">{{ t('listen.slow') }}</button>
          <span v-if="sentences.length > 1" class="y-held-parts"><button v-for="(_, at) in sentences" :key="at" v-tip="t('listen.sentence', { n: at + 1 })" type="button" class="y-part" :class="{ on: partPlaying === at }" :aria-label="t('listen.sentence', { n: at + 1 })" @click="hearAgain(at)">{{ at + 1 }}</button></span>
          <button type="button" class="y-link y-held-show" @click="revealText"><Icon name="eye" :size="13" :weight="2" />{{ t('listen.show') }}</button>
        </div>
        <template v-else>
        <template v-for="(beat, at) in beats" :key="at">
          <p v-if="beat.type === 'narration'" class="reply-told">{{ beat.text }}</p>
          <template v-else>
            <small v-if="beat.name" class="reply-name">{{ beat.name }}</small>
            <p v-text-lookup="lookupText(beat.text)" class="y-line" :class="{ words: helpOpen }" :lang="targetLanguageCode"><WordText :text="beat.text" :language-code="targetLanguageCode" @pick="pickWord" /></p>
          </template>
        </template>
        <p v-if="showOriginal && message.meta.originalReply" class="y-gloss y-was" :lang="targetLanguageCode">{{ message.meta.originalReply }}</p>
        <p v-if="showTranslation" class="y-gloss">{{ message.meta.roleReplyTranslations?.[String(locale)] }}</p>
        <p v-if="showHint && lineHint" class="y-gloss y-hint">{{ lineHint }}</p>
        <p v-if="translationError" class="y-error">{{ translationError }}</p>
        <p v-if="helpError" class="y-error" role="alert">{{ helpError }}</p>
        <div class="y-tools">
          <button type="button" class="y-link" :class="{ on: showTranslation }" :disabled="translating" @click="toggleTranslation"><Icon name="language" :size="13" :weight="2" />{{ translating ? t('message.translating') : showTranslation ? t('message.hideTranslation') : t('message.showTranslation') }}</button>
          <Speak :speech-id="`message-${message.id}`" :text="message.content" :language-code="targetLanguageCode" show-label />
          <button type="button" class="y-link" :class="{ on: helpOpen }" :aria-expanded="helpOpen" @click="helpOpen = !helpOpen"><Icon name="help" :size="13" :weight="2" />{{ t('help.title') }}<Icon name="chevron" :size="12" :weight="2.2" class="turn" /></button>
          <button v-if="groundingLinks.length || message.meta.grounding?.searchSuggestionsHtml" type="button" class="y-link" :class="{ on: links }" :aria-expanded="links" @click="links = !links"><Icon name="link" :size="13" :weight="2" />{{ t('message.webLinks') }}<em v-if="groundingLinks.length" class="y-count">{{ groundingLinks.length }}</em><Icon name="chevron" :size="12" :weight="2.2" class="turn" /></button>
          <button v-if="usedMemories.length" type="button" class="y-link" :class="{ on: used }" :aria-expanded="used" @click="used = !used"><Icon name="notebook" :size="13" :weight="2" />{{ t('message.usedMemories') }}<em class="y-count">{{ usedMemories.length }}</em><Icon name="chevron" :size="12" :weight="2.2" class="turn" /></button>
        </div>
        <div v-if="helpOpen" class="y-tools y-help" role="group" :aria-label="t('help.title')">
          <button v-if="canSimplify" v-tip="t('help.simplerTip')" type="button" class="y-link" :disabled="simplifying" @click="saySimpler">{{ simplifying ? t('help.simplifying') : t('help.simpler') }}</button>
          <button v-if="canHear" v-tip="t('help.slowerTip')" type="button" class="y-link" :class="{ on: slowPlaying }" @click="saySlower">{{ t('help.slower') }}</button>
          <button v-tip="t('help.hintTip')" type="button" class="y-link" :class="{ on: showHint && Boolean(lineHint) }" :disabled="hinting" @click="giveHint">{{ hinting ? t('help.hinting') : t('help.hint') }}</button>
          <button v-if="message.meta.originalReply" type="button" class="y-link" :class="{ on: showOriginal }" @click="showOriginal = !showOriginal">{{ t(showOriginal ? 'help.hideOriginal' : 'help.showOriginal') }}</button>
        </div>
        </template>
        <aside v-if="links" class="y-refs" :aria-label="t('message.webLinks')">
          <a v-for="link in groundingLinks" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer" :title="link.title">
            <span>{{ link.label }}</span><small>{{ link.host }}</small>
          </a>
          <iframe
            v-if="message.meta.grounding?.provider === 'gemini' && message.meta.grounding.searchSuggestionsHtml"
            :srcdoc="message.meta.grounding.searchSuggestionsHtml"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            :title="t('message.googleSearchSuggestions')"
          />
        </aside>
        <ul v-if="used" class="y-refs y-used" :aria-label="t('message.usedMemories')">
          <li v-for="memory in usedMemories" :key="memory.id"><span>{{ memory.value }}</span><small>{{ t('memory.category.' + memoryLayer(memory.layer)) }}</small></li>
        </ul>
      </template>

      <template v-else>
        <p class="y-line y-said"><template v-for="(piece, at) in pieces" :key="at"><mark v-if="piece.note >= 0" :class="[notes[piece.note].kind, notes[piece.note].tag, { hot: hot === piece.note }]" @mouseenter="hot = piece.note" @mouseleave="hot = -1" @click="pick(piece.note)">{{ piece.text }}</mark><template v-else>{{ piece.text }}</template></template></p>
        <p v-if="message.status === 'failed'" class="y-error" role="status">{{ t('message.failed') }}</p>
        <button v-if="noteCount" type="button" class="y-link y-notes-toggle" :aria-expanded="open" @click="open = !open">
          <span v-for="tally in tallies" :key="tally.tag" class="y-tally" :class="tally.tag">{{ tally.label }}<em v-if="tally.count > 1" class="y-count">{{ tally.count }}</em></span><Icon name="chevron" :size="12" :weight="2.2" class="turn" />
        </button>
      </template>
    </div>

    <aside v-if="noteCount" class="y-margin" :class="{ open }">
      <section v-for="(note, index) in shownNotes" :key="note.id" class="y-note" :class="[note.kind, note.tag, { hot: hot === index, why: why === index }]" @mouseenter="hot = index" @mouseleave="hot = -1">
        <button v-tip:left="note.help" type="button" class="y-note-head" :aria-expanded="why === index" @click="why = why === index ? -1 : index">
          <span class="y-note-main"><small class="y-note-tag">{{ note.label }}</small><strong :lang="targetLanguageCode">{{ note.improved }}</strong></span><Icon name="chevron" :size="12" :weight="2.2" class="turn" />
        </button>
        <div class="y-fold" :class="{ open: why === index }">
          <div class="y-fold-body"><div :inert="why !== index">
            <div class="y-note-why">
              <s v-text-lookup="lookupText(note.original)">{{ note.original }}</s>
              <p v-text-lookup="lookupText(note.explanation)">{{ note.explanation }}</p>
              <Speak :speech-id="`coaching-${message.id}-${note.id}`" :text="note.improved" :language-code="targetLanguageCode" show-label />
              <Shadow v-if="note.kind === 'rewrite'" :text="note.improved" :language-code="targetLanguageCode" />
            </div>
          </div></div>
        </div>
      </section>
      <button v-if="notes.length > FIRST" type="button" class="y-link y-notes-more" :aria-expanded="all" @click="all = !all">{{ t('nav.more') }}<em v-if="!all" class="y-count">{{ notes.length - FIRST }}</em><Icon name="chevron" :size="12" :weight="2.2" class="turn" /></button>
      <section v-if="usedWords.length" class="y-note keep used">
        <div class="y-note-label">
          <small>{{ t('wordbook.used') }}</small>
        </div>
        <p v-for="word in usedWords" :key="word.wordId" class="y-used-word"><b :lang="targetLanguageCode">{{ word.term }}</b><small>{{ t(`wordbook.result.${word.result}`) }}</small></p>
      </section>
      <section v-for="memory in memoryCandidates" :key="memory.key + memory.value" class="y-note keep">
        <div class="y-note-label">
          <small>{{ keepLabel(memory) }}</small>
        </div>
        <s v-if="memory.action === 'update' && memory.previousValue" class="y-clamp2">{{ memory.previousValue }}</s>
        <b>{{ memory.value }}</b>
        <small class="y-keep-to"><template v-if="memory.frame === 'scene'">{{ t('conversation.saidInScene') }}<Icon name="arrow" :size="11" :weight="2" /></template>{{ memoryDestination(memory) }}</small>
        <div class="y-keep-acts">
          <button v-if="memory.savedMemoryId" type="button" class="y-link" @click="emit('undo', memory)">{{ t('conversation.undoRemember') }}</button>
          <template v-else>
            <button type="button" class="y-link on" @click="emit('remember', memory)"><Icon name="check" :size="12" :weight="2.6" />{{ memory.action === 'update' ? t('conversation.confirmMemoryUpdate') : t('conversation.keepAlways') }}</button>
            <button type="button" class="y-link" @click="emit('dismiss', memory)">{{ t('conversation.keepHere') }}</button>
          </template>
        </div>
      </section>
    </aside>
  </article>
</template>
