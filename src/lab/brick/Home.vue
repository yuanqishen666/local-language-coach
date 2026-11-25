<script setup lang="ts">
import { inject, ref, type Ref } from 'vue'
import Icon from '../kit/Icon.vue'
import Face from '../blocks/Face.vue'
import { vTip } from '../core/tip'
import { formatWhen } from '../kit/when'
import { useHomePage } from '../logic/HomePage'
import { betaLabelsFor, betaLink, betaPath } from '../../data-privacy'

const { t, locale, history, creating, startError, startConversation, displayTitle, askLevel, levelLanguage, levelLanguageCode, path, pathWriting, pathError, pathStarting, suggestPath, startPathItem, pathLevel, mistakeLabel } = useHomePage()
const due = inject<Ref<number>>('labReviewDue', ref(0))
const near = ref(false)
</script>

<!-- The home page is 04's: two big blocks to start from, then what is due and what was last talked about. -->
<template>
  <div class="bh" :class="{ solo: !history.length }">
    <section class="bh-hero" :class="{ going: creating }" @pointerenter="near = true" @pointerleave="near = false">
      <i class="bh-face" aria-hidden="true"><Face :mood="creating ? 'happy' : near ? 'talk' : 'calm'" /></i>
      <h1>{{ t('home.titleOpen') }}</h1>
      <button type="button" class="bh-hit" :disabled="creating" @click="startConversation" @focus="near = true" @blur="near = false">
        <span class="bh-go">{{ creating ? t('home.starting') : t('home.openAction') }}<Icon v-if="!creating" name="arrow" :size="20" :weight="2.4" /></span>
      </button>
    </section>

    <div class="bh-col">
      <RouterLink to="/start" class="bh-tile bh-scene">
        <h2>{{ t('home.settingTitle') }}</h2>
        <div class="bh-parts">
          <span>{{ t('home.customContext') }}</span><span>{{ t('home.customTopic') }}</span><span>{{ t('home.customPerson') }}</span>
        </div>
        <i class="bh-arrow" aria-hidden="true"><Icon name="arrow" :size="20" :weight="2.4" /></i>
      </RouterLink>

      <RouterLink v-if="askLevel" :to="{ path: '/placement', query: { language: levelLanguageCode } }" class="bh-tile bh-due bh-level">
        <Icon name="sliders" :size="20" :weight="2.2" /><b>{{ t('level.homePrompt', { language: levelLanguage }) }}</b><Icon name="arrow" :size="18" :weight="2.4" />
      </RouterLink>

      <RouterLink v-if="due" to="/review" class="bh-tile bh-due">
        <Icon name="repeat" :size="20" :weight="2.2" /><b>{{ t('nav.review') }}</b><em>{{ due }}</em><Icon name="arrow" :size="18" :weight="2.4" />
      </RouterLink>

      <button v-if="!path" v-tip="t('path.suggestTip')" type="button" class="bh-tile bh-due bh-next" :disabled="pathWriting" @click="suggestPath">
        <Icon name="pin" :size="20" :weight="2.2" /><b>{{ pathWriting ? t('path.writing') : t('path.title') }}</b>
        <span v-if="pathWriting" class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span><Icon v-else name="arrow" :size="18" :weight="2.4" />
      </button>
      <section v-else class="bh-tile bh-recent bh-path">
        <header>
          <h2>{{ t('path.title') }}</h2>
          <button v-tip="t('path.suggestTip')" type="button" class="y-link" :disabled="pathWriting" @click="suggestPath"><Icon name="refresh" :size="14" :weight="2.4" />{{ pathWriting ? t('path.writing') : t('path.refresh') }}</button>
        </header>
        <ul>
          <li v-for="item in path.items" :key="item.id">
            <button type="button" class="bh-row bh-step" :disabled="Boolean(pathStarting)" @click="startPathItem(item)">
              <span>
                <b>{{ item.title }}</b>
                <small><i v-for="word in item.words" :key="word.wordId" class="word" :lang="path.languageCode">{{ word.term }}</i><i v-if="item.mistake">{{ mistakeLabel(item.mistake) }}</i><i>{{ pathLevel(item) }}</i></small>
              </span>
              <span v-if="pathStarting === item.id" class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span><Icon v-else name="arrow" :size="15" :weight="2.4" />
            </button>
          </li>
        </ul>
      </section>
      <p v-if="pathError" class="y-error" role="alert">{{ pathError }}</p>

      <a v-if="betaPath" :href="betaLink(locale)" class="bh-tile bh-scene" aria-labelledby="bh-beta-title" aria-describedby="bh-beta-features" data-qs-id="qs-beta-entry">
        <h2 id="bh-beta-title" data-content-source-exempt="requested-beta-entry">{{ betaLabelsFor(locale)[0] }}</h2>
        <div id="bh-beta-features" class="bh-parts">
          <span v-for="label in betaLabelsFor(locale).slice(1)" :key="label" data-content-source-exempt="beta-partner-scene-points-and-account-features">{{ label }}</span>
        </div>
        <i class="bh-arrow" aria-hidden="true"><Icon name="arrow" :size="20" :weight="2.4" /></i>
      </a>

      <section v-if="history.length" class="bh-tile bh-recent">
        <header>
          <h2>{{ t('home.recentOpen') }}</h2>
          <RouterLink to="/history" class="y-link">{{ t('home.viewAll') }}<Icon name="arrow" :size="14" :weight="2.4" /></RouterLink>
        </header>
        <ul>
          <li v-for="item in history.slice(0, path ? 2 : 4)" :key="item.id">
            <RouterLink :to="`/conversation/${item.id}`" class="bh-row">
              <b>{{ displayTitle(item) }}</b><time>{{ formatWhen(item.updatedAt, String(locale)) }}</time><Icon name="arrow" :size="15" :weight="2.4" />
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>

    <p v-if="startError" class="y-error bh-error" role="alert">{{ startError }}</p>
  </div>
