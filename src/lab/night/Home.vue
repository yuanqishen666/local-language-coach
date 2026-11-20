<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '../kit/Icon.vue'
import { clamp, prefersReducedMotion } from '../kit/interactions'
import { formatWhen } from '../kit/when'
import Flap from './Flap.vue'
import { useHomePage } from '../logic/HomePage'

const { t, locale } = useI18n()
const { store, history, creating, startError, startConversation, displayTitle } = useHomePage()
const modelReady = computed(() => Boolean(store.settings?.modelReady))

// Presentation only: the view through the window follows the pointer, the shade can be pulled,
// and starting a chat lets the window open up over the whole screen.
const stage = ref<HTMLElement | null>(null)
const glass = ref<HTMLElement | null>(null)
const shade = ref(0)
const boarding = ref(false)
const open = ref(false)
const hole = ref<{ left: string; top: string; width: string; height: string } | null>(null)
let drag: { y: number; from: number } | null = null
let frame = 0

function look(event: PointerEvent) {
  if (event.pointerType === 'touch' || !stage.value) return
  const rect = stage.value.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3)
  const y = ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3)
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    stage.value?.style.setProperty('--mx', x)
    stage.value?.style.setProperty('--my', y)
  })
}

function grip(event: PointerEvent) {
  drag = { y: event.clientY, from: shade.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function pull(event: PointerEvent) {
  if (!drag || !glass.value) return
  shade.value = clamp(drag.from + (event.clientY - drag.y) / (glass.value.clientHeight - 34), 0, 1)
}
function release() {
  drag = null
}

async function board() {
  if (creating.value || boarding.value) return
  if (!modelReady.value) {
    await startConversation()
    return
  }
  const rect = glass.value?.getBoundingClientRect()
  if (rect && !prefersReducedMotion()) {
    hole.value = { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }
    boarding.value = true
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => { open.value = true }))
    await new Promise((resolve) => { window.setTimeout(resolve, 620) })
  }
  await startConversation()
  if (startError.value) {
    boarding.value = false
    open.value = false
    hole.value = null
  }
}

onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div class="nf-page home">
    <section ref="stage" class="stage" @pointermove="look">
      <button type="button" class="call" :disabled="creating && !boarding" @click="board">
        <h1><Flap :text="t('home.openTitle')" :delay="160" /></h1>
        <span class="go"><b>{{ t('home.openAction') }}</b><i><Icon name="arrow" :size="18" :weight="2" /></i></span>
      </button>

      <div class="window" :class="{ shut: shade > 0.96 }">
        <button type="button" class="pane" :aria-label="t('home.openAction')" :disabled="creating && !boarding" @click="board">
          <span ref="glass" class="glass">
            <span class="stars far"></span>
            <span class="stars near"></span>
            <span class="moon"></span>
            <span class="dusk"></span>
            <span class="clouds"></span>
            <span class="city"></span>
            <svg class="wing" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <path d="M320 262 132 236 104 226 118 246 320 352Z" fill="#0a101d" />
              <path d="M132 236 104 226 97 198 110 228Z" fill="#111a2c" />
              <path d="M320 262 132 236" stroke="rgba(255,255,255,.14)" stroke-width="1" />
              <circle class="beacon" cx="106" cy="226" r="3" />
              <circle class="strobe" cx="100" cy="200" r="2.2" />
            </svg>
            <span class="glare"></span>
          </span>
        </button>
        <span class="shade" :style="{ '--pull': shade }">
          <i class="grip" @pointerdown.prevent="grip" @pointermove="pull" @pointerup="release" @pointercancel="release"></i>
        </span>
      </div>
    </section>

    <p v-if="startError" class="nf-error" role="alert">{{ startError }}</p>

    <section class="lower" :class="{ solo: !history.length }">
      <RouterLink to="/start" class="pass">
        <div class="pass-main">
          <h2>{{ t('home.settingTitle') }}</h2>
          <dl>
            <div><dt>{{ t('home.customPerson') }}</dt><dd></dd></div>
            <div><dt>{{ t('home.customContext') }}</dt><dd></dd></div>
            <div><dt>{{ t('home.customTopic') }}</dt><dd></dd></div>
          </dl>
        </div>
        <div class="pass-stub" aria-hidden="true"><i class="bars"></i><Icon name="arrow" :size="20" /></div>
      </RouterLink>

      <div v-if="history.length" class="board nf-glass">
        <header><span class="nf-label">{{ t('home.recentOpen') }}</span><RouterLink to="/history" class="nf-link">{{ t('home.viewAll') }}</RouterLink></header>
        <RouterLink v-for="item in history.slice(0, 3)" :key="item.id" :to="`/conversation/${item.id}`" class="flight">
          <time class="nf-mono">{{ formatWhen(item.updatedAt, String(locale)) }}</time>
          <b>{{ displayTitle(item) }}</b>
          <Icon name="arrow" :size="15" />
        </RouterLink>
      </div>
    </section>

    <div v-if="hole" class="takeoff" :class="{ open }" :style="hole" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.home{padding-top:20px}
