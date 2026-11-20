<script lang="ts">
import { prefersReducedMotion } from '../kit/interactions'

// One pointer listener serves every face on the page.
const faces = new Set<HTMLElement>()
let pointer: { x: number; y: number } | null = null
let frame = 0

function look() {
  frame = 0
  if (!pointer) return
  for (const face of faces) {
    face.dataset.live = ''
    for (const eye of face.querySelectorAll<HTMLElement>('.eye')) {
      const rect = eye.getBoundingClientRect()
      if (!rect.width) continue
      const dx = pointer.x - (rect.left + rect.width / 2)
      const dy = pointer.y - (rect.top + rect.height / 2)
      const distance = Math.hypot(dx, dy) || 1
      const reach = Math.min(1, distance / (rect.width * 1.6))
      eye.style.setProperty('--ex', ((dx / distance) * reach).toFixed(3))
      eye.style.setProperty('--ey', ((dy / distance) * reach).toFixed(3))
    }
  }
}
function track(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  pointer = { x: event.clientX, y: event.clientY }
  if (!frame) frame = requestAnimationFrame(look)
}
function join(el: HTMLElement) {
  if (!faces.size) window.addEventListener('pointermove', track, { passive: true })
  faces.add(el)
}
function leave(el: HTMLElement) {
  faces.delete(el)
  if (!faces.size) window.removeEventListener('pointermove', track)
}
</script>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** A face made of two eyes and a mouth. Its size follows the font-size of whatever holds it. */
withDefaults(defineProps<{ mood?: 'calm' | 'talk' | 'happy' | 'flat' | 'worried' | 'sleepy' | 'wow' }>(), { mood: 'calm' })

const root = ref<HTMLElement | null>(null)
const blinking = ref(false)
let timer = 0

function scheduleBlink() {
  timer = window.setTimeout(() => {
    blinking.value = true
    window.setTimeout(() => { blinking.value = false }, 150)
    scheduleBlink()
  }, 2400 + Math.random() * 3800)
}

onMounted(() => {
  if (root.value) join(root.value)
  if (!prefersReducedMotion()) scheduleBlink()
})
onBeforeUnmount(() => {
  if (root.value) leave(root.value)
  window.clearTimeout(timer)
})
</script>

<template>
  <span ref="root" class="bk-face" :class="[mood, { blinking }]" aria-hidden="true">
    <i class="eye"><i class="pupil"></i></i><i class="eye"><i class="pupil"></i></i><i class="mouth"></i>
  </span>
</template>

<style>
.bk-face{--spring:cubic-bezier(.3,1.6,.45,1);flex:none;width:2.3em;display:inline-flex;flex-wrap:wrap;justify-content:space-between;line-height:0;vertical-align:middle}
.bk-face .eye{position:relative;width:1em;height:1em;display:grid;place-items:center;border-radius:50%;background:var(--face-eye,#fff);transition:transform .09s ease-in,height .3s var(--spring),border-radius .3s}
.bk-face .pupil{position:relative;width:44%;height:44%;border-radius:50%;background:var(--face-pupil,#151515);transform:translate(calc(var(--ex,0) * 58%),calc(var(--ey,0) * 58%));transition:transform .16s ease-out,width .4s var(--spring),height .4s var(--spring)}
.bk-face .pupil::after{content:'';position:absolute;left:18%;top:16%;width:26%;height:26%;border-radius:50%;background:var(--face-eye,#fff)}
.bk-face:not([data-live]) .pupil{animation:bk-face-look 7s ease-in-out infinite}
@keyframes bk-face-look{0%,18%{transform:translate(0,0)}26%,44%{transform:translate(-38%,10%)}52%,70%{transform:translate(42%,-8%)}78%,100%{transform:translate(0,0)}}
.bk-face.blinking .eye{transform:scaleY(.07)}
.bk-face .mouth{flex:none;width:.92em;height:.46em;margin:.2em auto 0;border-radius:0 0 999px 999px;background:var(--face-mouth,#ff5a36);transition:width .5s var(--spring),height .5s var(--spring),border-radius .4s,transform .4s var(--spring)}

.bk-face.talk .mouth{animation:bk-face-talk .62s ease-in-out infinite alternate}
@keyframes bk-face-talk{0%{width:.92em;height:.46em;border-radius:0 0 999px 999px}50%{width:.5em;height:.56em;border-radius:999px}100%{width:.7em;height:.26em;border-radius:999px}}
.bk-face.happy .eye{height:.56em;margin-top:.44em;border-radius:999px 999px 0 0}
.bk-face.happy .pupil{opacity:0}
.bk-face.happy .mouth{width:1.3em;height:.66em}
.bk-face.flat .mouth{width:.9em;height:.16em;border-radius:999px;margin-top:.34em}
.bk-face.flat .pupil{width:38%;height:38%}
.bk-face.worried .mouth{width:.8em;height:.38em;border-radius:999px 999px 0 0;margin-top:.3em}
.bk-face.worried .pupil{width:34%;height:34%}
.bk-face.worried .eye:first-child{transform:rotate(-8deg)}
.bk-face.worried .eye:nth-child(2){transform:rotate(8deg)}
.bk-face.sleepy .eye{height:.14em;margin-top:.5em;border-radius:999px}
.bk-face.sleepy .pupil{opacity:0}
.bk-face.sleepy .mouth{width:.34em;height:.34em;border-radius:50%;margin-top:.36em;animation:bk-face-snore 2.6s ease-in-out infinite}
@keyframes bk-face-snore{50%{transform:scale(1.5)}}
.bk-face.wow .mouth{width:.5em;height:.6em;border-radius:50%}
.bk-face.wow .pupil{width:30%;height:30%}
@media (prefers-reduced-motion:reduce){.bk-face:not([data-live]) .pupil,.bk-face.talk .mouth,.bk-face.sleepy .mouth{animation:none}}
</style>
