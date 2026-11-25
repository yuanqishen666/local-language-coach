<script setup lang="ts">
import { LOCALE_META, TARGET_LANGUAGES, UI_LOCALES, displayTargetLanguage } from '../../../shared/locales'
import Icon from '../kit/Icon.vue'
import Flap from './Flap.vue'
import { useOnboardingPage } from '../logic/OnboardingPage'
import { shellWelcome } from '../useShell'

const { t, step, saving, submitError, levels, draft, chooseLanguage, finish } = useOnboardingPage()
</script>

<template>
  <main class="ob">
    <header>
      <span class="brand"><i aria-hidden="true"></i>{{ t('product.name') }}</span>
      <span class="steps" :aria-label="`${step} / 3`"><i v-for="n in 3" :key="n" :class="{ on: n <= step, now: n === step }"></i></span>
    </header>

    <Transition name="leaf" mode="out-in">
      <section :key="step" class="leaf">
        <span class="nf-label">0{{ step }} / 03</span>
        <h1 v-if="step === 1"><Flap :text="t('onboarding.interfaceTitle')" /></h1>
        <h1 v-else-if="step === 2"><Flap :text="t('onboarding.targetTitle')" /></h1>
        <h1 v-else><Flap :text="t('onboarding.levelTitle')" /></h1>

        <div v-if="step === 1" class="picks">
          <button v-for="code in UI_LOCALES" :key="code" type="button" :aria-pressed="draft.uiLocale === code" @click="draft.uiLocale = code">
            <small class="nf-mono">{{ LOCALE_META[code].shortCode }}</small><b>{{ LOCALE_META[code].nativeName }}</b>
          </button>
        </div>
        <div v-else-if="step === 2" class="picks">
          <button v-for="item in TARGET_LANGUAGES" :key="item.code" type="button" :aria-pressed="draft.code === item.code" @click="chooseLanguage(item.code, item.name)">
            <small class="nf-mono">{{ item.code.toUpperCase() }}</small><b>{{ displayTargetLanguage(item.code, draft.uiLocale) }}</b>
          </button>
        </div>
        <div v-else class="levels">
          <button v-for="(level, at) in levels" :key="level.id" type="button" :aria-pressed="draft.level === level.id" @click="draft.level = level.id">
            <span class="alt" aria-hidden="true"><i v-for="n in levels.length" :key="n" :class="{ on: n <= at + 1 }"></i></span>
            <b>{{ level.id }}</b><span>{{ t(level.key) }}</span>
          </button>
        </div>
      </section>
    </Transition>

    <footer>
      <p class="private"><Icon name="lock" :size="13" />{{ t('onboarding.privacy') }}</p>
      <p v-for="item in shellWelcome" :key="item.to" class="private"><RouterLink :to="item.to" class="welcome-link">{{ t(item.label) }}</RouterLink></p>
      <p v-if="submitError" class="nf-error" role="alert">{{ submitError }}</p>
      <div class="nav">
        <button v-if="step > 1" type="button" class="nf-btn ghost" :disabled="saving" @click="step--">{{ t('common.back') }}</button>
        <button type="button" class="nf-btn" :disabled="saving" @click="step < 3 ? step++ : finish()"><i v-if="saving" class="nf-lamp blink dark"></i>{{ saving ? t('onboarding.saving') : step < 3 ? t('common.continue') : t('onboarding.openWorkspace') }}<Icon v-if="!saving" name="arrow" :size="16" /></button>
      </div>
    </footer>
  </main>
</template>