.stage{--mx:0;--my:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:40px;min-height:min(54vh,470px)}

.call{display:grid;justify-items:start;gap:34px;padding:0;border:0;background:none;text-align:left}
.call h1{font-size:clamp(60px,9.4vw,148px);font-weight:200;line-height:.98;letter-spacing:-.055em;text-wrap:balance}
.go{display:inline-flex;align-items:center;gap:16px;font-size:17px;font-weight:600}
.go i{width:52px;height:52px;display:grid;place-items:center;border-radius:50%;background:var(--amber);color:#1b1204;transition:transform .5s var(--spring),box-shadow .3s}
.call:hover .go i{transform:translateX(8px) scale(1.06);box-shadow:0 0 0 8px var(--amber-soft),0 14px 40px -6px rgba(255,182,72,.7)}
.call:active .go i{transform:scale(.94)}
.call:disabled{opacity:.5}

/* the cabin window */
.window{position:relative;width:300px;height:400px;padding:18px;border-radius:118px;background:linear-gradient(150deg,#27314a,#131a2a 60%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.09),inset 0 2px 0 rgba(255,255,255,.1),0 40px 90px -20px rgba(0,0,0,.8),0 0 120px -30px rgba(255,160,72,.35);transform:rotate(calc(var(--mx) * 2deg));transition:transform .6s var(--out)}
.pane{position:absolute;inset:18px;padding:0;border:0;border-radius:100px;background:none;overflow:hidden;box-shadow:0 0 0 3px #080c15,0 0 0 4px rgba(255,255,255,.08)}
.glass{position:absolute;inset:0;display:block;overflow:hidden;border-radius:inherit;background:linear-gradient(180deg,#040814 0%,#0a1630 38%,#1b2752 56%,#4a3558 66%,#c96a3c 72.5%,#ffb648 74%,#3a1d20 75.5%,#0b0f1a 84%,#05070d 100%)}
.glass>*{position:absolute;display:block;pointer-events:none}
.stars{inset:-20px;transition:transform .7s var(--out)}
.stars.far{background:radial-gradient(1px 1px at 18% 12%,#fff 50%,transparent 51%),radial-gradient(1px 1px at 62% 8%,rgba(255,255,255,.7) 50%,transparent 51%),radial-gradient(1px 1px at 81% 31%,rgba(255,255,255,.8) 50%,transparent 51%),radial-gradient(1px 1px at 36% 38%,rgba(255,255,255,.6) 50%,transparent 51%),radial-gradient(1px 1px at 9% 47%,rgba(255,255,255,.6) 50%,transparent 51%),radial-gradient(1px 1px at 52% 24%,rgba(255,255,255,.7) 50%,transparent 51%);transform:translate(calc(var(--mx) * -8px),calc(var(--my) * -8px));animation:wink 4s ease-in-out infinite alternate}
.stars.near{background:radial-gradient(1.6px 1.6px at 28% 22%,#fff 50%,transparent 51%),radial-gradient(1.6px 1.6px at 72% 17%,#fff 50%,transparent 51%),radial-gradient(1.4px 1.4px at 46% 44%,#fff 50%,transparent 51%),radial-gradient(1.4px 1.4px at 88% 49%,rgba(255,255,255,.8) 50%,transparent 51%);transform:translate(calc(var(--mx) * -18px),calc(var(--my) * -18px))}
@keyframes wink{to{opacity:.45}}
.moon{left:58%;top:13%;width:26px;height:26px;border-radius:50%;box-shadow:inset -7px -3px 0 0 #f4ead2;transform:translate(calc(var(--mx) * -12px),calc(var(--my) * -12px)) rotate(-24deg);transition:transform .7s var(--out);filter:drop-shadow(0 0 10px rgba(244,234,210,.5))}
.dusk{left:-10%;right:-10%;top:66%;height:14%;background:radial-gradient(60% 100% at 46% 60%,rgba(255,190,96,.75),transparent 70%);filter:blur(6px);transform:translateX(calc(var(--mx) * -22px));transition:transform .7s var(--out)}
.clouds{left:-40%;right:-40%;top:74%;height:14%;background:radial-gradient(34% 80% at 20% 50%,rgba(20,26,44,.95),transparent 70%),radial-gradient(40% 90% at 52% 60%,rgba(14,19,34,.95),transparent 70%),radial-gradient(30% 70% at 84% 40%,rgba(22,28,48,.9),transparent 70%);animation:drift 46s linear infinite}
.city{left:0;top:84%;width:300%;height:14%;background:radial-gradient(1.2px 1.2px at 4% 30%,#ffcf7a 50%,transparent 51%),radial-gradient(1.2px 1.2px at 9% 62%,#ffb648 50%,transparent 51%),radial-gradient(1px 1px at 13% 44%,#ffe2a8 50%,transparent 51%),radial-gradient(1.2px 1.2px at 21% 70%,#ffb648 50%,transparent 51%),radial-gradient(1px 1px at 24% 26%,#ffcf7a 50%,transparent 51%),radial-gradient(1.4px 1.4px at 29% 52%,#ffd995 50%,transparent 51%);background-size:33.333% 100%;opacity:.85;animation:glide 32s linear infinite}
@keyframes drift{to{transform:translateX(-22%)}}
@keyframes glide{to{transform:translateX(-33.333%)}}
.wing{inset:0;width:100%;height:100%;transform:translate(calc(var(--mx) * 6px),calc(var(--my) * 5px)) rotate(calc(var(--mx) * -1.2deg));transition:transform .7s var(--out)}
.beacon{fill:var(--red);animation:beacon 1.6s steps(1) infinite;filter:drop-shadow(0 0 6px var(--red))}
.strobe{fill:#fff;opacity:0;animation:strobe 2.4s linear infinite;filter:drop-shadow(0 0 8px #fff)}
@keyframes beacon{0%,100%{opacity:1}50%{opacity:.12}}
@keyframes strobe{0%,88%,94%,100%{opacity:0}90%,96%{opacity:1}}
.glare{inset:0;background:linear-gradient(118deg,rgba(255,255,255,.1) 0 18%,transparent 19% 62%,rgba(255,255,255,.04) 63% 70%,transparent 71%);transform:translateX(calc(var(--mx) * 26px));transition:transform .7s var(--out)}

/* the shade pulls down from the top */
.shade{position:absolute;inset:18px;border-radius:100px;overflow:hidden;pointer-events:none}
.shade::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(180deg,#323c54 0 12px,#2b3449 12px 13px);box-shadow:inset 0 -12px 20px rgba(0,0,0,.35);transform:translateY(calc((var(--pull) - 1) * (100% - 34px)))}
.grip{position:absolute;left:50%;top:0;width:76px;height:34px;margin-left:-38px;display:block;pointer-events:auto;cursor:grab;touch-action:none;transform:translateY(calc(var(--pull) * (400px - 36px - 34px)))}
.grip::after{content:'';position:absolute;left:50%;top:13px;width:44px;height:8px;margin-left:-22px;border-radius:99px;background:#4a556f;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 2px 6px rgba(0,0,0,.5);transition:background .3s,transform .4s var(--spring)}
.grip:hover::after{background:var(--amber);transform:scaleX(1.12)}
.grip:active{cursor:grabbing}

.lower{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:20px;margin-top:24px}
.lower.solo{grid-template-columns:minmax(0,640px)}

/* a boarding pass */
.pass{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 96px;min-height:176px;color:#1b1204;filter:drop-shadow(0 24px 40px rgba(0,0,0,.45));transition:transform .6s var(--spring)}
.pass-main{display:grid;align-content:space-between;gap:22px;padding:24px 26px;border-radius:22px 0 0 22px;background:var(--amber);-webkit-mask:radial-gradient(circle at 100% 0,transparent 10px,#000 10.5px) top right/51% 51% no-repeat,radial-gradient(circle at 100% 100%,transparent 10px,#000 10.5px) bottom right/51% 51% no-repeat,linear-gradient(#000,#000) left/50% 100% no-repeat;mask:radial-gradient(circle at 100% 0,transparent 10px,#000 10.5px) top right/51% 51% no-repeat,radial-gradient(circle at 100% 100%,transparent 10px,#000 10.5px) bottom right/51% 51% no-repeat,linear-gradient(#000,#000) left/50% 100% no-repeat}
.pass h2{font-size:clamp(26px,2.6vw,36px);font-weight:700;letter-spacing:-.035em;line-height:1.1}
.pass dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.pass dt{font:600 10px/1.3 var(--mono);letter-spacing:.1em;text-transform:uppercase;opacity:.62}
.pass dd{height:1px;margin-top:16px;background:repeating-linear-gradient(90deg,rgba(27,18,4,.5) 0 4px,transparent 4px 8px)}
.pass-stub{position:relative;display:grid;align-content:space-between;justify-items:end;padding:24px 22px;border-radius:0 22px 22px 0;background:var(--amber);border-left:2px dashed rgba(27,18,4,.38);-webkit-mask:radial-gradient(circle at 0 0,transparent 10px,#000 10.5px) top left/51% 51% no-repeat,radial-gradient(circle at 0 100%,transparent 10px,#000 10.5px) bottom left/51% 51% no-repeat,linear-gradient(#000,#000) right/50% 100% no-repeat;mask:radial-gradient(circle at 0 0,transparent 10px,#000 10.5px) top left/51% 51% no-repeat,radial-gradient(circle at 0 100%,transparent 10px,#000 10.5px) bottom left/51% 51% no-repeat,linear-gradient(#000,#000) right/50% 100% no-repeat;transform-origin:0 100%;transition:transform .6s var(--spring)}
.bars{width:46px;height:54px;background:repeating-linear-gradient(90deg,#1b1204 0 2px,transparent 2px 4px,#1b1204 4px 5px,transparent 5px 9px,#1b1204 9px 12px,transparent 12px 14px)}
.pass-stub svg{transition:transform .5s var(--out)}
.pass:hover{transform:translateY(-4px) rotate(-.6deg)}
.pass:hover .pass-stub{transform:rotate(5deg) translateX(3px)}
.pass:hover .pass-stub svg{transform:translateX(5px)}

/* recent conversations as a departures board */
.board{padding:10px 22px 12px}
.board header{display:flex;align-items:center;justify-content:space-between;height:44px}
.flight{display:grid;grid-template-columns:96px minmax(0,1fr) auto;align-items:center;gap:14px;height:46px;border-top:1px solid var(--line);color:var(--soft);transition:color .25s,padding .5s var(--out)}
.flight time{color:var(--amber);font-size:12px;letter-spacing:.04em}
.flight b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:500}
.flight svg{opacity:0;transform:translateX(-8px);transition:opacity .25s,transform .5s var(--out)}
.flight:hover{color:var(--text);padding-left:6px}
.flight:hover svg{opacity:1;transform:none;color:var(--amber)}

.nf-error{margin-top:14px}

/* boarding: the window opens up over everything */
.takeoff{position:fixed;z-index:150;border-radius:100px;background:linear-gradient(180deg,#040814 0%,#0a1630 38%,#1b2752 56%,#4a3558 66%,#c96a3c 72.5%,#ffb648 74%,#3a1d20 75.5%,#0b0f1a 84%,#05070d 100%);transition:left .6s var(--out),top .6s var(--out),width .6s var(--out),height .6s var(--out),border-radius .6s var(--out),filter .6s}
.takeoff.open{left:0!important;top:0!important;width:100vw!important;height:100vh!important;border-radius:0;filter:brightness(.55)}

@media (max-width:900px){
  .stage{grid-template-columns:1fr;justify-items:center;gap:26px;min-height:0}
  .window{order:-1;width:228px;height:304px;padding:14px;border-radius:92px}
  .pane,.shade{inset:14px;border-radius:78px}
  .grip{transform:translateY(calc(var(--pull) * (304px - 28px - 34px)))}
  .call{justify-items:center;text-align:center;gap:22px}
  .call h1{font-size:clamp(52px,15vw,88px)}
  .lower{grid-template-columns:1fr;margin-top:30px}
  .flight{grid-template-columns:74px minmax(0,1fr) auto}
}
@media (prefers-reduced-motion:reduce){.stars.far,.clouds,.city,.beacon,.strobe{animation:none}}
</style>
