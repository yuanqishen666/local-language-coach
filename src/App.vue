<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from './stores/app'
import { api } from './api'
import AppIcon from './components/AppIcon.vue'
import { displayTargetLanguage, localeMeta, normalizeUiLocale } from '../shared/locales'

const store = useAppStore()
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const bare = computed(() => route.meta.bare)
const focus = computed(() => route.meta.focus)
const reviewDue = ref(0)
const mobileMoreOpen = ref(false)

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
  await refreshReviewDue()
})

async function refreshReviewDue() {
  try { reviewDue.value = (await api.get<unknown[]>('/reviews/due')).length }
  catch { reviewDue.value = 0 }
}

watch(() => store.settings?.ui.locale, (value) => {
  if (!value) return
  locale.value = value
  applyDocumentLocale(value)
})

watch(() => route.path, async () => {
  mobileMoreOpen.value = false
  await refreshReviewDue()
})

const startNav = [['/', 'compass', 'nav.home']]
const learningNav = [
  ['/history', 'history', 'nav.history'],
  ['/words', 'bookmark', 'nav.words'],
  ['/review', 'repeat', 'nav.review'],
]
const memoryNav = [['/memories', 'memory', 'nav.memories']]
const mobilePrimaryNav = [
  ['/', 'compass', 'nav.home'],
  ['/history', 'history', 'nav.history'],
  ['/words', 'bookmark', 'nav.words'],
]
const mobileMoreNav = [
  ['/review', 'repeat', 'nav.review'],
  ['/memories', 'memory', 'nav.memories'],
  ['/settings', 'settings', 'nav.settings'],
]

function navActive(path: string) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}
</script>

<template>
  <div v-if="store.loading" class="app-loading"><div class="brand-mark">见</div><span>{{ t('common.loading') }}</span></div>
  <RouterView v-else-if="bare" />
  <div v-else class="app-frame" :class="{ 'focus-mode': focus }">
    <aside class="sidebar">
      <RouterLink to="/" class="brand"><span class="brand-mark">见</span><b>{{ t('product.name') }}</b></RouterLink>
      <nav class="desktop-navigation">
        <RouterLink v-for="item in startNav" :key="item[0]" :to="item[0]" :class="{ active: navActive(item[0]) }">
          <AppIcon :name="item[1]" :size="18" /><span>{{ t(item[2]) }}</span>
        </RouterLink>
        <i class="nav-space"></i>
        <RouterLink v-for="item in learningNav" :key="item[0]" :to="item[0]" :class="{ active: navActive(item[0]) }">
          <AppIcon :name="item[1]" :size="18" /><span>{{ t(item[2]) }}</span><em v-if="item[0] === '/review' && reviewDue">{{ reviewDue }}</em>
        </RouterLink>
        <i class="nav-space small"></i>
        <RouterLink v-for="item in memoryNav" :key="item[0]" :to="item[0]" :class="{ active: navActive(item[0]) }">
          <AppIcon :name="item[1]" :size="18" /><span>{{ t(item[2]) }}</span>
        </RouterLink>
      </nav>
      <div class="sidebar-foot" v-if="store.settings">
        <RouterLink to="/settings" class="settings-link" :class="{ active: navActive('/settings') }"><AppIcon name="settings" :size="18" /><span>{{ t('nav.settings') }}</span></RouterLink>
        <RouterLink to="/settings" class="language-chip"><span>{{ store.settings.learning.targetLanguageCode.toUpperCase() }}</span><b>{{ displayTargetLanguage(store.settings.learning.targetLanguageCode, store.settings.ui.locale) }} · {{ store.settings.learning.proficiency }}</b><i>›</i></RouterLink>
      </div>

      <nav class="mobile-navigation">
        <RouterLink v-for="item in mobilePrimaryNav" :key="item[0]" :to="item[0]" :class="{ active: navActive(item[0]) }">
          <AppIcon :name="item[1]" :size="18" /><span>{{ t(item[2]) }}</span>
        </RouterLink>
        <button :class="{ active: mobileMoreOpen || mobileMoreNav.some(item => navActive(item[0])) }" @click="mobileMoreOpen = !mobileMoreOpen"><AppIcon name="more" :size="18" /><span>{{ t('nav.more') }}</span></button>
      </nav>
      <Transition name="mobile-menu"><div v-if="mobileMoreOpen" class="mobile-more-menu">
        <RouterLink v-for="item in mobileMoreNav" :key="item[0]" :to="item[0]"><span>{{ t(item[2]) }}</span><em v-if="item[0] === '/review' && reviewDue">{{ reviewDue }}</em></RouterLink>
      </div></Transition>
    </aside>
    <main class="main-area"><RouterView /></main>
  </div>
  <Transition name="toast"><div v-if="store.toast" class="toast">{{ store.toast }}</div></Transition>
</template>
