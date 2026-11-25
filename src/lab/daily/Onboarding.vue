<script setup lang="ts">
import './daily.css'
import './pages.css'
import { LOCALE_META, TARGET_LANGUAGES, UI_LOCALES, displayTargetLanguage } from '../../../shared/locales'
import Icon from '../kit/Icon.vue'
import Face from '../blocks/Face.vue'
import { useOnboardingPage } from '../logic/OnboardingPage'
import { shellWelcome } from '../useShell'
import { betaLabelsFor, betaLink, betaPath } from '../../data-privacy'

const { t, step, saving, submitError, levels, TEST, draft, chooseLanguage, finish } = useOnboardingPage()
</script>

<template>
  <main class="y-onboard">
    <div class="y-onboard-in">
      <header>
        <b class="y-brand"><i aria-hidden="true"><Face :mood="saving ? 'happy' : 'calm'" /></i>{{ t('product.name') }}</b>
        <span class="y-steps" :aria-label="`${step} / 3`"><i v-for="n in 3" :key="n" :class="{ on: n <= step }"></i></span>
      </header>

      <Transition name="y-view" mode="out-in">
        <section :key="step" class="y-leaf">
          <h1 v-if="step === 1">{{ t('onboarding.interfaceTitle') }}</h1>
          <h1 v-else-if="step === 2">{{ t('onboarding.targetTitle') }}</h1>
          <h1 v-else>{{ t('onboarding.levelTitle') }}</h1>

          <div v-if="step === 1" class="y-picks">
            <button v-for="code in UI_LOCALES" :key="code" type="button" :aria-pressed="draft.uiLocale === code" @click="draft.uiLocale = code">
              <small>{{ LOCALE_META[code].shortCode }}</small><b>{{ LOCALE_META[code].nativeName }}</b><Icon v-if="draft.uiLocale === code" name="check" :size="14" :weight="2.4" />
            </button>
          </div>
          <div v-else-if="step === 2" class="y-picks">
            <button v-for="item in TARGET_LANGUAGES" :key="item.code" type="button" :aria-pressed="draft.code === item.code" @click="chooseLanguage(item.code, item.name)">
              <small>{{ item.code.toUpperCase() }}</small><b>{{ displayTargetLanguage(item.code, draft.uiLocale) }}</b><Icon v-if="draft.code === item.code" name="check" :size="14" :weight="2.4" />
            </button>
          </div>
          <div v-else class="y-picks one">
            <button type="button" class="y-pick-test" :aria-pressed="draft.level === TEST" @click="draft.level = TEST">
              <small><Icon name="sliders" :size="14" :weight="2" /></small><b>{{ t('level.test') }}<em>{{ t('onboarding.levelTestNote') }}</em></b><Icon v-if="draft.level === TEST" name="check" :size="14" :weight="2.4" />
            </button>
            <button v-for="level in levels" :key="level.id" type="button" :aria-pressed="draft.level === level.id" @click="draft.level = level.id">
              <small>{{ level.id }}</small><b>{{ t(level.key) }}</b><Icon v-if="draft.level === level.id" name="check" :size="14" :weight="2.4" />
            </button>
          </div>
        </section>
      </Transition>

      <footer>
        <p v-if="submitError" class="y-error" role="alert">{{ submitError }}</p>
        <div class="y-onboard-nav">
          <button v-if="step > 1" type="button" class="y-btn" :disabled="saving" @click="step--">{{ t('common.back') }}</button>
          <button type="button" class="y-btn primary go push" :disabled="saving" @click="step < 3 ? step++ : finish()">{{ saving ? t('onboarding.saving') : step < 3 ? t('common.continue') : draft.level === TEST ? t('level.test') : t('onboarding.openWorkspace') }}<Icon v-if="!saving" name="arrow" :size="14" :weight="2.2" /></button>
        </div>
        <p class="y-private"><Icon name="lock" :size="12" :weight="2" />{{ t('onboarding.privacy') }}</p>
        <p v-for="item in shellWelcome" :key="item.to" class="y-private">
          <a v-if="item.href" :href="item.href(draft.uiLocale)" class="welcome-link">{{ t(item.label) }}</a>
          <RouterLink v-else :to="item.to" class="welcome-link">{{ t(item.label) }}</RouterLink>
        </p>
        <p v-if="betaPath" class="y-private"><a :href="betaLink(draft.uiLocale)" class="welcome-link">{{ betaLabelsFor(draft.uiLocale)[0] }}</a></p>
      </footer>
    </div>
  </main>
</template>
