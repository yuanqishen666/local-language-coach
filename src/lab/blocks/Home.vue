<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '../kit/Icon.vue'
import { prefersReducedMotion, vDrag } from '../kit/interactions'
import { formatWhen } from '../kit/when'
import Face from './Face.vue'
import { useHomePage } from '../logic/HomePage'

const { t, locale } = useI18n()
const { store, router, history, creating, startError, startConversation, displayTitle } = useHomePage()
const modelReady = computed(() => Boolean(store.settings?.modelReady))

// Presentation only: the face starts talking when you come close and grins while the chat opens.
const near = ref(false)
const launching = ref(false)

async function launch() {
  if (creating.value || launching.value) return
  if (!modelReady.value) {
    await startConversation()
    return
  }
  launching.value = true
  if (!prefersReducedMotion()) await new Promise((resolve) => { window.setTimeout(resolve, 560) })
  await startConversation()
  if (startError.value) launching.value = false
}
</script>

<template>
  <div class="hm" :class="{ solo: !history.length }">
    <section class="blk hero" :class="{ launching }" @pointerenter="near = true" @pointerleave="near = false">
      <button type="button" class="hit" :disabled="creating && !launching" @click="launch">
        <span class="mug"><Face :mood="launching ? 'happy' : near ? 'talk' : 'calm'" /></span>
        <h1>{{ t('home.openTitle') }}</h1>
        <span class="go"><Icon name="arrow" :size="32" :weight="2.2" /></span>
      </button>
      <i v-drag class="shape quarter" aria-hidden="true"></i>
      <i v-drag class="shape hoop" aria-hidden="true"></i>
      <i v-drag class="shape pill" aria-hidden="true"></i>
      <i v-drag class="shape arch" aria-hidden="true"></i>
    </section>

    <section class="blk scene">
      <RouterLink to="/start" class="hit">
        <h2>{{ t('home.settingTitle') }}</h2>
        <span class="go"><Icon name="arrow" :size="22" :weight="2.2" /></span>
      </RouterLink>
      <div class="minis" aria-hidden="true" @click="router.push('/start')">
        <i v-drag class="mini person"><i></i><i></i></i>
        <i v-drag class="mini place"><i></i><i></i></i>
        <i v-drag class="mini topic"><i></i><i></i><i></i></i>
      </div>
    </section>

    <section v-if="history.length" class="blk recent">
      <RouterLink to="/history" class="recent-head"><h2>{{ t('home.recentOpen') }}</h2><Icon name="arrow" :size="16" :weight="2.2" /></RouterLink>
      <div class="rows">
        <RouterLink v-for="item in history.slice(0, 3)" :key="item.id" :to="`/conversation/${item.id}`" class="row">
          <i :class="`kind-${item.kind}`"></i>
          <b>{{ displayTitle(item) }}</b>
          <time>{{ formatWhen(item.updatedAt, String(locale)) }}</time>
        </RouterLink>
      </div>
    </section>

    <p v-if="startError" class="oops" role="alert">{{ startError }}</p>
  </div>
</template>

<style scoped>
.hm{height:100dvh;min-height:620px;padding:var(--pad) var(--pad) var(--pad) 12px;display:grid;grid-template-columns:minmax(0,2.15fr) minmax(300px,1fr);grid-template-rows:minmax(0,1fr) auto;gap:12px}
.blk{position:relative;min-width:0;min-height:0;overflow:hidden;border-radius:38px;animation:bk-drop .9s var(--spring) both;transition:transform .5s var(--spring)}
.scene{animation-delay:.1s}
.recent{animation-delay:.2s}
.blk:has(.hit:active){transform:scale(.985);transition-duration:.16s}
.hit{position:absolute;inset:0;width:100%;height:100%;padding:0;display:block;border:0;border-radius:inherit;background:none;color:inherit;text-align:left}
.hit:focus-visible{outline:4px solid var(--ink);outline-offset:-8px}
.go{position:absolute;display:grid;place-items:center;border-radius:50%;transition:transform .6s var(--spring),background .3s}

