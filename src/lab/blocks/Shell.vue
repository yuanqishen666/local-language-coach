<script setup lang="ts">
import './blocks.css'
import Icon from '../kit/Icon.vue'
import LabSwitch from '../kit/Switch.vue'
import Face from './Face.vue'
import { shellNav, useShell } from '../useShell'

const { store, t, focus, plain, reviewDue, languageCode, language, level, navActive } = useShell()
</script>

<template>
  <div class="bk" :class="{ focus, plain }">
    <aside v-if="!focus && !plain" class="rail">
      <RouterLink to="/" class="tile brand" :aria-label="t('product.name')"><Face /></RouterLink>
      <RouterLink v-for="(item, index) in shellNav" :key="item.to" :to="item.to" class="tile" :class="[`tone-${index}`, { on: navActive(item.to) }]" :aria-label="t(item.label)">
        <Icon :name="item.icon" :size="22" :weight="2" />
        <span class="tip">{{ t(item.label) }}</span>
        <em v-if="item.to === '/review' && reviewDue" class="bk-num">{{ reviewDue }}</em>
      </RouterLink>
      <RouterLink to="/settings" class="tile lang" :aria-label="`${language} ${level}`">
        <b>{{ languageCode.toUpperCase() }}</b><small>{{ level }}</small>
        <span class="tip">{{ language }}</span>
      </RouterLink>
    </aside>

    <main>
      <RouterView v-slot="{ Component }">
        <Transition name="bk-page" mode="out-in"><component :is="Component" /></Transition>
      </RouterView>
    </main>

    <Transition name="note"><div v-if="store.toast" class="note" role="status">{{ store.toast }}</div></Transition>
    <LabSwitch />
  </div>
</template>

<style scoped>
.bk{background:var(--bg)}
main{padding-left:var(--rail)}

.rail{position:fixed;left:0;top:0;bottom:0;z-index:60;width:var(--rail);padding:var(--pad) 0 var(--pad) var(--pad);display:flex;flex-direction:column;align-items:center;gap:10px}
.tile{position:relative;flex:none;width:62px;height:62px;display:grid;place-items:center;border-radius:22px;background:var(--paper);animation:tile-in .6s var(--spring) both;transition:transform .55s var(--spring),border-radius .4s var(--out),background .25s,color .25s}
.tile:nth-child(2){animation-delay:.04s}.tile:nth-child(3){animation-delay:.08s}.tile:nth-child(4){animation-delay:.12s}.tile:nth-child(5){animation-delay:.16s}.tile:nth-child(6){animation-delay:.2s}.tile:nth-child(7){animation-delay:.24s}.tile:nth-child(8){animation-delay:.28s}
@keyframes tile-in{from{opacity:0;transform:scale(.5) rotate(-20deg)}}
.tile:hover{transform:scale(1.12);border-radius:50%;z-index:5}
.tile:active{transform:scale(.9);transition-duration:.12s}
.tile svg,.tile b,.tile small{transition:transform .55s var(--spring)}
.tile:hover svg{transform:rotate(-16deg) scale(1.1)}
.tile:nth-child(even):hover svg{transform:rotate(16deg) scale(1.1)}
.tile.brand{margin-bottom:8px;border-radius:50%;background:var(--ink);font-size:15px}
.tone-0{background:var(--mint)}
.tone-1{background:var(--sun)}
.tone-2{background:var(--lilac)}
.tone-3{background:var(--peach)}
.tone-4{background:var(--paper)}
.tone-5{background:var(--paper)}
.tile.on{border-radius:50%;background:var(--ink);color:var(--paper)}
.tile.lang{margin-top:auto;height:74px;align-content:center;gap:3px;background:var(--cobalt);color:#fff}
.tile.lang b{font-size:16px;font-weight:800;line-height:1;letter-spacing:.02em}
.tile.lang small{font-size:11px;font-weight:700;line-height:1;opacity:.82}
.tile em{position:absolute;right:-4px;top:-4px;min-width:22px;height:22px;padding:0 6px;display:grid;place-items:center;border-radius:999px;background:var(--tomato);color:var(--ink);font-size:11px;font-style:normal;font-weight:800;box-shadow:0 0 0 3px var(--bg)}
.tip{position:absolute;left:calc(100% + 12px);top:50%;z-index:6;height:34px;padding:0 14px;display:grid;place-items:center;border-radius:999px;background:var(--ink);color:var(--paper);font-size:12px;font-weight:700;white-space:nowrap;opacity:0;transform:translate(-10px,-50%) scale(.8);transform-origin:left center;transition:transform .45s var(--spring),opacity .2s;pointer-events:none}
.tile:hover .tip,.tile:focus-visible .tip{opacity:1;transform:translate(0,-50%)}

.note{position:fixed;left:50%;bottom:26px;z-index:140;max-width:calc(100vw - 32px);padding:13px 22px;border-radius:999px;background:var(--ink);color:var(--paper);font-size:13.5px;font-weight:700;transform:translateX(-50%)}
.note-enter-active{transition:transform .6s var(--spring),opacity .2s}
.note-leave-active{transition:transform .25s ease-in,opacity .25s}
.note-enter-from,.note-leave-to{opacity:0;transform:translate(-50%,30px) scale(.8)}

@media (max-width:820px){
  main{padding-left:0}
  .rail{left:10px;right:10px;top:auto;bottom:calc(10px + env(safe-area-inset-bottom));width:auto;padding:7px;flex-direction:row;justify-content:space-between;gap:5px;border-radius:26px;background:rgba(236,233,224,.9);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 10px 30px rgba(21,21,21,.16)}
  .tile{flex:1;width:auto;max-width:56px;height:48px;border-radius:17px}
  .tile.brand,.tile.lang,.tip{display:none}
  .note{bottom:calc(84px + env(safe-area-inset-bottom))}
}
@media (prefers-reduced-motion:reduce){.tile{animation:none}}
</style>
