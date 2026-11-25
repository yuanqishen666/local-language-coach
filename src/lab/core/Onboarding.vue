<script setup lang="ts">
import { inject, type Component } from 'vue'
import { LOCALE_META, TARGET_LANGUAGES, UI_LOCALES, displayTargetLanguage } from '../../../shared/locales'
import Icon from '../kit/Icon.vue'
import { useOnboardingPage } from '../logic/OnboardingPage'
import { shellWelcome } from '../useShell'

const { t, step, saving, submitError, levels, draft, chooseLanguage, finish } = useOnboardingPage()
const mascot = inject<Component | null>('labMascot', null)
</script>

<template>
  <main class="c-onboard">
    <div class="c-onboard-in">
      <header>
        <b class="c-brand"><i v-if="mascot" aria-hidden="true"><component :is="mascot" :mood="saving ? 'happy' : step === 1 ? 'calm' : step === 2 ? 'talk' : 'wow'" /></i>{{ t('product.name') }}</b>
        <span class="c-steps" :aria-label="`${step} / 3`"><i v-for="n in 3" :key="n" :class="{ on: n <= step, now: n === step }"></i><em>{{ step }} / 3</em></span>
      </header>

      <Transition name="c-leaf" mode="out-in">
        <section :key="step" class="c-leaf">
          <h1 v-if="step === 1">{{ t('onboarding.interfaceTitle') }}</h1>
          <h1 v-else-if="step === 2">{{ t('onboarding.targetTitle') }}</h1>
          <h1 v-else>{{ t('onboarding.levelTitle') }}</h1>

          <div v-if="step === 1" class="c-picks">
            <button v-for="code in UI_LOCALES" :key="code" type="button" :aria-pressed="draft.uiLocale === code" @click="draft.uiLocale = code">
              <small>{{ LOCALE_META[code].shortCode }}</small><b>{{ LOCALE_META[code].nativeName }}</b><Icon v-if="draft.uiLocale === code" name="check" :size="16" :weight="2.4" />
            </button>
          </div>
          <div v-else-if="step === 2" class="c-picks">
            <button v-for="item in TARGET_LANGUAGES" :key="item.code" type="button" :aria-pressed="draft.code === item.code" @click="chooseLanguage(item.code, item.name)">
              <small>{{ item.code.toUpperCase() }}</small><b>{{ displayTargetLanguage(item.code, draft.uiLocale) }}</b><Icon v-if="draft.code === item.code" name="check" :size="16" :weight="2.4" />
            </button>
          </div>
          <div v-else class="c-levels">
            <button v-for="level in levels" :key="level.id" type="button" :aria-pressed="draft.level === level.id" @click="draft.level = level.id">
              <b>{{ level.id }}</b><span>{{ t(level.key) }}</span><Icon v-if="draft.level === level.id" name="check" :size="16" :weight="2.4" />
            </button>
          </div>
        </section>
      </Transition>

      <footer>
        <p class="c-private"><Icon name="lock" :size="14" :weight="2" />{{ t('onboarding.privacy') }}</p>
        <p v-for="item in shellWelcome" :key="item.to" class="c-private"><RouterLink :to="item.to" class="welcome-link">{{ t(item.label) }}</RouterLink></p>
        <p v-if="submitError" class="c-error" role="alert">{{ submitError }}</p>
        <div class="c-onboard-nav">
          <button v-if="step > 1" type="button" class="c-btn big" :disabled="saving" @click="step--"><Icon name="back" :size="17" :weight="2.2" />{{ t('common.back') }}</button>
          <button type="button" class="c-btn primary big" :disabled="saving" @click="step < 3 ? step++ : finish()">{{ saving ? t('onboarding.saving') : step < 3 ? t('common.continue') : t('onboarding.openWorkspace') }}<Icon v-if="!saving" name="arrow" :size="17" :weight="2.2" /></button>
        </div>
      </footer>
    </div>
  </main>
</template>
