<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '../kit/Icon.vue'
import { clamp, hasFinePointer, prefersReducedMotion } from '../kit/interactions'
import { formatWhen } from '../kit/when'
import { useHomePage } from '../logic/HomePage'

const { t, locale } = useI18n()
const { store, history, creating, startError, startConversation, displayTitle } = useHomePage()
const modelReady = computed(() => Boolean(store.settings?.modelReady))

const hero = ref<HTMLElement | null>(null)
const sealEl = ref<HTMLElement | null>(null)
const ready = ref(false)
const fine = ref(false)
const pressing = ref(false)
const stamping = ref(false)
const hovering = ref(false)
const seal = { x: 0, y: 0, rot: -6 }
const imprint = ref<{ x: number; y: number; rot: number } | null>(null)

const ENSO_BODY = [
  { width: 34, length: 26 },
  { width: 31, length: 38 },
  { width: 27, length: 50 },
  { width: 23, length: 61 },
  { width: 19, length: 71 },
  { width: 15, length: 80 },
  { width: 11, length: 87 },
]
const ENSO_HAIRS = [
  { r: 144, from: 82, length: 11 },
  { r: 150, from: 85, length: 10.5 },
  { r: 156, from: 80, length: 12 },
]

const WIDE_GLYPH = /[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/u
function glyphUnits(text: string) {
  return [...text].reduce((sum, glyph) => sum + (WIDE_GLYPH.test(glyph) ? 1 : 0.54), 0)
}

const title = computed(() => {
  const text = t('home.openTitle')
  const code = String(locale.value)
  const glyphs = [...text]
  const staggered = code.startsWith('zh') && glyphs.length === 4
  const lines = staggered ? [glyphs.slice(0, 2).join(''), glyphs.slice(2).join('')] : [text]
  const splitGlyphs = !code.startsWith('hi')
  const total = glyphUnits(text)
  const longestWord = Math.max(...text.split(' ').map(glyphUnits))
  const units = staggered ? 2.56 : Math.max(longestWord, total / 1.6)
  let index = 0
  return {
    staggered,
    units,
    rows: staggered ? 2 : Math.max(1, Math.ceil(total / units)),
    lines: lines.map((line) => line.split(' ').map((word) => (splitGlyphs ? [...word] : [word]).map((glyph) => ({ glyph, index: index++ })))),
  }
})

let targetX = 0
let targetY = 0
let frame = 0
let glyphBoxes: { el: HTMLElement; x: number; y: number }[] = []

function localPoint(event: { clientX: number; clientY: number }) {
  const rect = hero.value!.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height }
}

function measureGlyphs() {
  if (!hero.value) return
  const rect = hero.value.getBoundingClientRect()
  glyphBoxes = [...hero.value.querySelectorAll<HTMLElement>('.glyph')].map((el) => {
    el.style.setProperty('--px', '0px')
    el.style.setProperty('--py', '0px')
    const box = el.getBoundingClientRect()
    return { el, x: box.left - rect.left + box.width / 2, y: box.top - rect.top + box.height / 2 }
  })
}

function nudgeGlyphs() {
  const reach = 190
  for (const box of glyphBoxes) {
    const dx = box.x - seal.x
    const dy = box.y - seal.y
    const distance = Math.hypot(dx, dy) || 1
    const force = hovering.value ? Math.max(0, 1 - distance / reach) ** 2 * 16 : 0
    box.el.style.setProperty('--px', `${((dx / distance) * force).toFixed(2)}px`)
    box.el.style.setProperty('--py', `${((dy / distance) * force).toFixed(2)}px`)
  }
}

function tick() {
  const lag = targetX - seal.x
  seal.x += lag * 0.22
  seal.y += (targetY - seal.y) * 0.22
  seal.rot += (-6 + clamp(lag * 0.22, -16, 16) - seal.rot) * 0.16
  placeSeal()
  nudgeGlyphs()
  frame = hovering.value ? requestAnimationFrame(tick) : 0
}

function placeSeal() {
  const style = sealEl.value?.style
  if (!style) return
  style.setProperty('--x', `${seal.x.toFixed(1)}px`)
  style.setProperty('--y', `${seal.y.toFixed(1)}px`)
  style.setProperty('--rot', `${seal.rot.toFixed(2)}deg`)
}

function onEnter(event: PointerEvent) {
  if (!fine.value || event.pointerType === 'touch' || stamping.value) return
  measureGlyphs()
  const point = localPoint(event)
  seal.x = targetX = point.x
  seal.y = targetY = point.y
  placeSeal()
  hovering.value = true
  if (!frame) frame = requestAnimationFrame(tick)
}

