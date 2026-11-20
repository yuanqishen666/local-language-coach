<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import '../core/all.css'
import './theme.css'
import Icon from '../kit/Icon.vue'
import LabSwitch from '../kit/Switch.vue'
import Tabs from '../core/Tabs.vue'
import { prefersReducedMotion } from '../kit/interactions'
import { shellFoot, shellMain, useShell } from '../useShell'

const { store, route, t, focus, plain, reviewDue, languageCode, level, navOn } = useShell()
provide('labReviewDue', reviewDue)

/**
 * A caption that trails the pointer and says what a click will do. It reads the text from the
 * action already written inside the card or row, so the words stay the page's own.
 */
const tag = ref<HTMLElement | null>(null)
const tagText = ref('')
const tagOn = ref(false)
let goalX = 0
let goalY = 0
let x = 0
let y = 0
let frame = 0

function captionFor(target: Element | null) {
  if (!target || target.closest('.c-row-acts .c-icon, [data-tip]')) return ''
  const own = target.closest<HTMLElement>('[data-follow]')
  if (own) return own.dataset.follow || ''
  const row = target.closest('.c-talk')
  if (row) return row.querySelector('.c-row-go')?.textContent?.trim() || ''
  const preset = target.closest('.c-preset:not(:disabled)')
  if (preset) return preset.querySelector('.c-preset-go')?.textContent?.trim() || ''
  return ''
}
function step() {
  const ease = prefersReducedMotion() ? 1 : 0.2
  x += (goalX - x) * ease
  y += (goalY - y) * ease
  if (tag.value) tag.value.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`
  frame = Math.abs(goalX - x) > 0.4 || Math.abs(goalY - y) > 0.4 ? requestAnimationFrame(step) : 0
}
function follow(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  const text = captionFor(event.target as Element | null)
  goalX = event.clientX + 16
  goalY = event.clientY + 20
  if (text) {
    if (!tagOn.value) { x = goalX; y = goalY }
    tagText.value = text
  }
  tagOn.value = Boolean(text)
  if (!frame) frame = requestAnimationFrame(step)
}
function drop() { tagOn.value = false }

onMounted(() => {
  window.addEventListener('pointermove', follow, { passive: true })
  window.addEventListener('scroll', drop, { passive: true, capture: true })
  document.documentElement.addEventListener('pointerleave', drop)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', follow)
  window.removeEventListener('scroll', drop, { capture: true })
  document.documentElement.removeEventListener('pointerleave', drop)
  cancelAnimationFrame(frame)
})
watch(() => route.fullPath, drop)
</script>

<template>
  <div class="th gallery" :class="{ focus, plain }">
    <header v-if="!plain && !focus" class="top">
      <RouterLink to="/" class="brand">{{ t('product.name') }}</RouterLink>
      <nav class="pill">
        <RouterLink v-for="item in shellMain" :key="item.to" :to="item.to" class="link" :class="{ on: navOn(item.to) }">
          {{ t(item.label) }}<em v-if="item.to === '/review' && reviewDue">{{ reviewDue }}</em>
        </RouterLink>
      </nav>
      <RouterLink v-for="item in shellFoot" :key="item.to" :to="item.to" class="set" :class="{ on: navOn(item.to) }">
        <span class="lang">{{ languageCode.toUpperCase() }}<template v-if="level"> · {{ level }}</template></span>
        <Icon :name="item.icon" :size="16" :weight="1.8" /><b>{{ t(item.label) }}</b>
      </RouterLink>
    </header>

    <main>
      <RouterView v-slot="{ Component }">
        <Transition name="c-view" mode="out-in"><component :is="Component" /></Transition>
      </RouterView>
    </main>

    <Tabs v-if="!plain && !focus" :active="navOn" :due="reviewDue" />
    <div ref="tag" class="follow" :class="{ on: tagOn }" aria-hidden="true">{{ tagText }}</div>
    <Transition name="c-toast"><div v-if="store.toast" class="c-toast" role="status">{{ store.toast }}</div></Transition>
    <LabSwitch :low="!focus && !plain" />
  </div>
</template>

<style scoped>
main{min-height:calc(100vh - var(--c-top,0px));min-height:calc(100dvh - var(--c-top,0px))}

.top{position:fixed;left:0;right:0;top:0;z-index:60;height:78px;padding:0 20px;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px;pointer-events:none}
.top>*{pointer-events:auto}
.brand{justify-self:start;height:46px;padding:0 20px;display:inline-flex;align-items:center;border-radius:99px;background:var(--c-surface);font-size:17px;font-weight:500;letter-spacing:-.03em;transition:background .25s,color .25s}
.brand:hover{background:var(--c-accent)}
.pill{display:flex;gap:2px;padding:5px;border-radius:99px;background:rgba(14,14,14,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.link{height:36px;padding:0 16px;display:inline-flex;align-items:center;gap:8px;border-radius:99px;color:rgba(255,255,255,.64);font-size:13.5px;font-weight:500;white-space:nowrap;transition:background .25s,color .25s}
.link:hover{color:#fff}
.link.on{background:#fff;color:#0e0e0e}
.link em{min-width:18px;height:18px;padding:0 5px;display:grid;place-items:center;border-radius:99px;background:var(--c-accent);color:#0e0e0e;font:500 10.5px/1 var(--c-mono)}
.set{justify-self:end;height:46px;padding:0 18px 0 6px;display:inline-flex;align-items:center;gap:9px;border-radius:99px;background:var(--c-surface);font-size:13.5px;white-space:nowrap;transition:background .25s,color .25s}
.set b{font-weight:500}
.lang{height:34px;margin-right:3px;padding:0 12px;display:inline-flex;align-items:center;border-radius:99px;background:var(--c-bg);font:500 11px/1 var(--c-mono);letter-spacing:.06em;transition:background .25s}
.set:hover,.set.on{background:var(--c-ink);color:#fff}
.set:hover .lang,.set.on .lang{background:rgba(255,255,255,.16)}

.follow{position:fixed;left:0;top:0;z-index:300;padding:9px 14px;border-radius:99px;background:var(--c-accent);box-shadow:0 0 0 1.5px #0e0e0e;color:#0e0e0e;font-size:12.5px;font-weight:500;line-height:1;white-space:nowrap;pointer-events:none;opacity:0;scale:.5;transform-origin:0 0;transition:opacity .18s,scale .45s var(--c-ease)}
.follow.on{opacity:1;scale:1}

@media (max-width:1040px){
  .lang{display:none}
  .set{padding-left:16px}
  .link{padding:0 12px}
}
@media (max-width:760px){
  .top{display:none}
}
@media (hover:none){.follow{display:none}}
</style>
