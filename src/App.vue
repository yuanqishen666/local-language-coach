<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from './stores/app'
import AppIcon from './components/AppIcon.vue'
import { displayTargetLanguage, localeMeta, normalizeUiLocale } from '../shared/locales'

const store = useAppStore()
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const bare = computed(() => route.meta.bare)
const focus = computed(() => route.meta.focus)
const selectedProviderName = computed(() => {
  const id = store.settings?.llm.defaultProvider
  return store.settings?.providers.find((provider) => provider.id === id)?.name || ''
})

function applyDocumentLocale(value: unknown) {
  const next = normalizeUiLocale(value)
  const meta = localeMeta(next)
  document.documentElement.lang = meta.htmlLang
  document.documentElement.dataset.locale = next
}

onMounted(async () => {
  await store.load()
  if (store.settings) {
    locale.value = store.settings.ui.locale
    applyDocumentLocale(store.settings.ui.locale)
  }
  if (!store.settings?.setupComplete && route.path !== '/onboarding') router.replace('/onboarding')
})

watch(() => store.settings?.ui.locale, (value) => {
  if (!value) return
  locale.value = value
  applyDocumentLocale(value)
})

const nav = [
  ['/', 'compass', 'nav.home'], ['/history', 'history', 'nav.history'], ['/words', 'bookmark', 'nav.words'],
  ['/review', 'repeat', 'nav.review'], ['/memories', 'memory', 'nav.memories'], ['/settings', 'settings', 'nav.settings'],
]
</script>

<template>
  <div v-if="store.loading" class="app-loading"><div class="brand-mark">言</div><span>{{ t('common.loading') }}</span></div>
  <RouterView v-else-if="bare" />
  <div v-else class="app-frame" :class="{ 'focus-mode': focus }">
    <aside class="sidebar">
      <RouterLink to="/" class="brand"><span class="brand-mark">言</span><b>{{ t('product.name') }}</b></RouterLink>
      <nav>
        <RouterLink v-for="item in nav" :key="item[0]" :to="item[0]" :class="{ active: item[0] === '/' ? route.path === '/' : route.path.startsWith(item[0]) }">
          <AppIcon :name="item[1]" :size="19" /><span>{{ t(item[2]) }}</span>
        </RouterLink>
      </nav>
      <div class="sidebar-foot" v-if="store.settings">
        <div class="language-chip"><span>{{ store.settings.learning.targetLanguageCode.toUpperCase() }}</span><div><b>{{ displayTargetLanguage(store.settings.learning.targetLanguageCode, store.settings.ui.locale) }}</b><small>{{ store.settings.learning.proficiency }}<template v-if="selectedProviderName"> · {{ selectedProviderName }}</template></small></div></div>
      </div>
    </aside>
    <main class="main-area"><RouterView /></main>
  </div>
  <Transition name="toast"><div v-if="store.toast" class="toast">{{ store.toast }}</div></Transition>
</template>
