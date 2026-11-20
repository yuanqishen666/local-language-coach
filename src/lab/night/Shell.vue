<script setup lang="ts">
import './night.css'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from '../kit/Icon.vue'
import LabSwitch from '../kit/Switch.vue'
import { shellNav, useShell } from '../useShell'

const { store, t, locale, focus, plain, reviewDue, languageCode, level, navActive } = useShell()

// Presentation only: local time on the status strip.
const clock = ref('')
let timer = 0
function tick() {
  clock.value = new Intl.DateTimeFormat(String(locale.value), { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}
onMounted(() => { tick(); timer = window.setInterval(tick, 15000) })
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <div class="nf" :class="{ focus, plain }">
    <header v-if="!focus && !plain" class="bar">
      <RouterLink to="/" class="brand"><i aria-hidden="true"></i><b>{{ t('product.name') }}</b></RouterLink>
      <RouterLink to="/settings" class="strip nf-mono">
        <span>{{ languageCode.toUpperCase() }}</span><i></i><span>{{ level }}</span><i></i><time>{{ clock }}</time>
      </RouterLink>
    </header>

    <main>
      <RouterView v-slot="{ Component }">
        <Transition name="nf-page" mode="out-in"><component :is="Component" /></Transition>
      </RouterView>
    </main>

    <nav v-if="!focus && !plain" class="dock">
      <RouterLink v-for="item in shellNav" :key="item.to" :to="item.to" :class="{ on: navActive(item.to) }" :aria-label="t(item.label)">
        <Icon :name="item.icon" :size="19" />
        <span>{{ t(item.label) }}</span>
        <em v-if="item.to === '/review' && reviewDue" class="nf-mono">{{ reviewDue }}</em>
      </RouterLink>
    </nav>

    <Transition name="pa"><div v-if="store.toast" class="pa" role="status"><i class="nf-lamp on"></i>{{ store.toast }}</div></Transition>
    <LabSwitch />
  </div>
</template>

<style scoped>
.bar{position:sticky;top:0;z-index:40;height:var(--bar);display:flex;align-items:center;justify-content:space-between;padding:0 var(--gutter);background:linear-gradient(180deg,rgba(7,11,20,.9),rgba(7,11,20,0))}
.brand{display:inline-flex;align-items:center;gap:12px;font-size:15px;font-weight:600;letter-spacing:.04em}
/* the mark is a cabin window with the last light in it */
.brand i{width:20px;height:27px;border-radius:9px;background:linear-gradient(180deg,#0d1a36 0 46%,#ffb648 47% 54%,#3a1d1a 55%);box-shadow:0 0 0 2px #232c40,0 0 18px rgba(255,182,72,.35);transition:transform .5s var(--spring)}
.brand:hover i{transform:rotate(-8deg) scale(1.08)}
.strip{display:inline-flex;align-items:center;gap:10px;height:32px;padding:0 14px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line);color:var(--soft);font-size:11.5px;letter-spacing:.1em;transition:box-shadow .3s,color .3s}
.strip:hover{box-shadow:inset 0 0 0 1px var(--amber);color:var(--amber)}
.strip i{width:3px;height:3px;border-radius:50%;background:currentColor;opacity:.5}

.dock{position:fixed;z-index:50;left:50%;bottom:22px;transform:translateX(-50%);display:flex;gap:4px;padding:6px;border-radius:999px;background:rgba(17,27,45,.72);backdrop-filter:blur(22px) saturate(1.4);-webkit-backdrop-filter:blur(22px) saturate(1.4);box-shadow:inset 0 0 0 1px var(--line),0 24px 60px rgba(0,0,0,.5)}
.dock a{position:relative;height:46px;min-width:46px;padding:0 13px;display:inline-flex;align-items:center;justify-content:center;gap:0;border-radius:999px;color:var(--muted);transition:color .25s,background .3s,padding .5s var(--out),transform .4s var(--spring)}
.dock a span{max-width:0;overflow:hidden;font-size:13px;font-weight:600;white-space:nowrap;opacity:0;transition:max-width .55s var(--out),opacity .3s,margin .55s var(--out)}
.dock a:hover{color:var(--text);transform:translateY(-3px)}
.dock a:active{transform:scale(.94)}
.dock a.on{background:var(--amber);color:#1b1204;padding:0 18px}
.dock a.on:hover{transform:none}
.dock a.on span{max-width:160px;margin-left:9px;opacity:1}
.dock em{position:absolute;right:4px;top:3px;min-width:16px;height:16px;padding:0 4px;display:grid;place-items:center;border-radius:99px;background:var(--red);color:#230500;font-size:10px;font-style:normal;font-weight:700}
.dock a.on em{position:static;margin-left:8px;background:#1b1204;color:var(--amber)}

.pa{position:fixed;z-index:130;left:50%;bottom:calc(var(--dock) + 14px);transform:translateX(-50%);display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);padding:12px 20px;border-radius:999px;background:var(--raise);box-shadow:inset 0 0 0 1px var(--line),0 20px 50px rgba(0,0,0,.5);font-size:13.5px}
.nf.focus .pa,.nf.plain .pa{bottom:110px}
.pa-enter-active{transition:opacity .3s,transform .5s var(--spring)}
.pa-leave-active{transition:opacity .25s,transform .25s}
.pa-enter-from,.pa-leave-to{opacity:0;transform:translate(-50%,14px) scale(.96)}

@media (max-width:760px){
  .dock{left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));transform:none;justify-content:space-between}
  .dock a{min-width:0;flex:1;padding:0}
  .dock a.on{flex:0 0 auto;padding:0 14px}
  .dock a.on span{max-width:96px;font-size:12px;margin-left:7px}
  .strip time,.strip i:last-of-type{display:none}
}
</style>
