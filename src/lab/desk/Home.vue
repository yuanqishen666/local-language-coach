<script setup lang="ts">
import { inject, ref, type Ref } from 'vue'
import Icon from '../kit/Icon.vue'
import { formatWhen } from '../kit/when'
import { useHomePage } from '../logic/HomePage'

const { t, locale, history, creating, startError, startConversation, displayTitle } = useHomePage()
const due = inject<Ref<number>>('labReviewDue', ref(0))
</script>

<template>
  <div class="c-page home">
    <header class="c-head"><h1 class="c-title">{{ t('home.titleOpen') }}</h1></header>

    <div class="starts">
      <button type="button" class="start main" :disabled="creating" @click="startConversation">
        <i aria-hidden="true"><Icon name="talk" :size="18" :weight="1.8" /></i>
        <b>{{ t('home.openTitle') }}</b>
        <span class="go">
          <template v-if="creating"><span class="c-dots" aria-hidden="true"><i></i><i></i><i></i></span></template>
          <template v-else>{{ t('home.openAction') }}<Icon name="arrow" :size="14" :weight="2" /></template>
        </span>
      </button>
      <RouterLink to="/start" class="start">
        <i aria-hidden="true"><Icon name="edit" :size="18" :weight="1.8" /></i>
        <b>{{ t('home.settingTitle') }}</b>
        <span class="go"><Icon name="arrow" :size="14" :weight="2" /></span>
      </RouterLink>
      <RouterLink v-if="due" to="/review" class="start">
        <i aria-hidden="true"><Icon name="repeat" :size="18" :weight="1.8" /></i>
        <b>{{ t('nav.review') }}</b>
        <span class="go"><em>{{ due }}</em><Icon name="arrow" :size="14" :weight="2" /></span>
      </RouterLink>
    </div>
    <p v-if="startError" class="c-error" role="alert">{{ startError }}</p>

    <section v-if="history.length" class="recent">
      <header>
        <h2 class="c-h2">{{ t('home.recentOpen') }}</h2>
        <RouterLink to="/history" class="c-textbtn">{{ t('home.viewAll') }}<Icon name="arrow" :size="13" :weight="2" /></RouterLink>
      </header>
      <ul>
        <li v-for="item in history.slice(0, 6)" :key="item.id">
          <RouterLink :to="`/conversation/${item.id}`" class="line">
            <Icon :name="item.kind === 'scene' ? 'edit' : 'talk'" :size="15" :weight="1.8" />
            <b>{{ displayTitle(item) }}</b>
            <span class="c-tag">{{ t(`history.${item.kind === 'scene' ? 'scene' : 'direct'}`) }}</span>
            <time>{{ formatWhen(item.updatedAt, String(locale)) }}</time>
            <Icon name="arrow" :size="14" :weight="2" />
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.home{--c-page-w:820px;padding-top:clamp(40px,10vh,104px)}
.starts{display:grid;border:1px solid var(--c-line);border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.start{min-height:56px;padding:0 16px 0 14px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;background:var(--c-surface);text-align:left;transition:background .12s}
.start+.start{border-top:1px solid var(--c-line)}
.start>i{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;background:var(--c-sunk);color:var(--c-soft);transition:background .15s,color .15s}
.start.main>i{background:var(--c-accent);color:#fff}
.start b{font-size:14.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.go{display:inline-flex;align-items:center;gap:6px;color:var(--c-mute);font-size:13px;font-weight:500;transition:color .12s}
.go svg{transition:transform .25s var(--c-ease)}
.go em{min-width:20px;height:20px;padding:0 6px;display:grid;place-items:center;border-radius:6px;background:var(--c-tint);color:var(--c-accent-ink);font:600 11.5px/1 var(--c-mono)}
.start:hover:not(:disabled){background:var(--c-sunk)}
.start:hover:not(:disabled)>i{background:var(--c-ink);color:#fff}
.start:hover:not(:disabled) .go{color:var(--c-ink)}
.start:hover:not(:disabled) .go svg{transform:translateX(3px)}
.home>.c-error{margin-top:12px}

.recent{margin-top:36px}
.recent header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;padding-left:10px}
.recent header .c-h2{margin:0}
.line{height:40px;padding:0 10px;display:grid;grid-template-columns:auto minmax(0,1fr) auto auto 14px;align-items:center;gap:10px;border-radius:6px;transition:background .12s}
.line>svg:first-child{color:var(--c-mute)}
.line b{font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.line time{min-width:56px;color:var(--c-mute);font-size:12.5px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.line>svg:last-child{color:var(--c-mute);opacity:0;transform:translateX(-4px);transition:opacity .12s,transform .25s var(--c-ease)}
.line:hover{background:var(--c-sunk)}
.line:hover>svg:last-child{opacity:1;transform:none}

@media (max-width:760px){
  .start{padding-block:10px}
  .start b{white-space:normal}
  .home{padding-top:20px}
  .line{grid-template-columns:auto minmax(0,1fr) auto}
  .line .c-tag,.line>svg:last-child{display:none}
}
</style>
