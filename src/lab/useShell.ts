import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '../api'
import { useAppStore } from '../stores/app'
import { displayTargetLanguage } from '../../shared/locales'
import { stepParts } from '../../shared/proficiency'
import { levelOverview, loadLevel } from '../level'
import { checkLimit, overLimit } from '../usage'

// The reminder that this month's spending reached the amount the learner set is said once.
let limitTold = false

export const shellNav = [
  { to: '/', icon: 'talk', label: 'nav.home' },
  { to: '/history', icon: 'history', label: 'nav.history' },
  { to: '/words', icon: 'bookmark', label: 'nav.words' },
  { to: '/review', icon: 'repeat', label: 'nav.review' },
  { to: '/memories', icon: 'notebook', label: 'nav.memories' },
  { to: '/progress', icon: 'chart', label: 'nav.progress' },
  { to: '/settings', icon: 'sliders', label: 'nav.settings' },
] as const

/** The same destinations, split the way people look for them: what you do on top, set-up at the bottom. */
export const shellMain = shellNav.filter((item) => item.to !== '/settings')
export const shellFoot = shellNav.filter((item) => item.to === '/settings')

/** What every preview shell needs from App.vue: where we are, what is due, which language. */
export function useShell() {
  const store = useAppStore()
  const route = useRoute()
  const { t, locale } = useI18n()
  const reviewDue = ref(0)

  const theme = computed(() => String(route.meta.lab || 'paper'))
  const inner = computed(() => route.path.replace(/^\/lab\/[^/]+/u, '') || '/')
  const focus = computed(() => Boolean(route.meta.labFocus))
  const plain = computed(() => Boolean(route.meta.labPlain))
  const languageCode = computed(() => store.settings?.learning.targetLanguageCode || 'en')
  const language = computed(() => displayTargetLanguage(languageCode.value, locale.value))
  // The level of the language in use, from its profile. A language nobody has placed yet shows none.
  const level = computed(() => {
    const overview = levelOverview(languageCode.value)
    if (!overview) return store.settings?.learning.proficiency || ''
    return overview.profile ? stepParts(overview.profile.step).level : ''
  })

  function refreshLevel() {
    if (store.settings?.setupComplete) void loadLevel(languageCode.value).catch(() => undefined)
  }

  async function refreshReviewDue() {
    try { reviewDue.value = (await api.get<unknown[]>('/reviews/due')).length }
    catch { reviewDue.value = 0 }
  }
  async function refreshSpending() {
    if (!store.settings?.setupComplete) return
    if (!(await checkLimit()) || limitTold) return
    limitTold = true
    store.notify(t('usage.reached'))
  }
  onMounted(() => { void refreshReviewDue(); refreshLevel(); void refreshSpending() })
  watch(() => route.path, () => { void refreshReviewDue(); refreshLevel(); void refreshSpending() })
  watch(languageCode, refreshLevel)

  function navActive(path: string) {
    return path === '/' ? inner.value === '/' : inner.value.startsWith(path)
  }

  /** Setting up or being in a conversation still belongs to the first destination. */
  function navOn(path: string) {
    return path === '/' ? inner.value === '/' || inner.value === '/start' || inner.value.startsWith('/start/') || inner.value.startsWith('/conversation/') : inner.value.startsWith(path)
  }

  return { store, route, t, locale, theme, inner, focus, plain, reviewDue, languageCode, language, level, navActive, navOn, overLimit }
}
