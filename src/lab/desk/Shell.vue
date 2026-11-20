<script setup lang="ts">
import { provide } from 'vue'
import '../core/all.css'
import './theme.css'
import Icon from '../kit/Icon.vue'
import LabSwitch from '../kit/Switch.vue'
import Tabs from '../core/Tabs.vue'
import { shellFoot, shellMain, useShell } from '../useShell'

const { store, t, focus, plain, reviewDue, languageCode, language, level, navOn } = useShell()
provide('labReviewDue', reviewDue)
</script>

<template>
  <div class="th desk" :class="{ focus, plain }">
    <aside v-if="!plain" class="side">
      <RouterLink to="/" class="brand"><i aria-hidden="true">{{ [...t('product.name')][0] }}</i><b>{{ t('product.name') }}</b></RouterLink>
      <nav class="group">
        <RouterLink v-for="item in shellMain" :key="item.to" :to="item.to" class="item" :class="{ on: navOn(item.to) }">
          <Icon :name="item.icon" :size="16" :weight="1.8" /><span>{{ t(item.label) }}</span>
          <em v-if="item.to === '/review' && reviewDue">{{ reviewDue }}</em>
        </RouterLink>
      </nav>
      <nav class="group foot">
        <RouterLink to="/settings" class="item lang"><i>{{ languageCode.toUpperCase() }}</i><span>{{ language }}</span><em v-if="level">{{ level }}</em></RouterLink>
        <RouterLink v-for="item in shellFoot" :key="item.to" :to="item.to" class="item" :class="{ on: navOn(item.to) }">
          <Icon :name="item.icon" :size="16" :weight="1.8" /><span>{{ t(item.label) }}</span>
        </RouterLink>
      </nav>
    </aside>

    <main>
      <RouterView v-slot="{ Component }">
        <Transition name="c-view" mode="out-in"><component :is="Component" /></Transition>
      </RouterView>
    </main>

    <Tabs v-if="!plain && !focus" :active="navOn" :due="reviewDue" />
    <Transition name="c-toast"><div v-if="store.toast" class="c-toast" role="status">{{ store.toast }}</div></Transition>
    <LabSwitch />
  </div>
</template>

<style scoped>
.desk{--side:232px}
.desk.plain{--side:0px}
main{min-height:calc(100vh - var(--c-top,0px));min-height:calc(100dvh - var(--c-top,0px));padding-left:var(--side)}

.side{position:fixed;left:0;top:0;bottom:0;z-index:60;width:var(--side);display:flex;flex-direction:column;padding:10px 8px;border-right:1px solid var(--c-line);background:#fafaf8}
.brand{height:40px;margin-bottom:10px;padding:0 8px;display:flex;align-items:center;gap:9px;border-radius:6px;font-size:14px;transition:background .15s}
.brand:hover{background:#efeeea}
.brand i{width:22px;height:22px;display:grid;place-items:center;border-radius:6px;background:var(--c-ink);color:#fff;font-size:12px;font-weight:600}
.brand b{font-weight:600;letter-spacing:-.01em}
.group{display:grid;gap:1px}
.group.foot{margin-top:auto;padding-top:8px;border-top:1px solid var(--c-line)}
.item{height:32px;padding:0 8px;display:flex;align-items:center;gap:9px;border-radius:6px;color:var(--c-soft);font-size:13.5px;font-weight:500;transition:background .12s,color .12s}
.item span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item svg{flex:none}
.item:hover{background:#efeeea;color:var(--c-ink)}
.item.on{background:#e9e8e3;color:var(--c-ink)}
.item.on svg{color:var(--c-accent-ink)}
.item em{flex:none;min-width:18px;height:18px;padding:0 5px;display:grid;place-items:center;border-radius:5px;background:var(--c-tint);color:var(--c-accent-ink);font:600 11px/1 var(--c-mono)}
.lang i{flex:none;width:16px;display:grid;place-items:center;color:var(--c-mute);font:600 9.5px/1 var(--c-mono);letter-spacing:.02em}
.lang em{background:none;color:var(--c-mute);font-weight:500}

@media (max-width:760px){
  .desk{--side:0px}
  .side{display:none}
}
</style>