</template>

<style scoped>
.bh { width: 100%; max-width: 1240px; min-height: 100vh; min-height: 100dvh; margin: 0 auto; padding: 12px 12px 12px 2px; display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; gap: 12px; }
.bh.solo { grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); }
.bh-error { grid-column: 1 / -1; }

.bh-hero { position: relative; min-width: 0; min-height: 520px; padding: clamp(24px, 3.2vw, 44px); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; justify-items: start; border-radius: 40px; background: var(--y-accent); color: #fff; transition: border-radius .6s var(--y-ease); }
.bh-face { --face-mouth: #151515; display: block; font-size: clamp(34px, 4.2vw, 56px); line-height: 0; transition: transform .7s var(--y-spring); }
.bh-hero h1 { align-self: end; max-width: 8.5em; font-size: clamp(42px, 5.6vw, 88px); font-weight: 800; line-height: 1; letter-spacing: -.055em; text-wrap: balance; overflow-wrap: anywhere; }
.bh-hit { margin-top: clamp(22px, 3vw, 36px); border-radius: 99px; }
/* the whole block starts the chat, not only the pill */
.bh-hit::after { content: ''; position: absolute; inset: 0; border-radius: 40px; }
.bh-hit:focus-visible { outline-color: #fff; }
.bh-go { height: 60px; padding: 0 28px; display: inline-flex; align-items: center; gap: 12px; border-radius: 99px; background: #fff; color: var(--y-ink); font-size: 16.5px; font-weight: 800; letter-spacing: -.01em; white-space: nowrap; transition: transform .55s var(--y-spring), background .2s, color .2s; }
.bh-go svg { transition: transform .55s var(--y-spring); }
.bh-hero.going .bh-go { background: var(--y-ink); color: #fff; }
.bh-hit:active:not(:disabled) .bh-go { transform: scale(.94, .9); }

.bh-col { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.bh-tile { position: relative; min-width: 0; border-radius: 32px; background: var(--y-bg); }
.bh-tile h2 { font-size: clamp(22px, 2vw, 28px); font-weight: 800; line-height: 1.1; letter-spacing: -.04em; overflow-wrap: anywhere; }

.bh-scene { min-height: 210px; padding: 26px 28px; display: flex; flex-direction: column; justify-content: space-between; gap: 22px; transition: border-radius .5s var(--y-ease), background .25s, color .25s; }
.bh-parts { padding-right: 64px; display: flex; flex-wrap: wrap; gap: 6px; }
.bh-parts span { min-height: 34px; padding: 4px 14px; display: inline-flex; align-items: center; border-radius: 99px; background: var(--y-page); font-size: 13px; font-weight: 800; transition: background .25s, transform .5s var(--y-spring); }
.bh-arrow { position: absolute; right: 22px; bottom: 22px; width: 48px; height: 48px; display: grid; place-items: center; border-radius: 50%; background: var(--y-ink); color: #fff; transition: transform .55s var(--y-spring), background .25s; }

.bh-due { flex: none; height: 68px; padding: 0 22px 0 24px; display: flex; align-items: center; gap: 12px; border-radius: 26px; background: var(--y-ink); color: #fff; transition: transform .5s var(--y-spring); }
.bh-due b { min-width: 0; font-size: 16px; font-weight: 800; letter-spacing: -.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-due em { flex: none; min-width: 28px; height: 28px; margin-left: auto; padding: 0 9px; display: grid; place-items: center; border-radius: 99px; background: var(--y-accent); font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
.bh-due svg:last-child { transition: transform .5s var(--y-spring); }
.bh-level { background: var(--y-accent); }
.bh-level svg:last-child { margin-left: auto; }

.bh-recent { flex: 1; padding: 24px 14px 14px; }
.bh-recent header { padding: 0 6px 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.bh-recent h2 { min-width: 0; font-size: 20px; }
.bh-recent ul { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; }
.bh-recent li { min-width: 0; }
.bh-row { height: 54px; padding: 0 12px 0 14px; display: flex; align-items: center; gap: 12px; border-radius: 16px; transition: background .15s; }
.bh-row b { flex: 1; min-width: 0; font-size: 15px; font-weight: 800; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-row time { flex: none; color: var(--y-mute); font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.bh-row svg { flex: none; width: 0; opacity: 0; transition: width .3s var(--y-ease), opacity .2s; }

.bh-next { width: 100%; background: var(--y-bg); color: var(--y-ink); text-align: start; }
.bh-next > :last-child { flex: none; margin-left: auto; }
.bh-next:disabled { cursor: default; }
.bh-path { flex: none; }
.bh-path header .y-link { flex: none; }
.bh-step { width: 100%; height: auto; min-height: 64px; padding: 10px 12px 10px 14px; text-align: start; }
.bh-step > span:first-child { flex: 1; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
.bh-step b { line-height: 1.3; white-space: normal; overflow: visible; overflow-wrap: anywhere; }
.bh-step small { display: flex; flex-wrap: wrap; gap: 4px; }
.bh-step small i { max-width: 100%; height: 22px; padding: 0 9px; display: inline-block; border-radius: 99px; box-shadow: inset 0 0 0 1.5px var(--y-line2); color: var(--y-soft); font-size: 12px; font-style: normal; font-weight: 700; line-height: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-step small i.word { background: var(--y-tint); box-shadow: none; color: var(--y-accent); }
.bh-step:disabled { cursor: default; }
.bh-step > .y-dots { flex: none; }

@media (hover: hover) {
  .bh-hero:hover { border-radius: 64px; }
  .bh-hero:hover .bh-face { transform: rotate(-6deg) scale(1.06); }
  .bh-hero:not(.going):hover .bh-go { background: var(--y-ink); color: #fff; transform: scale(1.07) rotate(-2deg); }
  .bh-hero:not(.going):hover .bh-go svg { transform: translateX(5px); }
  .bh-scene:hover { border-radius: 48px; background: var(--y-ink); color: #fff; }
  .bh-scene:hover .bh-parts span { background: rgba(255, 255, 255, .14); }
  .bh-scene:hover .bh-parts span:nth-child(1) { transform: rotate(-4deg); }
  .bh-scene:hover .bh-parts span:nth-child(2) { transform: translateY(-4px); }
  .bh-scene:hover .bh-parts span:nth-child(3) { transform: rotate(4deg); }
  .bh-scene:hover .bh-arrow { background: var(--y-accent); transform: scale(1.12) rotate(-45deg); }
  .bh-due:hover { transform: scale(1.02) rotate(-.6deg); }
  .bh-due:hover svg:last-child { transform: translateX(4px); }
  .bh-row:hover { background: var(--y-page); }
  .bh-row:hover svg { width: 15px; opacity: 1; }
}

@media (max-width: 980px) {
  .bh, .bh.solo { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; min-height: 0; padding-bottom: 28px; }
  .bh-hero { min-height: 380px; border-radius: 32px; }
  .bh-hit::after { border-radius: 32px; }
  .bh-tile { border-radius: 26px; }
  .bh-scene { min-height: 170px; }
}
@media (max-width: 760px) {
  .bh, .bh.solo { padding: 12px 12px 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .bh-face, .bh-go, .bh-go svg, .bh-parts span, .bh-arrow, .bh-due, .bh-due svg { transform: none !important; }
}
</style>