.hero{grid-row:1 / 3;background:var(--cobalt);color:#fff}
.hero h1{position:absolute;left:44px;right:150px;bottom:40px;font-size:clamp(50px,6.2vw,104px);font-weight:800;line-height:.98;letter-spacing:-.045em;text-wrap:balance}
.hero .go{right:40px;bottom:40px;width:84px;height:84px;background:var(--sun);color:var(--ink)}
.hero:hover .go{transform:rotate(-45deg) scale(1.1)}
.mug{position:absolute;left:50%;top:44%;font-size:clamp(96px,min(20vh,15vw),200px);transform:translate(-50%,-58%);transition:transform .8s var(--spring)}
.hero:hover .mug{transform:translate(-50%,-62%)}
.launching .mug{transform:translate(-50%,-66%) scale(1.06)}
.launching .go,.launching:hover .go{transform:translateX(220px) rotate(0deg);transition:transform .5s cubic-bezier(.6,-.3,.7,.4)}

.shape{position:absolute;z-index:2;touch-action:none;cursor:grab;transform:translate3d(var(--dx,0px),var(--dy,0px),0) rotate(calc(var(--r,0deg) + var(--dr,0deg)));transition:transform .8s var(--spring),scale .4s var(--spring);-webkit-user-select:none;user-select:none}
.shape:hover{scale:1.1}
.shape.dragging{z-index:6;cursor:grabbing;scale:1.16;transition:scale .3s var(--spring)}
.quarter{--r:0deg;left:0;top:0;width:clamp(96px,11vw,170px);aspect-ratio:1;border-radius:0 0 100% 0;background:var(--sun);transform-origin:top left}
.hoop{--r:0deg;right:7%;top:15%;width:clamp(70px,7vw,112px);aspect-ratio:1;border-radius:50%;border:clamp(16px,1.7vw,26px) solid var(--mint)}
.pill{--r:-24deg;right:9%;top:52%;width:clamp(92px,9.5vw,150px);height:clamp(34px,3.4vw,52px);border-radius:999px;background:var(--lilac)}
.arch{--r:14deg;left:8%;top:54%;width:clamp(60px,6vw,96px);aspect-ratio:2 / 1;border-radius:999px 999px 0 0;background:var(--peach)}

.scene{grid-column:2;grid-row:1;container-type:size;background:var(--tomato)}
.solo .scene{grid-row:1 / 3}
.scene h2{position:absolute;left:30px;right:96px;bottom:28px;font-size:clamp(28px,2.6vw,40px);font-weight:800;line-height:1.02;letter-spacing:-.04em}
.scene .go{right:26px;bottom:24px;width:58px;height:58px;background:var(--ink);color:var(--paper)}
.scene:hover .go{transform:rotate(-45deg) scale(1.1)}
.minis{position:absolute;left:30px;top:30px;display:flex;pointer-events:none}
.mini{--w:clamp(74px,min(7.6vw,27cqh),132px);position:relative;flex:none;width:var(--w);height:calc(var(--w) * 1.26);display:block;overflow:hidden;border-radius:calc(var(--w) * .2);box-shadow:0 14px 26px rgba(120,28,6,.2);pointer-events:auto;touch-action:none;cursor:grab;transform:translate3d(calc(var(--fx,0px) + var(--dx,0px)),var(--dy,0px),0) rotate(calc(var(--r,0deg) + var(--dr,0deg)));transition:transform .7s var(--spring),scale .4s var(--spring)}
.mini + .mini{margin-left:calc(var(--w) * -.34)}
.mini.dragging{z-index:6;cursor:grabbing;scale:1.1;transition:scale .3s var(--spring)}
.mini:hover{z-index:4;scale:1.08}
.person{--r:-11deg;background:var(--sun)}
.place{--r:3deg;margin-top:10px;background:var(--paper)}
.topic{--r:13deg;background:var(--cobalt)}
.scene:hover .person{--r:-17deg;--fx:-6px}
.scene:hover .place{--r:1deg;--fx:16px}
.scene:hover .topic{--r:19deg;--fx:38px}
.person i:first-child{position:absolute;left:50%;top:20%;width:38%;aspect-ratio:1;border-radius:50%;background:var(--ink);transform:translateX(-50%)}
.person i:last-child{position:absolute;left:50%;bottom:-2%;width:74%;height:36%;border-radius:999px 999px 0 0;background:var(--ink);transform:translateX(-50%)}
.place i:first-child{position:absolute;left:50%;bottom:0;width:52%;height:58%;border-radius:999px 999px 0 0;background:var(--cobalt);transform:translateX(-50%)}
.place i:last-child{position:absolute;right:14%;top:12%;width:22%;aspect-ratio:1;border-radius:50%;background:var(--tomato)}
.topic i{position:absolute;left:18%;height:9%;border-radius:999px;background:#fff}
.topic i:nth-child(1){top:26%;width:64%}
.topic i:nth-child(2){top:45%;width:46%}
.topic i:nth-child(3){top:64%;width:28%;background:var(--sun)}

.recent{grid-column:2;grid-row:2;padding:26px 14px 14px;gap:14px;display:flex;flex-direction:column;background:var(--ink);color:var(--paper)}
.recent-head{align-self:flex-start;margin:0 16px;display:inline-flex;align-items:center;gap:6px}
.recent-head h2{font-size:15px;font-weight:800;letter-spacing:-.01em}
.recent-head svg{transition:transform .5s var(--spring)}
.recent-head:hover svg{transform:translateX(6px)}
.rows{display:grid;gap:2px}
.row{min-height:52px;padding:0 16px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;border-radius:18px;transition:background .25s}
.row:hover{background:rgba(251,250,245,.1)}
.row i{width:10px;height:10px;border-radius:999px;background:var(--sun);transition:width .45s var(--spring)}
.row i.kind-scene{background:var(--tomato)}
.row:hover i{width:26px}
.row b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:700}
.row time{color:rgba(251,250,245,.56);font-size:12px;font-weight:600;white-space:nowrap}

.oops{position:fixed;left:50%;bottom:26px;z-index:40;width:max-content;max-width:calc(100vw - 32px);padding:11px 18px;border-radius:999px;background:var(--ink);color:var(--peach);font-size:12px;font-weight:700;transform:translateX(-50%)}

@media (max-width:1040px){
  .hm{grid-template-columns:minmax(0,1.6fr) minmax(270px,1fr)}
  .hero h1{left:32px;right:128px;bottom:32px}
  .hero .go{right:30px;bottom:30px;width:72px;height:72px}
}
@media (max-width:820px){
  .hm{height:auto;min-height:100dvh;padding:12px 12px 96px;display:flex;flex-direction:column}
  .blk{border-radius:30px}
  .hero{flex:none;height:64vh;min-height:430px}
  .hero h1{left:26px;right:108px;bottom:28px;font-size:clamp(44px,13vw,72px)}
  .hero .go{right:24px;bottom:24px;width:66px;height:66px}
  .mug{font-size:clamp(88px,27vw,128px)}
  .hoop{right:5%;top:5%}
  .pill,.arch{top:58%}
  .scene{flex:none;height:270px}
  .recent{flex:none;padding-top:22px}
  .oops{bottom:104px}
}
@media (prefers-reduced-motion:reduce){.blk{animation:none}}
</style>
