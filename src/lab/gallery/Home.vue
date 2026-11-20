<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import Icon from '../kit/Icon.vue'
import { formatWhen } from '../kit/when'
import { useHomePage } from '../logic/HomePage'

const { t, locale, history, creating, startError, startConversation, displayTitle } = useHomePage()
const due = inject<Ref<number>>('labReviewDue', ref(0))
// Presentation only: a long headline steps down a size so it still sits on two lines.
const long = computed(() => [...t('home.titleOpen')].length > 12)
</script>

<template>
  <div class="c-page home">
    <header class="lead">
      <h1 :class="{ long }">{{ t('home.titleOpen') }}</h1>
      <RouterLink v-if="due" to="/review" class="due"><span>{{ t('nav.review') }}</span><b>{{ due }}</b><Icon name="arrow" :size="15" :weight="2" /></RouterLink>
    </header>

    <div class="doors">
      <button type="button" class="door dark" :class="{ going: creating }" :disabled="creating" :data-follow="creating ? undefined : t('home.openAction')" @click="startConversation">
        <small class="c-label">01</small>
        <h2>{{ t('home.openTitle') }}</h2>
        <i class="orb" aria-hidden="true">
          <span v-if="creating" class="c-dots"><i></i><i></i><i></i></span>
          <Icon v-else name="arrow" :size="22" :weight="1.8" />
        </i>
      </button>
      <RouterLink to="/start" class="door">
        <small class="c-label">02</small>
        <h2>{{ t('home.settingTitle') }}</h2>
        <i class="orb" aria-hidden="true"><Icon name="arrow" :size="22" :weight="1.8" /></i>
      </RouterLink>
    </div>
    <p v-if="startError" class="c-error" role="alert">{{ startError }}</p>

    <section v-if="history.length" class="recent">
      <header>
        <h2 class="c-h2">{{ t('home.recentOpen') }}</h2>
        <RouterLink to="/history" class="c-textbtn">{{ t('home.viewAll') }}<Icon name="arrow" :size="14" :weight="2" /></RouterLink>
      </header>
      <ol>
        <li v-for="(item, index) in history.slice(0, 5)" :key="item.id">
          <RouterLink :to="`/conversation/${item.id}`" class="line" :data-follow="t('history.continue')">
            <small>{{ String(index + 1).padStart(2, '0') }}</small>
            <b>{{ displayTitle(item) }}</b>
            <time>{{ formatWhen(item.updatedAt, String(locale)) }}</time>
          </RouterLink>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.lead{position:relative;margin-bottom:clamp(28px,4vw,56px)}
.lead h1{max-width:12em;font-size:clamp(56px,10.4vw,176px);font-weight:500;line-height:.92;letter-spacing:-.065em;text-wrap:balance}
.lead h1.long{max-width:14em;font-size:clamp(44px,6.6vw,112px);line-height:.96;letter-spacing:-.055em}
.due{position:absolute;right:0;top:6px;height:40px;padding:0 14px 0 16px;display:inline-flex;align-items:center;gap:10px;border-radius:99px;background:var(--c-accent);color:#0e0e0e;font-size:13.5px;font-weight:500;transition:background .25s,color .25s}
.due b{font:500 12px/1 var(--c-mono)}
.due svg{transition:transform .5s var(--c-ease)}
.due:hover{background:var(--c-ink);color:#fff}
.due:hover svg{transform:translateX(3px)}

.doors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.door{position:relative;min-height:clamp(190px,22vw,300px);display:grid;grid-template-rows:auto minmax(0,1fr);align-items:end;padding:22px 24px 24px;border-radius:22px;background:var(--c-surface);color:var(--c-ink);text-align:left;overflow:hidden;isolation:isolate;transition:color .35s}
.door::before{content:'';position:absolute;inset:0;z-index:-1;border-radius:50% 50% 0 0 / 30% 30% 0 0;background:var(--c-ink);transform:translateY(101%);transition:transform .7s var(--c-ease),border-radius .7s var(--c-ease)}
.door:hover::before,.door.going::before{border-radius:0;transform:none}
.door:hover,.door.going{color:#fff}
.door.dark{background:var(--c-ink);color:#fff}
.door.dark::before{background:var(--c-accent)}
.door.dark:hover,.door.dark.going{color:#0e0e0e}
.door small{align-self:start;color:inherit;opacity:.6}
.door h2{padding-right:76px;font-size:clamp(30px,4.2vw,68px);font-weight:500;line-height:1;letter-spacing:-.055em}
.orb{position:absolute;right:22px;bottom:22px;width:54px;height:54px;display:grid;place-items:center;border:1px solid currentColor;border-radius:50%;transition:transform .7s var(--c-ease)}
.door:hover .orb{transform:rotate(-45deg)}
.door.going .orb{transform:none}
.home>.c-error{margin-top:14px}

.recent{margin-top:clamp(40px,5vw,72px)}
.recent header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--c-ink)}
.recent header .c-h2{margin:0}
.line{min-height:76px;padding:14px 4px;display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:12px;border-bottom:1px solid var(--c-line)}
.line small{color:var(--c-mute);font:500 11px/1 var(--c-mono);letter-spacing:.06em}
.line b{font-size:clamp(20px,2.3vw,32px);font-weight:500;letter-spacing:-.035em;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:transform .6s var(--c-ease)}
.line time{color:var(--c-mute);font:500 11px/1 var(--c-mono);letter-spacing:.04em;white-space:nowrap}
.line:hover b{transform:translateX(14px)}

@media (max-width:760px){
  .due{position:static;margin-top:18px}
  .doors{grid-template-columns:minmax(0,1fr)}
  .door{min-height:150px;border-radius:18px}
  .line{min-height:64px;grid-template-columns:30px minmax(0,1fr) auto}
}
</style>