function onMove(event: PointerEvent) {
  if (!fine.value || event.pointerType === 'touch') return
  if (!hovering.value) onEnter(event)
  const point = localPoint(event)
  targetX = point.x
  targetY = point.y
  hero.value!.style.setProperty('--mx', (point.x / point.width - 0.5).toFixed(3))
  hero.value!.style.setProperty('--my', (point.y / point.height - 0.5).toFixed(3))
}

function onLeave() {
  hovering.value = false
  pressing.value = false
  nudgeGlyphs()
}

async function stamp(event: MouseEvent) {
  if (creating.value || stamping.value || !hero.value) return
  if (!modelReady.value) {
    await startConversation()
    return
  }
  const rect = hero.value.getBoundingClientRect()
  let x = seal.x
  let y = seal.y
  if (!(fine.value && hovering.value && event.detail > 0)) {
    const rest = sealEl.value?.getBoundingClientRect()
    x = rest ? rest.left - rect.left + rest.width / 2 : rect.width - 90
    y = rest ? rest.top - rect.top + rest.height / 2 : rect.height - 90
  }
  imprint.value = { x, y, rot: seal.rot }
  stamping.value = true
  pressing.value = false
  // Let the seal land before the page turns.
  if (!prefersReducedMotion()) await new Promise((resolve) => { window.setTimeout(resolve, 460) })
  await startConversation()
  if (startError.value) {
    stamping.value = false
    imprint.value = null
  }
}

function syncPointer() {
  fine.value = hasFinePointer()
  measureGlyphs()
}

