<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, type Component } from 'vue'
import Icon from '../kit/Icon.vue'
import Speak from './Speak.vue'
import { useReviewPage } from '../logic/ReviewPage'

const { t, queue, index, revealed, mode, done, error, loading, word, rate } = useReviewPage()
const mascot = inject<Component | null>('labMascot', null)

// Presentation only: the sentence with its gap, a progress line, and keys for the two things you do here.
const pieces = computed(() => {
  const sentence = word.value?.source_sentence
  if (!sentence || !word.value) return []
  try {
    const escaped = String(word.value.term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return sentence.split(new RegExp(`(${escaped})`, 'ig')).map((text: string, at: number) => ({ text, gap: at % 2 === 1 }))
  } catch {
    return [{ text: sentence, gap: false }]
  }
})
const filledIn = computed(() => mode.value === 'production' && pieces.value.some((piece: { gap: boolean }) => piece.gap))
const left = computed(() => Math.max(0, queue.value.length - index.value))
const progress = computed(() => (queue.value.length ? (index.value / queue.value.length) * 100 : 0))
const grades = computed(() => [
  { value: 1, label: t('review.again'), due: t('review.tenMinutes'), mood: 'worried' },
  { value: 2, label: t('review.hard'), due: t('review.oneDay'), mood: 'flat' },
  { value: 3, label: t('review.good'), due: t('review.threeDays'), mood: 'calm' },
  { value: 4, label: t('review.easy'), due: t('review.longer'), mood: 'happy' },
])

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
  <div class="c-page c-review">
    <header class="c-head">
      <h1 class="c-title">{{ t('review.title') }}</h1>
      <div v-if="word" class="c-left"><span>{{ t('review.left') }}</span><b>{{ left }}</b></div>
    </header>
    <p v-if="error" class="c-error">{{ error }}</p>

    <div v-if="word" class="c-review-stage">
      <div class="c-progress" aria-hidden="true"><i :style="{ width: `${progress}%` }"></i></div>
      <Transition name="c-deal" mode="out-in">
        <section :key="word.id" class="c-card" :class="{ revealed }">
          <div class="c-card-top">
            <span class="c-label">{{ index + 1 }} / {{ queue.length }}</span>
            <div class="c-seg quiet" role="group">
              <button type="button" :aria-pressed="mode === 'production'" @click="mode = 'production'">{{ t('review.recall') }}</button>
              <button type="button" :aria-pressed="mode === 'recognition'" @click="mode = 'recognition'">{{ t('review.recognize') }}</button>
            </div>
          </div>

          <div class="c-card-ask">
            <template v-if="mode === 'production'">
              <blockquote v-if="pieces.length" class="c-ask" :lang="revealed ? word.language : undefined">
                <template v-for="(piece, at) in pieces" :key="at"><span v-if="piece.gap" class="c-gap" :class="{ filled: revealed }"><i v-if="revealed">{{ piece.text }}</i></span><template v-else>{{ piece.text }}</template></template>
              </blockquote>
              <p class="c-hint">{{ word.meaning }}</p>
            </template>
            <template v-else>
              <h2 class="c-term" :lang="word.language">{{ word.term }}</h2>
              <blockquote class="c-ask small" :lang="word.language">{{ word.source_sentence }}</blockquote>
            </template>
          </div>

          <Transition name="c-reveal">
            <div v-if="revealed" class="c-answer" :class="{ bare: filledIn }">
              <Speak v-if="filledIn" speech-id="review-term" :text="word.term" :language-code="word.language" show-label />
              <template v-else>
                <small class="c-label">{{ t('review.answer') }}</small>
                <div class="c-answer-head"><h2 :lang="mode === 'production' ? word.language : undefined">{{ mode === 'production' ? word.term : word.meaning }}</h2><Speak speech-id="review-term" :text="word.term" :language-code="word.language" /></div>
              </template>
              <details v-if="word.details?.senses?.[0]?.example" class="c-fold">
                <summary><span>{{ t('words.commonUses') }}</span><Icon name="chevron" :size="15" :weight="2.2" /></summary>
                <div class="c-example"><p :lang="word.language">{{ word.details.senses[0].example }}</p><Speak speech-id="review-example" :text="word.details.senses[0].example" :language-code="word.language" compact /></div>
              </details>
            </div>
          </Transition>

          <footer class="c-card-foot">
            <button v-if="!revealed" type="button" class="c-btn primary big" @click="revealed = true">{{ t('review.showAnswer') }}<kbd aria-hidden="true">Space</kbd></button>
            <div v-else class="c-grades">
              <button v-for="grade in grades" :key="grade.value" type="button" :class="`g${grade.value}`" @click="rate(grade.value)">
                <i v-if="mascot" class="c-grade-face" aria-hidden="true"><component :is="mascot" :mood="grade.mood" /></i>
                <b>{{ grade.label }}</b><small>{{ grade.due }}</small><kbd aria-hidden="true">{{ grade.value }}</kbd>
              </button>
            </div>
          </footer>
        </section>
      </Transition>
    </div>

    <div v-else-if="!loading && !error" class="c-empty c-review-done">
      <i v-if="mascot" aria-hidden="true"><component :is="mascot" :mood="done ? 'happy' : 'sleepy'" /></i>
      <h2>{{ done ? t('review.done') : t('review.nothingDue') }}</h2>
      <RouterLink to="/words" class="c-btn">{{ t('review.back') }}</RouterLink>
    </div>
  </div>
</template>
