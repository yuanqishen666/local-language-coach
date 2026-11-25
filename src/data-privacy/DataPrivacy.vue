<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { normalizeUiLocale } from '../../shared/locales'
import { runsForOneself } from '../install'
import { betaLabelsFor, betaPath } from './index'
import { privacyCopy } from './copy'

const { t, locale } = useI18n()
const words = computed(() => privacyCopy[normalizeUiLocale(locale.value)])
const beta = !runsForOneself()
const model = ref('')

onMounted(async () => {
  const endpoint = beta ? 'api/pro/model' : betaPath && `${betaPath}api/pro/model`
  if (!endpoint) return
  const response = await fetch(endpoint, { credentials: 'omit' }).catch(() => null)
  if (!response?.ok) return
  const info = await response.json().catch(() => null)
  if (typeof info?.name === 'string') model.value = info.name
})
</script>

<template>
  <article class="y-page narrow privacy" data-qs-id="qs-data-privacy">
    <header class="y-head"><h1 data-content-source-exempt="requested-data-and-privacy-title">{{ t('settings.dataTitle') }}</h1></header>
    <section>
      <h2 data-content-source-exempt="open-web-edition">{{ words.openTitle }}</h2>
      <p v-for="(paragraph, index) in words.open" :key="index" data-content-source-exempt="open-web-storage-model-and-backup-behavior">{{ paragraph }}</p>
    </section>
    <section v-if="beta || betaPath">
      <h2 data-content-source-exempt="requested-beta-edition-name">{{ betaLabelsFor(locale)[0] }}</h2>
      <p data-content-source-exempt="beta-account-storage-and-usage">{{ words.beta[0] }}</p>
      <p data-content-source-exempt="deployed-beta-model-and-speech-behavior">{{ model ? words.model.replace('{model}', () => model) + ' ' : '' }}{{ words.beta[1] }}</p>
      <p data-content-source-exempt="beta-account-export-and-deletion">{{ words.beta[2] }}</p>
    </section>
  </article>
</template>

<style scoped>
.privacy { display: grid; align-content: start; gap: 16px; }
.privacy .y-head { margin-bottom: 0; }
.privacy .y-head h1 { white-space: normal; }
.privacy section { display: grid; gap: 12px; padding: clamp(18px, 4vw, 28px); border-radius: 24px; background: var(--y-bg); }
.privacy h2 { font-size: 1.25rem; font-weight: 800; line-height: 1.3; }
.privacy p { max-width: 68ch; font-size: .9375rem; line-height: 1.7; overflow-wrap: anywhere; }
</style>