onMounted(() => {
  syncPointer()
  window.addEventListener('resize', syncPointer)
  requestAnimationFrame(() => requestAnimationFrame(() => { ready.value = true }))
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncPointer)
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <div class="paper" :class="{ ready }">
    <svg class="defs" width="0" height="0" aria-hidden="true">
      <filter id="paper-brush" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="2" seed="7" result="warp" />
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="13" xChannelSelector="R" yChannelSelector="G" result="shape" />
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="2" result="fibre" />
        <feDisplacementMap in="shape" in2="fibre" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="paper-seal" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="2" seed="11" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" result="edge" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.6 2.2" result="wear" />
        <feComposite in="edge" in2="wear" operator="in" />
      </filter>
    </svg>


    <button
      ref="hero"
      class="hero"
      :class="{ fine, pressing, stamping, hovering, staggered: title.staggered }"
      :style="{ '--u': title.units, '--rows': title.rows }"
      :disabled="creating && !stamping"
      @pointerenter="onEnter"
      @pointermove="onMove"
      @pointerleave="onLeave"
      @pointerdown="pressing = true"
      @pointerup="pressing = false"
      @click="stamp"
    >
      <span class="enso" aria-hidden="true">
        <svg viewBox="0 0 400 400">
          <mask id="paper-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
            <circle class="reveal" cx="200" cy="200" r="150" pathLength="100" transform="rotate(-9 200 200)" />
          </mask>
          <g filter="url(#paper-brush)" mask="url(#paper-reveal)">
            <circle v-for="ring in ENSO_BODY" :key="ring.width" class="stroke" cx="200" cy="200" r="150" pathLength="100" :stroke-width="ring.width" :stroke-dasharray="`${ring.length} 100`" />
            <circle v-for="hair in ENSO_HAIRS" :key="hair.r" class="stroke hair" cx="200" cy="200" :r="hair.r" pathLength="100" :stroke-dasharray="`0 ${hair.from} ${hair.length} 100`" />
          </g>
        </svg>
      </span>

      <h1>
        <span v-for="(line, lineIndex) in title.lines" :key="lineIndex" class="line">
          <template v-for="(word, wordIndex) in line" :key="wordIndex">
            <span class="word"><span v-for="item in word" :key="item.index" class="glyph"><i :style="{ '--i': item.index }">{{ item.glyph }}</i></span></span>{{ wordIndex < line.length - 1 ? ' ' : '' }}
          </template>
        </span>
      </h1>

      <span v-if="imprint" class="imprint" :style="{ left: `${imprint.x}px`, top: `${imprint.y}px`, '--rot': `${imprint.rot}deg` }" aria-hidden="true">
        <i class="ring"></i><i class="face">见</i>
      </span>
      <span ref="sealEl" class="seal" aria-hidden="true">见</span>
    </button>

    <p v-if="startError" class="error" role="alert">{{ startError }}</p>

    <section class="lower" :class="{ solo: !history.length }">
      <RouterLink to="/start" class="scene">
        <span class="quotes" aria-hidden="true"><i>“</i><i>”</i></span>
        <h2>{{ t('home.settingTitle') }}</h2>
        <Icon name="chevron" :size="26" />
      </RouterLink>

      <div v-if="history.length" class="recent">
        <RouterLink to="/history" class="recent-head"><span>{{ t('home.recentOpen') }}</span><Icon name="chevron" :size="13" /></RouterLink>
        <RouterLink v-for="(item, index) in history.slice(0, 3)" :key="item.id" :to="`/conversation/${item.id}`" class="row">
          <i>{{ String(index + 1).padStart(2, '0') }}</i>
          <b>{{ displayTitle(item) }}</b>
          <time>{{ formatWhen(item.updatedAt, String(locale)) }}</time>
        </RouterLink>
      </div>
    </section>


  </div>
</template>

<style scoped>
.paper{
  position:relative;min-height:calc(100vh - var(--mast));min-height:calc(100dvh - var(--mast) - var(--tabs));display:grid;grid-template-rows:minmax(0,1fr) auto;color:var(--ink);isolation:isolate;
}
.defs{position:absolute}


.hero{--fs:min(calc(58vw / var(--u)),calc(47vh / var(--rows)),236px);position:relative;width:100%;min-height:340px;padding:0 56px 46px;display:flex;align-items:flex-end;overflow:hidden;border:0;background:none;color:inherit;text-align:left;cursor:pointer;touch-action:manipulation;-webkit-user-select:none;user-select:none}
.hero.fine{cursor:none}
.hero:focus-visible{outline:0}
.hero:focus-visible h1{text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:.12em;text-decoration-color:var(--red)}
.hero h1{position:relative;z-index:1;max-width:calc(var(--u) * 1.08em);margin:0;font-family:var(--serif);font-weight:500;font-size:var(--fs);line-height:.98;letter-spacing:-.045em;text-wrap:balance}
.hero.staggered h1{letter-spacing:-.07em}
.line{display:block}
.staggered .line + .line{margin-left:.56em}
.word{display:inline-block;white-space:nowrap}
.glyph{display:inline-block;padding:.08em 0 .1em;margin:-.08em 0 -.1em;overflow:hidden;vertical-align:top;transform:translate3d(var(--px,0),var(--py,0),0);transition:transform .5s var(--out)}
.hovering .glyph{transition-duration:.12s}
.glyph i{display:inline-block;font-style:normal;transform:translateY(112%);transition:transform 1.1s var(--out);transition-delay:calc(var(--i) * 70ms + 120ms)}
.ready .glyph i{transform:none}

.enso{position:absolute;right:max(4vw,36px);top:50%;z-index:0;width:min(58vh,36vw);aspect-ratio:1;transform:translateY(-52%) rotate(calc(var(--mx,0) * 26deg));transition:transform 1.2s var(--out);will-change:transform;pointer-events:none}
.enso svg{width:100%;height:100%;overflow:visible;transform:rotate(-118deg)}
.stroke{fill:none;stroke:var(--ink);stroke-linecap:round}
.stroke.hair{stroke-width:2.2;opacity:.8}
.reveal{fill:none;stroke:#fff;stroke-width:84;stroke-dasharray:100;stroke-dashoffset:100;transition:stroke-dashoffset 2.1s cubic-bezier(.62,0,.12,1) .3s}
.ready .reveal{stroke-dashoffset:0}

.seal,.imprint .face{width:96px;height:96px;display:grid;place-items:center;border-radius:13px;background:var(--red);color:var(--paper);font:500 54px/1 var(--serif);font-style:normal;box-shadow:inset 0 0 0 5px var(--red),inset 0 0 0 6.5px rgba(243,239,230,.82)}
.seal{position:absolute;right:52px;bottom:46px;z-index:3;pointer-events:none;transform:rotate(-6deg);transition:transform .45s var(--out),opacity .25s,filter .3s;filter:drop-shadow(0 16px 18px rgba(120,30,12,.26))}
.hero.fine .seal{left:0;top:0;right:auto;bottom:auto;margin:-48px 0 0 -48px;opacity:0;transform:translate3d(var(--x,0),var(--y,0),0) rotate(var(--rot,-6deg)) scale(.7);transition:opacity .25s,filter .2s}
.hero.fine.hovering .seal{opacity:1;transform:translate3d(var(--x,0),var(--y,0),0) rotate(var(--rot,-6deg)) scale(1)}
.hero.fine.hovering.pressing .seal{transform:translate3d(var(--x,0),var(--y,0),0) rotate(var(--rot,-6deg)) scale(.9);filter:drop-shadow(0 3px 4px rgba(120,30,12,.3))}
.hero:not(.fine):active .seal{transform:rotate(-6deg) scale(.9);filter:drop-shadow(0 3px 4px rgba(120,30,12,.3))}
.hero.stamping .seal{opacity:0!important;transition:opacity .18s .12s}

.imprint{position:absolute;z-index:2;width:96px;height:96px;margin:-48px 0 0 -48px;pointer-events:none;transform:rotate(var(--rot,-6deg))}
.imprint .face{position:absolute;inset:0;mix-blend-mode:multiply;filter:url(#paper-seal);animation:paper-press .5s var(--out) both}
.imprint .ring{position:absolute;inset:-6px;border-radius:18px;border:1.5px solid var(--red);opacity:0;animation:paper-ring .7s var(--out) .06s both}
@keyframes paper-press{from{transform:scale(1.16);opacity:.4}45%{transform:scale(.96);opacity:1}to{transform:scale(1);opacity:.94}}
@keyframes paper-ring{from{transform:scale(.9);opacity:.7}to{transform:scale(1.9);opacity:0}}

.error{position:fixed;left:50%;bottom:26px;z-index:40;margin:0;padding:10px 16px;border-radius:999px;background:var(--paper);box-shadow:inset 0 0 0 1px var(--red);color:var(--red);font-size:12px;transform:translateX(-50%)}

.lower{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);border-top:1px solid var(--line);opacity:0;transform:translateY(14px);transition:opacity .9s var(--out) .5s,transform .9s var(--out) .5s}
.ready .lower{opacity:1;transform:none}
.lower.solo{grid-template-columns:minmax(0,1fr)}
.scene{position:relative;min-height:228px;padding:32px 44px 30px 56px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;overflow:hidden;border-right:1px solid var(--line);isolation:isolate;transition:color .45s var(--out)}
.solo .scene{min-height:170px;border-right:0}
.scene::before{content:'';position:absolute;inset:0;z-index:-1;background:var(--ink);transform:scaleY(0);transform-origin:bottom;transition:transform .6s var(--out)}
.scene:hover{color:var(--paper)}
.scene:hover::before{transform:scaleY(1)}
.scene h2{margin:0;font:500 clamp(32px,3.1vw,46px)/1.05 var(--serif);letter-spacing:-.04em}
.scene svg{flex:none;margin-bottom:6px;transition:transform .5s var(--out)}
.scene:hover svg{transform:translateX(8px)}
.quotes{position:absolute;left:52px;top:14px;display:flex;gap:2px;color:var(--red);font:500 92px/1 var(--serif);pointer-events:none}
.quotes i{font-style:normal;transition:transform .7s var(--out)}
.scene:hover .quotes i:first-child{transform:translateX(-6px)}
.scene:hover .quotes i:last-child{transform:translateX(56px)}

.recent{padding:22px 56px 22px 44px;display:flex;flex-direction:column;justify-content:flex-end}
.recent-head{align-self:flex-start;margin-bottom:auto;padding-bottom:14px;display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;letter-spacing:.08em;transition:color .25s}
.recent-head svg{transition:transform .4s var(--out)}
.recent-head:hover{color:var(--ink)}
.recent-head:hover svg{transform:translateX(4px)}
.row{position:relative;min-height:50px;display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:8px;border-top:1px solid var(--line)}
.row::before{content:'';position:absolute;left:0;right:0;top:-1px;height:1px;background:var(--ink);transform:scaleX(0);transform-origin:left;transition:transform .6s var(--out)}
.row:hover::before{transform:scaleX(1)}
.row i{color:var(--muted);font-size:11px;font-style:normal;font-variant-numeric:tabular-nums;letter-spacing:.06em;transition:color .25s}
.row b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:560;transition:transform .5s var(--out)}
.row time{color:var(--muted);font-size:12px;white-space:nowrap}
.row:hover i{color:var(--red)}
.row:hover b{transform:translateX(8px)}


@media (max-width:1000px){
  .hero{padding:0 36px 40px}
  .scene{padding-left:36px}
  .quotes{left:32px}
  .recent{padding-right:36px}
}
@media (max-width:760px){
  .hero{min-height:56vh;padding:0 20px 30px}
  .hero{--fs:min(calc(84vw / var(--u)),calc(36vh / var(--rows)),200px)}
  .hero:not(.staggered) h1{max-width:min(calc(var(--u) * 1.08em),calc(100% - 92px))}
  .hero.staggered .seal{bottom:calc(30px + var(--fs) * 1.16)}
  .enso{right:-8vw;top:38%;width:62vw}
  .seal{right:20px;bottom:30px;width:76px;height:76px;font-size:42px}
  .imprint,.imprint .face{width:76px;height:76px}
  .imprint{margin:-38px 0 0 -38px}
  .imprint .face{font-size:42px}
  .lower{grid-template-columns:minmax(0,1fr)}
  .scene{min-height:150px;padding:26px 20px 24px;border-right:0;border-bottom:1px solid var(--line)}
  .quotes{left:16px;top:6px;font-size:72px}
  .recent{padding:18px 20px 20px}
  .error{bottom:calc(var(--tabs) + 14px);width:max-content;max-width:calc(100vw - 32px)}
}
@media (prefers-reduced-motion:reduce){
  .glyph i,.reveal,.lower{transition:none}
  .glyph{transform:none}
  .enso{transition:none}
}
</style>
