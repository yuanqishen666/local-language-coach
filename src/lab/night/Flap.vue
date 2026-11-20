<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { prefersReducedMotion } from '../kit/interactions'

/** Split-flap lettering: every glyph flips through a few others before it lands. */
const props = withDefaults(defineProps<{ text: string; delay?: number }>(), { delay: 0 })

type Cell = { shown: string; done: boolean }
const words = ref<Cell[][]>([])
let timers: number[] = []

const LATIN = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
const DIGITS = [...'0123456789']
function pick(glyph: string, own: string[]) {
  if (/\d/u.test(glyph)) return DIGITS[Math.floor(Math.random() * 10)]
  if (/[a-z]/iu.test(glyph)) {
    const letter = LATIN[Math.floor(Math.random() * 26)]
    return glyph === glyph.toLowerCase() ? letter.toLowerCase() : letter
  }
  return own[Math.floor(Math.random() * own.length)] || glyph
}

function run() {
  timers.forEach((timer) => window.clearTimeout(timer))
  timers = []
  const source = props.text.split(' ').map((word) => [...word])
  if (prefersReducedMotion()) {
    words.value = source.map((word) => word.map((glyph) => ({ shown: glyph, done: true })))
    return
  }
  const own = source.flat()
  words.value = source.map((word) => word.map(() => ({ shown: '\u00a0', done: false })))
  let index = 0
  source.forEach((word, wordIndex) => word.forEach((glyph, glyphIndex) => {
    const order = index++
    const flips = 2 + (order % 3)
    for (let step = 0; step <= flips; step++) {
      timers.push(window.setTimeout(() => {
        const cell = words.value[wordIndex]?.[glyphIndex]
        if (!cell) return
        cell.shown = step === flips ? glyph : pick(glyph, own)
        cell.done = step === flips
      }, props.delay + order * 60 + step * 85))
    }
  }))
}

watch(() => props.text, run, { immediate: true })
onBeforeUnmount(() => timers.forEach((timer) => window.clearTimeout(timer)))
</script>

<template>
  <span class="flap" :aria-label="text" role="text">
    <template v-for="(word, wordIndex) in words" :key="wordIndex">
      <span class="word" aria-hidden="true"><span v-for="(cell, cellIndex) in word" :key="cellIndex" class="cell" :class="{ done: cell.done }"><i :key="cell.shown">{{ cell.shown }}</i></span></span>{{ wordIndex < words.length - 1 ? ' ' : '' }}
    </template>
  </span>
</template>

<style scoped>
.word{display:inline-block;white-space:nowrap}
.cell{display:inline-block;perspective:400px}
.cell i{display:inline-block;font-style:normal;transform-origin:50% 60%;animation:flip .16s ease-out both;backface-visibility:hidden}
.cell:not(.done) i{color:var(--amber)}
@keyframes flip{from{transform:rotateX(-88deg);opacity:.3}}
@media (prefers-reduced-motion:reduce){.cell i{animation:none}}
</style>
