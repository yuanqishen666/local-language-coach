<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import Icon from '../kit/Icon.vue'
import Speak from './Speak.vue'
import Shadow from './Shadow.vue'
import { vTip } from '../core/tip'
import { useWordbookPage } from '../logic/WordbookPage'
import { gapPieces, sentenceWith, usePaged } from './text'

const {
  t, words, query, selected, localizing, error, current, shown, selectWord, remove, formatDate,
  passageBusy, passageErrors, canTranslatePassage, passageTranslation, togglePassageTranslation, exportAnki,
} = useWordbookPage()
const due = inject<Ref<number>>('labReviewDue', ref(0))

// Presentation only. The page is a plain list; a word opens under its own row, one at a time,
// and its context opens on the sentence that holds the word rather than the whole passage.
const { rows, left, more, reset } = usePaged(shown, 16)
watch(query, reset)

const openId = computed(() => String(selected.value?.id ?? ''))
const closing = ref('')
let closingTimer = 0
const whole = ref(false)
watch(openId, (_now, before) => {
  whole.value = false
  closing.value = before
  window.clearTimeout(closingTimer)
  closingTimer = window.setTimeout(() => { closing.value = '' }, 320)
})

function toggle(word: any) {
  if (openId.value === String(word.id)) selected.value = null
  else void selectWord(word)
}
function context(word: any) {
  return sentenceWith(word.source_sentence, String(word.term), word.language)
}
// A translation covers the whole passage, so the passage is shown whole next to it.
function shownContext(word: any) {
  const all = openId.value === String(word.id) && (whole.value || Boolean(passageTranslation(word)))
  return all ? String(word.source_sentence) : context(word).sentence
}

// Common uses open beside the list instead of under the word, and follow along from word to word
// until they are closed or no word is open any more.
const usesOpen = ref(false)
const usesWord = computed(() => {
  const word = selected.value
  if (!usesOpen.value || !word?.details?.senses?.length) return null
  return rows.value.some((item: any) => item.id === word.id) ? word : null
})
watch([openId, localizing], ([id, busy]) => { if (!id && !busy) usesOpen.value = false })

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && usesWord.value) usesOpen.value = false
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.clearTimeout(closingTimer)
})
</script>

