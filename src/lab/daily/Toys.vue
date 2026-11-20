<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { clamp, hasFinePointer, prefersReducedMotion, vDrag } from '../kit/interactions'

// Something to rest the eyes on beside a page: a few plain shapes that drift, lean toward the
// pointer, spin when clicked and spring back when dragged. They carry no meaning, so they are
// hidden from assistive technology and cannot be reached with the keyboard.
defineProps<{ side: 'left' | 'right' }>()

const shapes = ['a', 'b', 'c', 'd', 'e']
const box = ref<HTMLElement | null>(null)
const spinning = ref(-1)
let frame = 0
let pointer = { x: 0, y: 0 }

function lean() {
  frame = 0
  const el = box.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (!rect.width) return
  el.style.setProperty('--px', clamp(((pointer.x - (rect.left + rect.width / 2)) / window.innerWidth) * 2, -1, 1).toFixed(3))
  el.style.setProperty('--py', clamp(((pointer.y - (rect.top + rect.height / 2)) / window.innerHeight) * 2, -1, 1).toFixed(3))
}
function track(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  pointer = { x: event.clientX, y: event.clientY }
  if (!frame) frame = requestAnimationFrame(lean)
}
function spin(index: number) {
  spinning.value = -1
  requestAnimationFrame(() => { spinning.value = index })
}
function settle(event: AnimationEvent) {
  if (event.animationName === 'yt-spin') spinning.value = -1
}

onMounted(() => {
  if (hasFinePointer() && !prefersReducedMotion()) window.addEventListener('pointermove', track, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', track)
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <div ref="box" class="yt" :class="side" aria-hidden="true">
    <span v-for="(shape, index) in shapes" :key="shape" v-drag class="yt-piece" :class="[shape, { spin: spinning === index }]" @click="spin(index)" @animationend="settle"><i></i></span>
  </div>
</template>
