import { createApp } from 'vue'
import { createPinia } from 'pinia'
import type { Router } from 'vue-router'
import '@fontsource-variable/manrope'
import '@fontsource-variable/noto-sans-sc'
import './styles/base.css'
import './styles/mobile-fixes.css'
import App from './App.vue'
import { createAppRouter } from './router'
import { i18n } from './i18n'
import { shellWelcome } from './lab/useShell'
import { useAppStore } from './stores/app'
import type { Settings } from './types'
import type { UiLocale } from '../shared/locales'

/**
 * Starts the app in the page. Whatever was added beforehand is part of it: pages and routes
 * (./lab/routes), destinations in the navigation (./lab/useShell). A router made with
 * createAppRouter can be given guards first and passed in.
 */
export function startApp(router: Router = createAppRouter()) {
  return createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')
}

/** Resolves settings, language and the first route before rendering a hosted page. */
export async function startHostedApp(options: {
  settings: Settings
  locale: UiLocale
  router?: Router
  onInterfaceChange?: (locale: UiLocale) => void
}) {
  const router = options.router ?? createAppRouter()
  const pinia = createPinia()
  const app = createApp(App, { prepared: true, onInterfaceChange: options.onInterfaceChange }).use(pinia).use(i18n)
  const store = useAppStore(pinia)
  store.receive(options.settings, options.locale)
  i18n.global.locale.value = options.locale
  router.beforeEach((to) => {
    if (store.settings?.setupComplete && to.meta.onboarding && to.matched.at(-1)?.aliasOf) return { path: '/', replace: true }
    if (store.settings?.setupComplete || to.meta.onboarding || shellWelcome.some((item) => item.to === to.path)) return true
    return {
      path: '/onboarding', replace: true,
      query: { ...(to.path === '/' ? {} : { returnTo: to.fullPath }), ...(typeof to.query.lang === 'string' ? { lang: to.query.lang } : {}) },
    }
  })
  app.use(router)
  await router.isReady()
  return app.mount('#app')
}
