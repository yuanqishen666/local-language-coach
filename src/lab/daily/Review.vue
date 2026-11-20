<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import Face from '../blocks/Face.vue'
import Fold from './Fold.vue'
import Speak from './Speak.vue'
import Shadow from './Shadow.vue'
import { useReviewPage } from '../logic/ReviewPage'
import { gapPieces, sentenceWith } from './text'

const { t, queue, index, revealed, mode, done, error, loading, word, rate, nextIn } = useReviewPage()

// Presentation only. The card asks with the one sentence that holds the word; the passage it came
// from waits behind "more". Space turns the card, 1-4 grade it.
const whole = ref(false)
watch(() => [word.value?.id, index.value], () => { whole.value = false })
const context = computed(() => sentenceWith(word.value?.source_sentence, String(word.value?.term || ''), word.value?.language))
const shownText = computed(() => (whole.value ? String(word.value?.source_sentence || '') : context.value.sentence))
const pieces = computed(() => (word.value ? gapPieces(shownText.value, String(word.value.term)) : []))
const progress = computed(() => (queue.value.length ? (index.value / queue.value.length) * 100 : 0))

type Mood = 'calm' | 'wow' | 'worried' | 'flat' | 'happy'
const grades = computed<Array<{ value: number; label: string; due: string; mood: Mood }>>(() => [
  { value: 1, label: t('review.again'), due: nextIn(1) || t('review.tenMinutes'), mood: 'worried' },
  { value: 2, label: t('review.hard'), due: nextIn(2) || t('review.oneDay'), mood: 'flat' },
  { value: 3, label: t('review.good'), due: nextIn(3) || t('review.threeDays'), mood: 'calm' },
  { value: 4, label: t('review.easy'), due: nextIn(4) || t('review.longer'), mood: 'happy' },
])
const leaning = ref<Mood | ''>('')
const mood = computed<Mood>(() => leaning.value || (revealed.value ? 'wow' : 'calm'))
watch(() => [word.value?.id, index.value], () => { leaning.value = '' })

function onKey(event: KeyboardEvent) {
  if (!word.value || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable]')) return
  if (!revealed.value) {
    if (event.key === ' ' || event.key === 'Enter') {
      if (target?.closest('button, a, summary')) return
      event.preventDefault()
      revealed.value = true
    }
    return
  }
  if (['1', '2', '3', '4'].includes(event.key)) {
    event.preventDefault()
    void rate(Number(event.key))
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="y-page narrow y-review">
    <header class="y-head">
      <h1>{{ t('review.title') }}</h1>
      <span v-if="word" class="y-count">{{ index + 1 }} / {{ queue.length }}</span>
      <div v-if="word" class="y-seg push" role="group">
        <button type="button" :aria-pressed="mode === 'production'" @click="mode = 'production'">{{ t('review.recall') }}</button>
        <button type="button" :aria-pressed="mode === 'recognition'" @click="mode = 'recognition'">{{ t('review.recognize') }}</button>
      </div>
    </header>
    <p v-if="error" class="y-error">{{ error }}</p>

    <template v-if="word">
      <div class="y-progress" aria-hidden="true"><i :style="{ width: `${progress}%` }"></i></div>
      <Transition name="y-deal" mode="out-in">
        <section :key="`${word.id}:${index}`" class="y-card" :class="{ revealed }">
          <i class="y-card-face" aria-hidden="true"><Face :mood="mood" /></i>

          <div class="y-card-ask">
            <template v-if="mode === 'production'">
              <p v-if="pieces.length" class="y-ask" :lang="word.language">
                <template v-for="(piece, at) in pieces" :key="at"><span v-if="piece.gap" class="y-gap" :class="{ filled: revealed }"><i>{{ piece.text }}</i></span><template v-else>{{ piece.text }}</template></template>
              </p>
              <p class="y-hint" :class="{ 'y-clamp2': !revealed }">{{ word.meaning }}</p>
            </template>
            <template v-else>
              <h2 class="y-term" :lang="word.language">{{ word.term }}</h2>
              <p v-if="shownText" class="y-ask quiet" :lang="word.language"><template v-for="(piece, at) in pieces" :key="at"><mark v-if="piece.gap">{{ piece.text }}</mark><template v-else>{{ piece.text }}</template></template></p>
            </template>
            <button v-if="context.more" type="button" class="y-link" :aria-expanded="whole" @click="whole = !whole">{{ t('nav.more') }}<Icon name="chevron" :size="12" :weight="2.2" class="turn" /></button>
          </div>

          <div class="y-fold" :class="{ open: revealed }">
            <div class="y-fold-body"><div :inert="!revealed">
              <div class="y-answer">
                <div class="y-answer-main">
                  <small class="y-label">{{ t('review.answer') }}</small>
                  <b :lang="mode === 'production' ? word.language : undefined">{{ mode === 'production' ? word.term : word.meaning }}</b>
                  <Speak speech-id="review-term" :text="word.term" :language-code="word.language" />
                </div>
                <Fold v-if="word.details?.senses?.[0]?.example" :title="t('words.commonUses')">
                  <p class="y-example" :lang="word.language">{{ word.details.senses[0].example }}<Speak speech-id="review-example" :text="word.details.senses[0].example" :language-code="word.language" /></p>
                  <div class="y-shadow-row"><Shadow :text="word.details.senses[0].example" :language-code="word.language" /></div>
                </Fold>
              </div>
            </div></div>
          </div>

          <footer>
            <button v-if="!revealed" type="button" class="y-btn primary wide" @click="revealed = true">{{ t('review.showAnswer') }}<kbd class="y-kbd" aria-hidden="true">Space</kbd></button>
            <div v-else class="y-grades">
              <button v-for="grade in grades" :key="grade.value" type="button" :class="`g${grade.value}`" @click="rate(grade.value)" @mouseenter="leaning = grade.mood" @mouseleave="leaning = ''" @focus="leaning = grade.mood" @blur="leaning = ''">
                <b>{{ grade.label }}</b><small>{{ grade.due }}</small><kbd class="y-kbd" aria-hidden="true">{{ grade.value }}</kbd>
              </button>
            </div>
          </footer>
        </section>
      </Transition>
    </template>

    <div v-else-if="!loading && !error" class="y-empty">
      <i aria-hidden="true"><Face :mood="done ? 'happy' : 'sleepy'" /></i>
      <p>{{ done ? t('review.done') : t('review.nothingDue') }}</p>
      <RouterLink to="/words" class="y-btn sm">{{ t('review.back') }}</RouterLink>
    </div>
  </div>
</template>
