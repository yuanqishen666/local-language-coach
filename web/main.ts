import { browserUiLocale, DEFAULT_WEB_LOCALE, explicitUiLocale, type UiLocale } from '../shared/locales'
import { openEditionUrl } from '../shared/edition-links'
import { publicWords } from './public-copy'
import { startupWords } from './startup-words'
import type { Opened } from './storage'
import { startThread, stopThread, ThreadError } from './thread'

const BASE = import.meta.env.BASE_URL
const LANGUAGE_KEY = 'yujian.web.language'
const ENTRY_LANGUAGE_KEY = 'yujian.web.entry-language'
const root = document.querySelector<HTMLElement>('#app')!

function readLocale(storage: 'localStorage' | 'sessionStorage', key: string) {
  try { return explicitUiLocale(window[storage].getItem(key)) }
  catch { return undefined }
}

function keepLocale(storage: 'localStorage' | 'sessionStorage', key: string, locale: UiLocale | undefined) {
  try {
    if (locale) window[storage].setItem(key, locale)
    else window[storage].removeItem(key)
  } catch { /* Storage preferences are optional. */ }
}

const relative = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length).replace(/\/$/u, '') : ''
const tagged = explicitUiLocale(document.documentElement.dataset.entryLocale ?? relative)
const entry = tagged ?? readLocale('sessionStorage', ENTRY_LANGUAGE_KEY)
if (tagged) keepLocale('sessionStorage', ENTRY_LANGUAGE_KEY, tagged)
const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language]
let locale = entry ?? readLocale('localStorage', LANGUAGE_KEY) ?? browserUiLocale(browserLanguages) ?? DEFAULT_WEB_LOCALE

function localizeEntry() {
  const words = publicWords(locale)
  document.documentElement.lang = locale
  document.title = words.brand
  const strings = {
    '[data-entry-status]': words.loading, '[data-entry-privacy]': words.privacy, '[data-entry-reload]': words.reload,
  }
  for (const [selector, label] of Object.entries(strings)) {
    const element = root.querySelector(selector)
    if (element) element.textContent = label
  }
  root.querySelector('[data-entry-privacy]')?.setAttribute('href', openEditionUrl(BASE, locale, 'privacy'))
  root.querySelector('[data-entry-reload]')?.setAttribute('href', location.href)
}

type StartProblem = Omit<Opened, 'state'> & { state: Exclude<Opened['state'], 'ready'> | 'connection' }

function showProblem(problem: StartProblem) {
  const words = startupWords(locale)
  const publicCopy = publicWords(locale)
  const notice = document.createElement('main')
  notice.dataset.public = ''
  notice.setAttribute('role', 'alert')
  const heading = notice.appendChild(document.createElement('h1'))
  heading.textContent = problem.state === 'connection' ? publicCopy.unavailable : words[`${problem.state}Title`]
  notice.appendChild(document.createElement('p')).textContent = problem.state === 'connection' ? publicCopy.retryBody : words[`${problem.state}Body`]
  if (problem.detail) {
    notice.appendChild(document.createElement('pre')).textContent = [problem.version, problem.detail].filter(Boolean).join(' · ')
  }
  const actions = notice.appendChild(document.createElement('div'))
  actions.className = 'public-actions'
  const privacy = actions.appendChild(document.createElement('a'))
  privacy.href = openEditionUrl(BASE, locale, 'privacy')
  privacy.textContent = publicCopy.privacy
  if (import.meta.env.VITE_BETA_URL) {
    const beta = actions.appendChild(document.createElement('a'))
    beta.href = `${import.meta.env.VITE_BETA_URL}?lang=${locale}`
    beta.textContent = publicCopy.beta
  }
  if (problem.state === 'putBack') {
    const download = actions.appendChild(document.createElement('button'))
    download.textContent = publicCopy.download
    download.onclick = async () => {
      download.disabled = true
      try { await (await import('./last-backup')).downloadBackup() }
      catch { download.textContent = words.again }
      finally { download.disabled = false }
    }
  }
  if (problem.state !== 'unsupported') {
    const retry = actions.appendChild(document.createElement('button'))
    retry.textContent = words.again
    retry.onclick = () => { stopThread(); location.reload() }
  }
  root.replaceChildren(notice)
}

async function start() {
  localizeEntry()
  let version: string | undefined
  try {
    const opened = await startThread()
    version = opened.version
    if (opened.state !== 'ready') {
      if (opened.state !== 'putBack') stopThread()
      showProblem({ ...opened, state: opened.state })
      return
    }
    const app = await import('./app')
    const settings = await app.storedSettings()
    if (settings.setupComplete) {
      keepLocale('localStorage', LANGUAGE_KEY, settings.ui.locale)
      if (!entry) locale = settings.ui.locale
    }
    await app.mountWebApp(settings, locale, (next) => {
      keepLocale('localStorage', LANGUAGE_KEY, next)
      keepLocale('sessionStorage', ENTRY_LANGUAGE_KEY, undefined)
    })
  } catch (error) {
    stopThread()
    showProblem({ state: 'connection', version, detail: error instanceof ThreadError ? error.code : 'start-app' })
  }
}

void start()
