<script setup lang="ts">
import { inject, ref, type Ref } from 'vue'
import Icon from '../kit/Icon.vue'
import Face from '../blocks/Face.vue'
import { formatWhen } from '../kit/when'
import { useHomePage } from '../logic/HomePage'

const { t, locale, history, creating, startError, startConversation, displayTitle } = useHomePage()
const due = inject<Ref<number>>('labReviewDue', ref(0))
const near = ref(false)
</script>

<template>
  <div class="c-page home" :class="{ solo: !history.length }">
    <section class="hero" :class="{ going: creating }">
      <button type="button" class="hit" :disabled="creating" @click="startConversation" @pointerenter="near = true" @pointerleave="near = false">
        <i class="mug" aria-hidden="true"><Face :mood="creating ? 'happy' : near ? 'talk' : 'calm'" /></i>
        <h1>{{ t('home.titleOpen') }}</h1>
        <span class="go">{{ creating ? t('home.starting') : t('home.openAction') }}<Icon v-if="!creating" name="arrow" :size="20" :weight="2.4" /></span>
      </button>
    </section>

    <div class="col">
      <RouterLink to="/start" class="tile scene">
        <h2>{{ t('home.settingTitle') }}</h2>
        <div class="parts">
          <span>{{ t('home.customContext') }}</span><span>{{ t('home.customTopic') }}</span><span>{{ t('home.customPerson') }}</span>
        </div>
        <i class="arrow" aria-hidden="true"><Icon name="arrow" :size="20" :weight="2.4" /></i>
      </RouterLink>

      <RouterLink v-if="due" to="/review" class="tile due">
        <Icon name="repeat" :size="20" :weight="2.2" /><b>{{ t('nav.review') }}</b><em>{{ due }}</em><Icon name="arrow" :size="18" :weight="2.4" />
      </RouterLink>

      <section v-if="history.length" class="tile recent">
        <header>
          <h2>{{ t('home.recentOpen') }}</h2>
          <RouterLink to="/history" class="c-textbtn">{{ t('home.viewAll') }}<Icon name="arrow" :size="14" :weight="2.4" /></RouterLink>
        </header>
        <ul>
          <li v-for="item in history.slice(0, 4)" :key="item.id">
            <RouterLink :to="`/conversation/${item.id}`" class="row">
              <b>{{ displayTitle(item) }}</b><time>{{ formatWhen(item.updatedAt, String(locale)) }}</time><Icon name="arrow" :size="15" :weight="2.4" />
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>

    <p v-if="startError" class="c-error" role="alert">{{ startError }}</p>
  </div>
</template>

<style scoped>
.home{--c-page-w:1240px;min-height:100vh;min-height:100dvh;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;gap:12px;padding:14px 14px 14px 4px}
.home.solo{grid-template-columns:minmax(0,1.7fr) minmax(0,1fr)}
.home>.c-error{grid-column:1 / -1}

.hero{min-height:520px;border-radius:40px;background:var(--c-accent);color:#fff;transition:border-radius .6s var(--c-ease)}
.hero:hover{border-radius:64px}
.hit{width:100%;height:100%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;justify-items:start;padding:clamp(24px,3.2vw,44px);color:inherit;text-align:left;border-radius:inherit}
.mug{--face-mouth:#151515;font-size:clamp(34px,4.2vw,56px);transition:transform .7s var(--c-spring)}
.hit:hover .mug{transform:rotate(-6deg) scale(1.06)}
.hero h1{align-self:end;max-width:8.5em;font-size:clamp(42px,5.6vw,88px);font-weight:800;line-height:1;letter-spacing:-.055em;text-wrap:balance}
.go{height:60px;margin-top:clamp(22px,3vw,36px);padding:0 28px;display:inline-flex;align-items:center;gap:12px;border-radius:99px;background:#fff;color:var(--c-ink);font-size:16.5px;font-weight:800;letter-spacing:-.01em;transition:transform .55s var(--c-spring),background .2s,color .2s}
.go svg{transition:transform .55s var(--c-spring)}
.hit:hover .go{transform:scale(1.07) rotate(-2deg);background:var(--c-ink);color:#fff}
.hit:hover .go svg{transform:translateX(5px)}
.hit:active .go{transform:scale(.94,.9)}
.hero.going .go{background:var(--c-ink);color:#fff}

.col{min-width:0;display:flex;flex-direction:column;gap:12px}
.tile{position:relative;border-radius:32px;background:var(--c-surface)}
.tile h2{font-size:clamp(22px,2vw,28px);font-weight:800;line-height:1.1;letter-spacing:-.04em}

.scene{min-height:210px;display:flex;flex-direction:column;justify-content:space-between;gap:22px;padding:26px 28px;transition:border-radius .5s var(--c-ease),background .25s,color .25s}
.scene:hover{border-radius:48px;background:var(--c-ink);color:#fff}
.parts{display:flex;flex-wrap:wrap;gap:6px;padding-right:64px}
.parts span{height:34px;padding:0 14px;display:inline-flex;align-items:center;border-radius:99px;background:var(--c-bg);font-size:13px;font-weight:800;transition:background .25s,transform .5s var(--c-spring)}
.scene:hover .parts span{background:rgba(255,255,255,.14)}
.scene:hover .parts span:nth-child(1){transform:rotate(-4deg)}
.scene:hover .parts span:nth-child(2){transform:translateY(-4px)}
.scene:hover .parts span:nth-child(3){transform:rotate(4deg)}
.arrow{position:absolute;right:22px;bottom:22px;width:48px;height:48px;display:grid;place-items:center;border-radius:50%;background:var(--c-ink);color:#fff;transition:transform .55s var(--c-spring),background .25s}
.scene:hover .arrow{background:var(--c-accent);transform:scale(1.12) rotate(-45deg)}

.due{height:68px;padding:0 22px 0 24px;display:flex;align-items:center;gap:12px;border-radius:26px;background:var(--c-ink);color:#fff;transition:transform .5s var(--c-spring)}
.due:hover{transform:scale(1.02) rotate(-.6deg)}
.due b{font-size:16px;font-weight:800;letter-spacing:-.02em}
.due em{min-width:28px;height:28px;margin-left:auto;padding:0 9px;display:grid;place-items:center;border-radius:99px;background:var(--c-accent);font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.due svg:last-child{transition:transform .5s var(--c-spring)}
.due:hover svg:last-child{transform:translateX(4px)}

.recent{flex:1;padding:24px 14px 14px}
.recent header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 6px 12px 14px}
.recent h2{font-size:20px}
.recent ul{display:grid;gap:2px}
.row{height:54px;padding:0 12px 0 14px;display:flex;align-items:center;gap:12px;border-radius:16px;transition:background .15s}
.row b{flex:1;min-width:0;font-size:15px;font-weight:800;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row time{flex:none;color:var(--c-mute);font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums}
.row svg{flex:none;width:0;opacity:0;transition:width .3s var(--c-ease),opacity .2s}
.row:hover{background:var(--c-bg)}
.row:hover svg{width:15px;opacity:1}

@media (max-width:980px){
  .home,.home.solo{grid-template-columns:minmax(0,1fr);grid-template-rows:none;min-height:0;padding:12px 12px 110px}
  .hero{min-height:380px;border-radius:32px}
  .tile{border-radius:26px}
  .scene{min-height:170px}
}
@media (min-width:761px) and (max-width:980px){
  .home,.home.solo{padding:14px 14px 40px 4px}
}
</style>