<style scoped>
.ob{min-height:100dvh;max-width:1040px;margin:0 auto;padding:0 var(--gutter);display:grid;grid-template-rows:auto 1fr auto}
.ob>header{display:flex;align-items:center;justify-content:space-between;height:76px}
.brand{display:inline-flex;align-items:center;gap:12px;font-size:14px;font-weight:600;letter-spacing:.01em}
.brand i{width:18px;height:25px;border-radius:9px;background:linear-gradient(180deg,#1c2b4a,#ff9d5c 130%);box-shadow:0 0 0 2px rgba(234,238,246,.2)}

/* three runway lights */
.steps{display:flex;align-items:center;gap:10px}
.steps i{width:26px;height:4px;border-radius:2px;background:rgba(234,238,246,.14);transition:background .4s,box-shadow .4s,width .5s var(--spring)}
.steps i.on{background:var(--amber)}
.steps i.now{width:44px;box-shadow:0 0 14px rgba(255,182,72,.7)}

.leaf{align-self:center;display:grid;gap:26px;padding:30px 0 40px}
.leaf h1{font-size:clamp(38px,5.6vw,76px);font-weight:300;line-height:1.04;letter-spacing:-.05em}

.picks{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
.picks button{display:inline-flex;align-items:center;gap:11px;height:52px;padding:0 22px 0 16px;border:0;border-radius:999px;background:var(--faint);box-shadow:inset 0 0 0 1px var(--line);transition:transform .45s var(--spring),box-shadow .25s,background .25s,color .25s}
.picks small{color:var(--muted);font-size:10.5px;letter-spacing:.1em;transition:color .25s}
.picks b{font-size:16px;font-weight:500}
.picks button:hover{transform:translateY(-3px);box-shadow:inset 0 0 0 1px rgba(234,238,246,.34)}
.picks button:active{transform:scale(.95)}
.picks button[aria-pressed='true']{background:var(--amber);box-shadow:0 12px 34px -12px rgba(255,182,72,.8);color:#1b1204}
.picks button[aria-pressed='true'] small{color:rgba(27,18,4,.6)}

/* levels climb like altitude */
.levels{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:12px;margin-top:10px}
.levels button{display:grid;justify-items:start;gap:8px;padding:20px 20px 18px;border:0;border-radius:22px;background:var(--faint);box-shadow:inset 0 0 0 1px var(--line);text-align:left;transition:transform .5s var(--spring),box-shadow .25s,background .25s}
.alt{display:flex;align-items:flex-end;gap:4px;height:26px;margin-bottom:8px}
.alt i{width:6px;border-radius:3px;background:rgba(234,238,246,.14);transition:background .3s}
.alt i:nth-child(1){height:8px}.alt i:nth-child(2){height:14px}.alt i:nth-child(3){height:20px}.alt i:nth-child(4){height:26px}
.alt i.on{background:var(--amber)}
.levels b{font-size:30px;font-weight:300;letter-spacing:-.03em;line-height:1}
.levels button>span:last-child{color:var(--soft);font-size:13px;line-height:1.6}
.levels button:hover{transform:translateY(-5px);box-shadow:inset 0 0 0 1px rgba(234,238,246,.34)}
.levels button[aria-pressed='true']{background:var(--amber-soft);box-shadow:inset 0 0 0 1.5px var(--amber)}
.levels button[aria-pressed='true'] b{color:var(--amber)}

.ob>footer{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px 24px;padding:22px 0 calc(34px + env(safe-area-inset-bottom));border-top:1px solid var(--line)}
.private{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12.5px;line-height:1.6}
.private svg{flex:none}
.ob .nf-error{grid-column:1 / -1;grid-row:2}
.nav{display:flex;gap:10px}
.nf-lamp.dark{background:#1b1204}

.leaf-enter-active{transition:opacity .4s,transform .6s var(--out)}
.leaf-leave-active{transition:opacity .16s,transform .2s ease-in}
.leaf-enter-from{opacity:0;transform:translateX(40px)}
.leaf-leave-to{opacity:0;transform:translateX(-30px)}

@media (max-width:760px){
  .ob>header{height:60px}
  .leaf{align-self:start;gap:20px;padding:26px 0}
  .picks button{height:46px;padding:0 18px 0 13px}
  .picks b{font-size:15px}
  .levels{grid-auto-flow:row;grid-template-columns:repeat(2,minmax(0,1fr))}
  .ob>footer{grid-template-columns:1fr}
  .nav{justify-content:flex-end}
  .ob .nf-error{grid-row:auto}
}
</style>
