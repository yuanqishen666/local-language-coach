import { watch } from 'vue'
import { api, sendRequestsWith } from '../src/api'
import { i18n } from '../src/i18n'
import { registerDataPrivacy } from '../src/data-privacy'
import { servedWithoutOwnFolder } from '../src/install'
import { addPage } from '../src/lab/routes'
import { addNavItem } from '../src/lab/useShell'
import { createAppRouter } from '../src/router'
import { startHostedApp } from '../src/start'
import type { Settings } from '../src/types'
import { localeSlug, UI_LOCALES, type UiLocale } from '../shared/locales'
import { backedUpAt } from './last-backup'
import { ask } from './thread'
import { watchForNewVersion } from './update'
import { webMessages, webWord } from './words'

const DAY_MS = 24 * 60 * 60 * 1000
const dayOf = (at: Date) => new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()

/** The backup page, and in the navigation how long ago the last backup was, since nothing else keeps a copy of what this browser holds. */
function registerBackup() {
  addPage({ path: 'backup', component: () => import('./Backup.vue') })
  addNavItem({ to: '/backup', icon: 'archive', label: 'web.backup.navNow' }, 'foot')
  // Someone moving to this browser has a backup to restore and nothing to set up.
  addPage({ path: 'restore', component: () => import('./Backup.vue'), plain: true })
  addNavItem({ to: '/restore', icon: 'restore', label: 'web.backup.restoreTitle' }, 'welcome')
}

function watchBackup(router: ReturnType<typeof createAppRouter>) {
  // The page moved to is among what is watched, so that a page left open overnight does not go on saying "today".
  watch(() => [i18n.global.locale.value, backedUpAt.value, router.currentRoute.value.fullPath] as const, ([locale, at]) => {
    const days = at ? Math.round((dayOf(new Date()) - dayOf(at)) / DAY_MS) : 0
    const navNow = at
      ? `${webWord('nav', locale)} · ${new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day')}`
      : webWord('navNever', locale)
    i18n.global.mergeLocaleMessage(locale, { web: { backup: { navNow } } })
  }, { immediate: true })
}

servedWithoutOwnFolder()
registerDataPrivacy(import.meta.env.BASE_URL)
registerBackup()

const languages = UI_LOCALES.map(localeSlug)
for (const { locale, messages } of webMessages()) i18n.global.mergeLocaleMessage(locale, messages)

sendRequestsWith(async (method, path, body) => {
  const answer = await ask({ method, path: `/api${path}`, body })
  return { status: answer.status, body: JSON.parse(answer.body || '{}') }
})

export function storedSettings() {
  return api.get<Settings>('/settings')
}

export async function mountWebApp(settings: Settings, locale: UiLocale, onInterfaceChange: (value: UiLocale) => void) {
  const router = createAppRouter({ paths: languages, onboarding: !settings.setupComplete })
  watchBackup(router)
  await startHostedApp({ settings, locale, router, onInterfaceChange })
  watchForNewVersion()
  void navigator.storage?.persist?.().catch(() => undefined)
}
