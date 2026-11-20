<script setup lang="ts">
import { provide } from 'vue'
import '../core/all.css'
import './theme.css'
import Icon from '../kit/Icon.vue'
import LabSwitch from '../kit/Switch.vue'
import Tabs from '../core/Tabs.vue'
import Face from '../blocks/Face.vue'
import { shellFoot, shellMain, useShell } from '../useShell'

const { store, t, focus, plain, reviewDue, languageCode, language, level, navOn } = useShell()
provide('labMascot', Face)
provide('labReviewDue', reviewDue)
</script>

<template>
  <div class="th mono" :class="{ focus, plain }">
    <aside v-if="!plain" class="side">
      <RouterLink to="/" class="brand"><i aria-hidden="true"><Face /></i><b>{{ t('product.name') }}</b></RouterLink>
      <nav class="group">
        <RouterLink v-for="item in shellMain" :key="item.to" :to="item.to" class="item" :class="{ on: navOn(item.to) }">
          <Icon :name="item.icon" :size="19" :weight="2.1" /><span>{{ t(item.label) }}</span>
          <em v-if="item.to === '/review' && reviewDue">{{ reviewDue }}</em>
        </RouterLink>
      </nav>
      <nav class="group foot">
        <RouterLink to="/settings" class="lang"><b>{{ languageCode.toUpperCase() }}</b><span>{{ language }}</span><small>{{ level }}</small></RouterLink>
        <RouterLink v-for="item in shellFoot" :key="item.to" :to="item.to" class="item" :class="{ on: navOn(item.to) }">
          <Icon :name="item.icon" :size="19" :weight="2.1" /><span>{{ t(item.label) }}</span>
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
.mono{--side:236px}
.mono.plain{--side:0px}
main{min-height:calc(100vh - var(--c-top,0px));min-height:calc(100dvh - var(--c-top,0px));padding-left:var(--side)}

.side{position:fixed;left:0;top:0;bottom:0;z-index:60;width:var(--side);display:flex;flex-direction:column;padding:14px 10px 14px 14px}
.brand{height:52px;margin-bottom:14px;padding:0 8px;display:flex;align-items:center;gap:11px;font-size:18px;font-weight:800;letter-spacing:-.03em}
.brand i{width:40px;height:40px;display:grid;place-items:center;border-radius:50%;background:var(--c-ink);font-size:11.5px;transition:transform .6s var(--c-spring)}
.brand:hover i{transform:rotate(-14deg) scale(1.1)}
.group{display:grid;gap:4px}
.group.foot{margin-top:auto}
.item{position:relative;height:46px;padding:0 14px;display:flex;align-items:center;gap:12px;border-radius:16px;color:var(--c-soft);font-size:14.5px;font-weight:800;letter-spacing:-.01em;transition:background .2s,color .2s,transform .5s var(--c-spring)}
.item span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item svg{flex:none;transition:transform .5s var(--c-spring)}
.item:hover{background:var(--c-surface);color:var(--c-ink)}
.item:hover svg{transform:rotate(-12deg) scale(1.12)}
.item:active{transform:scale(.95)}
.item.on{background:var(--c-ink);color:#fff}
.item em{flex:none;min-width:22px;height:22px;margin-left:auto;padding:0 7px;display:grid;place-items:center;border-radius:99px;background:var(--c-accent);color:#fff;font-size:11.5px;font-weight:800;font-variant-numeric:tabular-nums}
.lang{height:54px;margin-bottom:2px;padding:0 12px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;border-radius:16px;background:var(--c-surface);transition:transform .5s var(--c-spring)}
.lang:hover{transform:scale(1.03) rotate(-1deg)}
.lang b{width:32px;height:32px;display:grid;place-items:center;border-radius:11px;background:var(--c-accent);color:#fff;font-size:11.5px;font-weight:800;letter-spacing:.02em}
.lang span{font-size:13.5px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lang small{color:var(--c-mute);font-size:12px;font-weight:800}

@media (max-width:760px){
  .mono{--side:0px}
  .side{display:none}
}
</style>
