<script setup lang="ts">
import './paper.css'
import Icon from '../kit/Icon.vue'
import LabSwitch from '../kit/Switch.vue'
import { shellNav, useShell } from '../useShell'

const { store, t, focus, plain, reviewDue, language, level, navActive } = useShell()
</script>

<template>
  <div class="pp" :class="{ focus, plain }">
    <header v-if="!focus && !plain" class="mast">
      <RouterLink to="/" class="home"><i class="pp-seal">见</i><b>{{ t('product.name') }}</b></RouterLink>
      <nav class="links">
        <RouterLink v-for="item in shellNav.slice(1)" :key="item.to" :to="item.to" :class="{ on: navActive(item.to) }">
          <span>{{ t(item.label) }}</span><sup v-if="item.to === '/review' && reviewDue">{{ reviewDue }}</sup>
        </RouterLink>
      </nav>
      <RouterLink to="/settings" class="lang"><span>{{ language }}</span><i></i><span>{{ level }}</span></RouterLink>
    </header>

    <main>
      <RouterView v-slot="{ Component }">
        <Transition name="pp-page" mode="out-in"><component :is="Component" /></Transition>
      </RouterView>
    </main>

    <nav v-if="!focus && !plain" class="tabs">
      <RouterLink v-for="item in shellNav" :key="item.to" :to="item.to" :class="{ on: navActive(item.to) }" :aria-label="t(item.label)">
        <Icon :name="item.icon" :size="20" /><em v-if="item.to === '/review' && reviewDue">{{ reviewDue }}</em>
      </RouterLink>
    </nav>

    <Transition name="note"><div v-if="store.toast" class="note" role="status"><span>{{ store.toast }}</span><button v-if="store.toastAction" type="button" class="toast-action" @click="store.runToastAction">{{ store.toastAction }}</button></div></Transition>
    <LabSwitch />
  </div>
</template>

<style scoped>
.mast{position:sticky;top:0;z-index:30;height:var(--mast);padding:0 40px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:36px;border-bottom:1px solid var(--line);background:rgba(243,239,230,.86);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.home{display:flex;align-items:center;gap:12px}
.home .pp-seal{font-size:16px;transition:transform .5s var(--out)}
.home:hover .pp-seal{transform:rotate(-8deg) scale(1.06)}
.home b{font:500 17px/1 var(--serif);letter-spacing:.22em}
.links{justify-self:end;display:flex;gap:34px}
.links a{position:relative;padding:6px 0;color:var(--soft);font-size:13px;letter-spacing:.04em;transition:color .25s}
.links a::after{content:'';position:absolute;left:0;right:0;bottom:0;height:1px;background:currentColor;transform:scaleX(0);transform-origin:right;transition:transform .45s var(--out)}
.links a:hover,.links a.on{color:var(--ink)}
.links a:hover::after{transform:scaleX(1);transform-origin:left}
.links a.on::after{height:2px;background:var(--red);transform:scaleX(1)}
.links sup{position:absolute;left:100%;top:-2px;margin-left:3px;color:var(--red);font-size:10px;font-weight:700;font-variant-numeric:tabular-nums}
.lang{height:32px;padding:0 14px;display:flex;align-items:center;gap:10px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line);font-size:12px;letter-spacing:.04em;transition:background .3s,color .3s,box-shadow .3s}
.lang i{width:1px;height:10px;background:currentColor;opacity:.3}
.lang:hover{background:var(--ink);color:var(--paper);box-shadow:inset 0 0 0 1px var(--ink)}

.tabs{display:none}

.note{position:fixed;left:50%;bottom:calc(var(--tabs) + 28px);z-index:150;max-width:calc(100vw - 32px);padding:11px 18px 11px 16px;border-left:3px solid var(--red);background:var(--ink);color:var(--paper);font-size:13px;letter-spacing:.02em;transform:translateX(-50%);box-shadow:0 14px 40px rgba(25,22,18,.25)}
.note-enter-active{transition:opacity .3s,transform .5s var(--out)}
.note-leave-active{transition:opacity .25s}
.note-enter-from{opacity:0;transform:translate(-50%,14px)}
.note-leave-to{opacity:0}

@media (max-width:1000px){
  .mast{padding:0 28px;gap:22px}
  .links{gap:22px}
}
@media (max-width:760px){
  .mast{padding:0 18px}
  .links{display:none}
  .lang{grid-column:3}
  .tabs{position:fixed;left:0;right:0;bottom:0;z-index:30;height:var(--tabs);padding:0 6px env(safe-area-inset-bottom);display:grid;grid-template-columns:repeat(6,1fr);align-items:center;border-top:1px solid var(--line);background:rgba(243,239,230,.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
  .tabs a{position:relative;height:48px;display:grid;place-items:center;color:rgba(25,22,18,.55);transition:color .25s}
  .tabs a.on{color:var(--ink)}
  .tabs a.on::after{content:'';position:absolute;left:50%;bottom:4px;width:4px;height:4px;margin-left:-2px;border-radius:1px;background:var(--red)}
  .tabs em{position:absolute;left:calc(50% + 8px);top:6px;color:var(--red);font-size:10px;font-style:normal;font-weight:700}
}
</style>
