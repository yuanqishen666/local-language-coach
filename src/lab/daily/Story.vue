<script setup lang="ts">
import './daily.css'
import './pages.css'
import { computed } from 'vue'
import Icon from '../kit/Icon.vue'
import Face from '../blocks/Face.vue'
import Speak from './Speak.vue'
import { vTip } from '../core/tip'
import { useStoryPage } from '../logic/StoryPage'
import type { StorySentence } from '../../../shared/wordbook'

const { t, story, stories, state, error, starting, picked, wordBusy, levelName, write, talk, openWord, formatDate } = useStoryPage()

// Presentation only: the story reads as one passage, with the saved words standing out where they
// are used. A word opens its meaning when it is clicked, in the passage or in the list below it.
type Piece = { text: string; wordId?: string }
function piecesOf(sentence: StorySentence): Piece[] {
  const text = sentence.text
  const folded = text.toLowerCase()
  const hay = folded.length === text.length ? folded : text
  const found: Array<{ start: number; end: number; wordId: string }> = []
  for (const mark of sentence.marks) {
    const needle = hay === folded ? mark.surface.toLowerCase() : mark.surface
    if (!needle) continue
    let at = hay.indexOf(needle)
    while (at >= 0 && found.some((item) => at < item.end && at + needle.length > item.start)) at = hay.indexOf(needle, at + 1)
    if (at >= 0) found.push({ start: at, end: at + needle.length, wordId: mark.wordId })
  }
  found.sort((a, b) => a.start - b.start)
  const pieces: Piece[] = []
  let cursor = 0
  for (const item of found) {
    if (item.start > cursor) pieces.push({ text: text.slice(cursor, item.start) })
    pieces.push({ text: text.slice(item.start, item.end), wordId: item.wordId })
    cursor = item.end
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor) })
  return pieces
}
const spaced = computed(() => !/^(zh|ja)/u.test(story.value?.languageCode || ''))
const lines = computed(() => (story.value?.sentences || []).map(piecesOf))
const wholeText = computed(() => (story.value?.sentences || []).map((sentence) => sentence.text).join(spaced.value ? ' ' : ''))
</script>

<template>
  <div class="y-page narrow y-recap y-story">
    <header class="y-head">
      <RouterLink v-tip:bottom="t('common.back')" :to="state === 'ready' || state === 'missing' ? '/words/story' : '/words'" class="y-ic" :aria-label="t('common.back')"><Icon name="back" :size="16" :weight="2" /></RouterLink>
      <h1>{{ t('story.title') }}</h1>
      <button v-if="state === 'ready' || (state === 'list' && stories.length)" v-tip:bottom="t('story.entryTip')" type="button" class="y-btn sm push" @click="write"><Icon name="plus" :size="13" :weight="2" />{{ t('story.write') }}</button>
    </header>

    <p v-if="state === 'loading' || state === 'writing'" class="y-recap-wait" role="status"><span class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span><template v-if="state === 'writing'">{{ t('story.writing') }}</template></p>

    <template v-else>
      <p v-if="error" class="y-error" role="alert">{{ error }}</p>

      <template v-if="state === 'ready' && story">
        <section class="y-recap-part">
          <div class="y-read-head">
            <h2 :lang="story.languageCode">{{ story.title }}</h2>
            <Speak :speech-id="`story-${story.id}`" :text="wholeText" :language-code="story.languageCode" compact />
            <span v-if="levelName" class="y-tag">{{ levelName }}</span>
          </div>
          <p class="y-read-text" :lang="story.languageCode">
            <template v-for="(line, at) in lines" :key="at"><template v-if="at && spaced">{{ ' ' }}</template><template v-for="(piece, index) in line" :key="index"><button v-if="piece.wordId" type="button" class="y-read-word" :aria-pressed="picked === piece.wordId" @click="openWord(piece.wordId)">{{ piece.text }}</button><template v-else>{{ piece.text }}</template></template></template>
          </p>
        </section>

        <section v-if="story.words.length" class="y-recap-part">
          <h2 class="y-h2">{{ t('story.words') }}</h2>
          <ul class="y-read-words">
            <li v-for="word in story.words" :key="word.wordId" :class="{ on: picked === word.wordId }">
              <button type="button" :aria-expanded="picked === word.wordId" @click="openWord(word.wordId)">
                <b :lang="story.languageCode">{{ word.term }}</b>
                <em v-if="!word.used" class="y-tag">{{ t('story.unused') }}</em>
                <Icon name="chevron" :size="12" :weight="2.2" class="turn" />
              </button>
              <p v-if="picked === word.wordId && (word.meaning || wordBusy === word.wordId)">
                <span v-if="!word.meaning" class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span><template v-else>{{ word.meaning }}</template>
              </p>
            </li>
          </ul>
        </section>

        <footer class="y-recap-end">
          <button type="button" class="y-btn primary go" :disabled="starting" @click="talk">{{ story.conversationId ? t('story.resume') : t('story.talk') }}<Icon name="arrow" :size="14" :weight="2.2" /></button>
        </footer>
      </template>

      <template v-else-if="state === 'list'">
        <section v-if="stories.length" class="y-recap-part">
          <h2 class="y-h2">{{ t('story.recent') }}</h2>
          <ul class="y-rows">
            <li v-for="item in stories" :key="item.id">
              <RouterLink :to="`/words/story/${item.id}`" class="y-row"><b :lang="item.languageCode">{{ item.title }}</b><time>{{ formatDate(item.createdAt) }}</time></RouterLink>
            </li>
          </ul>
        </section>
        <div v-else class="y-empty">
          <i aria-hidden="true"><Face mood="calm" /></i>
          <p>{{ t('story.entryTip') }}</p>
          <button type="button" class="y-btn primary" @click="write"><Icon name="plus" :size="13" :weight="2" />{{ t('story.write') }}</button>
        </div>
      </template>
    </template>
  </div>
</template>