<template>
  <div class="y-page y-words" :class="{ side: Boolean(usesWord) }">
    <div class="y-words-main">
      <header class="y-head wrap">
        <h1>{{ t('words.title') }}</h1>
        <span v-if="words.length" class="y-count">{{ words.length }}</span>
        <div v-if="words.length" class="y-head-more push">
          <button v-tip:bottom="t('words.ankiTip')" type="button" class="y-btn sm" @click="exportAnki"><Icon name="download" :size="13" :weight="2" />Anki</button>
          <RouterLink v-tip:bottom="t('story.entryTip')" to="/words/story" class="y-btn sm"><Icon name="book" :size="13" :weight="2" />{{ t('story.title') }}</RouterLink>
          <RouterLink to="/review" class="y-btn sm"><Icon name="repeat" :size="13" :weight="2" />{{ t('words.reviewDue') }}<em v-if="due" class="y-tag accent">{{ due }}</em></RouterLink>
        </div>
      </header>

      <label v-if="words.length" class="y-search">
        <Icon name="search" :size="15" :weight="2" />
        <input v-model="query" type="search" :placeholder="t('words.search')" :aria-label="t('words.search')" />
        <span v-if="query" class="y-count">{{ shown.length }}</span>
      </label>
      <p v-if="error" class="y-error">{{ error }}</p>

      <template v-if="shown.length">
        <ul class="y-rows y-wordlist">
          <li v-for="word in rows" :key="word.id" class="y-word y-fold" :class="{ open: openId === String(word.id) }" :data-word-id="word.id">
            <button type="button" class="y-row" :class="{ on: openId === String(word.id), busy: localizing === word.id }" :disabled="localizing === word.id" :aria-expanded="openId === String(word.id)" @click="toggle(word)">
              <Icon name="chevron" :size="13" :weight="2.2" class="turn" />
              <b :lang="word.language">{{ word.term }}</b>
              <span v-if="current(word)" class="y-word-gloss">{{ word.meaning }}</span>
              <time>{{ formatDate(word.created_at) }}</time>
            </button>
            <div class="y-fold-body"><div :inert="openId !== String(word.id)">
              <div v-if="openId === String(word.id) || closing === String(word.id)" class="y-entry">
                <div class="y-entry-top">
                  <p>{{ word.meaning }}</p>
                  <Speak :speech-id="`word-${word.id}-term`" :text="word.term" :language-code="word.language" show-label />
                </div>

                <div v-if="word.source_sentence" class="y-quote">
                  <blockquote :lang="word.language"><template v-for="(piece, at) in gapPieces(shownContext(word), String(word.term))" :key="at"><mark v-if="piece.gap">{{ piece.text }}</mark><template v-else>{{ piece.text }}</template></template></blockquote>
                  <p v-if="passageTranslation(word)" class="y-gloss">{{ passageTranslation(word) }}</p>
                  <p v-if="passageErrors[word.id]" class="y-error">{{ passageErrors[word.id] }}</p>
                  <div v-if="canTranslatePassage(word) || context(word).more" class="y-quote-tools">
                    <button v-if="canTranslatePassage(word)" type="button" class="y-link" :class="{ on: Boolean(passageTranslation(word)) }" :disabled="passageBusy[word.id]" @click="togglePassageTranslation(word)"><Icon name="language" :size="13" :weight="2" />{{ passageBusy[word.id] ? t('message.translating') : passageTranslation(word) ? t('message.hideTranslation') : t('message.showTranslation') }}</button>
                    <button v-if="context(word).more && !passageTranslation(word)" type="button" class="y-link" :aria-expanded="whole" @click="whole = !whole">{{ t('nav.more') }}<Icon name="chevron" :size="12" :weight="2.2" class="turn" /></button>
                  </div>
                </div>

                <footer>
                  <button v-if="word.details?.senses?.length" type="button" class="y-btn sm y-uses-open" :aria-expanded="usesWord?.id === word.id" @click="usesOpen = !usesOpen">{{ t('words.commonUses') }}<em class="y-count">{{ word.details.senses.length }}</em><Icon name="arrow" :size="13" :weight="2.2" /></button>
                  <span class="y-count">{{ word.language.toUpperCase() }}<template v-if="word.lemma && word.lemma !== word.term"> · {{ word.lemma }}</template></span>
                  <button type="button" class="y-link danger push" @click="remove(word.id)"><Icon name="trash" :size="13" :weight="2" />{{ t('words.remove') }}</button>
                </footer>
              </div>
            </div></div>
          </li>
        </ul>
        <div v-if="left" class="y-more-row"><button type="button" class="y-btn sm" @click="more">{{ t('nav.more') }}<em class="y-count">{{ left }}</em></button></div>
      </template>
      <div v-else class="y-empty"><p>{{ t('words.emptyTitle') }}</p></div>
    </div>

    <Transition name="y-veil"><div v-if="usesWord" class="y-veil clear y-uses-veil" @click="usesOpen = false"></div></Transition>
    <Transition name="y-drawer">
      <aside v-if="usesWord" class="y-drawer y-uses" :aria-label="t('words.commonUses')">
        <header>
          <div class="y-uses-title">
            <small>{{ t('words.commonUses') }}</small>
            <h2 :lang="usesWord.language">{{ usesWord.term }}</h2>
          </div>
          <button v-tip:bottom="t('common.close')" type="button" class="y-ic" :aria-label="t('common.close')" @click="usesOpen = false"><Icon name="close" :size="16" :weight="2" /></button>
        </header>
        <ol :key="usesWord.id" class="y-uses-list">
          <li v-for="(sense, at) in usesWord.details.senses" :key="sense.meaning + sense.example" :style="{ '--at': at }">
            <i>{{ Number(at) + 1 }}</i>
            <b>{{ sense.meaning }}</b>
            <p :lang="usesWord.language"><template v-for="(piece, pieceAt) in gapPieces(String(sense.example), String(usesWord.term))" :key="pieceAt"><mark v-if="piece.gap">{{ piece.text }}</mark><template v-else>{{ piece.text }}</template></template></p>
            <small v-if="sense.translation">{{ sense.translation }}</small>
            <div class="y-shadow-row"><Shadow listen :text="String(sense.example)" :language-code="String(usesWord.language)" /></div>
          </li>
        </ol>
      </aside>
    </Transition>
  </div>
</template>
