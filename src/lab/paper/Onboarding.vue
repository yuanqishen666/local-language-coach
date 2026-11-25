<script setup lang="ts">
import { LOCALE_META, TARGET_LANGUAGES, UI_LOCALES, displayTargetLanguage } from '../../../shared/locales'
import Icon from '../kit/Icon.vue'
import { useOnboardingPage } from '../logic/OnboardingPage'
import { shellWelcome } from '../useShell'

const { t, step, saving, submitError, levels, draft, chooseLanguage, finish } = useOnboardingPage()
</script>

<template>
  <main class="ob">
    <header>
      <span class="brand"><i class="pp-seal" aria-hidden="true">{{ t('product.name').slice(0, 1) }}</i>{{ t('product.name') }}</span>
      <span class="steps pp-num" :aria-label="`${step} / 3`"><b>{{ step }}</b><i></i>3</span>
    </header>

    <Transition name="leaf" mode="out-in">
      <section :key="step" class="leaf">
        <h1 v-if="step === 1">{{ t('onboarding.interfaceTitle') }}</h1>
        <h1 v-else-if="step === 2">{{ t('onboarding.targetTitle') }}</h1>
        <h1 v-else>{{ t('onboarding.levelTitle') }}</h1>

        <div v-if="step === 1" class="picks cols">
          <button v-for="code in UI_LOCALES" :key="code" type="button" :aria-pressed="draft.uiLocale === code" @click="draft.uiLocale = code">
            <small>{{ LOCALE_META[code].shortCode }}</small><b>{{ LOCALE_META[code].nativeName }}</b>
          </button>
        </div>
        <div v-else-if="step === 2" class="picks cols">
          <button v-for="item in TARGET_LANGUAGES" :key="item.code" type="button" :aria-pressed="draft.code === item.code" @click="chooseLanguage(item.code, item.name)">
            <small>{{ item.code.toUpperCase() }}</small><b>{{ displayTargetLanguage(item.code, draft.uiLocale) }}</b>
          </button>
        </div>
        <div v-else class="picks levels">
          <button v-for="level in levels" :key="level.id" type="button" :aria-pressed="draft.level === level.id" @click="draft.level = level.id">
            <b>{{ level.id }}</b><span>{{ t(level.key) }}</span>
          </button>
        </div>
      </section>
    </Transition>

    <footer>
      <p class="private"><Icon name="lock" :size="13" />{{ t('onboarding.privacy') }}</p>
      <p v-for="item in shellWelcome" :key="item.to" class="private"><RouterLink :to="item.to" class="welcome-link">{{ t(item.label) }}</RouterLink></p>
      <p v-if="submitError" class="pp-error" role="alert">{{ submitError }}</p>
      <div class="nav">
        <button v-if="step > 1" type="button" class="pp-link" :disabled="saving" @click="step--">{{ t('common.back') }}</button>
        <button type="button" class="pp-btn" :disabled="saving" @click="step < 3 ? step++ : finish()">{{ saving ? t('onboarding.saving') : step < 3 ? t('common.continue') : t('onboarding.openWorkspace') }}<Icon v-if="!saving" name="arrow" :size="16" /></button>
      </div>
    </footer>
  </main>
</template>

<style scoped>
.ob{min-height:100dvh;max-width:1180px;margin:0 auto;padding:0 var(--gutter);display:grid;grid-template-rows:auto minmax(0,1fr) auto}
.ob>header{height:84px;display:flex;align-items:center;justify-content:space-between}
.brand{display:inline-flex;align-items:center;gap:12px;font:500 19px/1 var(--serif);letter-spacing:.04em}
.steps{display:inline-flex;align-items:center;gap:12px;color:var(--muted);font:400 20px/1 var(--serif)}
.steps b{color:var(--ink);font-weight:500}
.steps i{width:34px;height:1px;background:currentColor}

.leaf{align-self:center;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);align-items:start;gap:40px 72px;padding:30px 0 50px}
.leaf h1{position:sticky;top:40px;font:500 clamp(40px,5vw,70px)/1.08 var(--serif);letter-spacing:-.035em;text-wrap:balance}
.leaf-enter-active{transition:opacity .5s,transform .7s var(--out)}
.leaf-leave-active{transition:opacity .2s,transform .25s ease-in}
.leaf-enter-from{opacity:0;transform:translateX(36px)}
.leaf-leave-to{opacity:0;transform:translateX(-24px)}

.picks{display:grid;border-top:1px solid var(--ink)}
.picks.cols{grid-template-columns:1fr 1fr;column-gap:36px}
.picks button{position:relative;display:flex;align-items:baseline;gap:16px;padding:17px 0;border:0;border-bottom:1px solid var(--line);background:none;color:var(--soft);text-align:left;transition:color .3s,padding .5s var(--out)}
.picks small{width:30px;color:var(--muted);font-size:11px;font-weight:600;letter-spacing:.1em;transition:color .3s}
.picks b{font:500 24px/1.25 var(--serif);letter-spacing:-.01em}
.picks button::after{content:'';position:absolute;right:4px;top:50%;width:9px;height:9px;border-radius:50%;background:var(--red);transform:translateY(-50%) scale(0);transition:transform .45s var(--out)}
.picks button:hover{color:var(--ink);padding-left:8px}
.picks button[aria-pressed='true']{color:var(--ink);padding-left:8px}
.picks button[aria-pressed='true'] small{color:var(--red)}
.picks button[aria-pressed='true']::after{transform:translateY(-50%) scale(1)}
.levels button{display:grid;grid-template-columns:110px minmax(0,1fr);align-items:center;padding:24px 0}
.levels b{font:400 58px/1 var(--serif);letter-spacing:-.04em}
.levels span{font-size:15px;line-height:1.6}
.levels button[aria-pressed='true'] b{color:var(--red)}

.ob>footer{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px 24px;padding:22px 0 30px;border-top:1px solid var(--line)}
.private{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:12px}
.ob .pp-error{grid-column:1 / -1;grid-row:1}
.nav{display:flex;align-items:center;gap:26px}

@media (max-width:900px){
  .leaf{grid-template-columns:1fr;gap:28px;align-self:start;padding:16px 0 34px}
  .leaf h1{position:static}
}
@media (max-width:760px){
  .ob>header{height:64px}
  .picks.cols{column-gap:20px}
  .picks b{font-size:19px}
  .picks small{width:24px}
  .picks button{gap:10px;padding:14px 0}
  .levels button{grid-template-columns:78px minmax(0,1fr)}
  .levels b{font-size:42px}
  .ob>footer{grid-template-columns:1fr;position:sticky;bottom:0;background:var(--paper);padding:14px 0 calc(16px + env(safe-area-inset-bottom))}
  .nav{justify-content:space-between}
  .nav .pp-btn{margin-left:auto}
}
</style>
