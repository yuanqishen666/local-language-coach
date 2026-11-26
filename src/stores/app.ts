import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { api } from '../api'
import { copyText } from '../i18n/copy'
import type { Settings } from '../types'
import { chooseSpeechLocale } from '../speech'
import { speechVariant } from '../../shared/variants'
import type { UiLocale } from '../../shared/locales'

interface ToastOptions {
  actionLabel?: string
  duration?: number
  onAction?: () => void
  onExpire?: () => void
}

export const useAppStore = defineStore('app', () => {
  const settings = ref<Settings | null>(null)
  const loading = ref(true)
  const interfaceLanguage = ref<UiLocale>()
  const toast = ref('')
  const toastAction = ref('')
  let toastActionRun: (() => void) | undefined
  let toastExpireRun: (() => void) | undefined
  let toastTimer = 0
  let toastVersion = 0

  // Speech is read and recognised in the variety of the language the learner chose.
  watch(settings, (value) => {
    if (!value) return
    const code = value.learning.targetLanguageCode
    chooseSpeechLocale(code, speechVariant(code, value.learning.variant))
  })

  async function load() {
    loading.value = true
    try { receive(await api.get<Settings>('/settings')) }
    finally { loading.value = false }
  }

  function receive(next: Settings, locale?: UiLocale) {
    if (locale || settings.value?.ui.locale !== next.ui.locale) interfaceLanguage.value = locale ?? next.ui.locale
    settings.value = next
    loading.value = false
  }

  async function save(next: Settings, chooseInterface = false) {
    const saved = await api.put<Settings>('/settings', next)
    receive(saved, chooseInterface ? saved.ui.locale : undefined)
    notify(copyText('common.settingsSaved', interfaceLanguage.value ?? saved.ui.locale))
  }

  function clearToast(expire = false) {
    window.clearTimeout(toastTimer)
    toastVersion += 1
    const onExpire = toastExpireRun
    toast.value = ''
    toastAction.value = ''
    toastActionRun = undefined
    toastExpireRun = undefined
    if (expire) onExpire?.()
  }

  function notify(message: string, options: ToastOptions = {}) {
    clearToast(true)
    const version = toastVersion
    toast.value = message
    toastAction.value = options.actionLabel || ''
    toastActionRun = options.onAction
    toastExpireRun = options.onExpire
    toastTimer = window.setTimeout(() => {
      if (toastVersion !== version || toast.value !== message) return
      clearToast(true)
    }, options.duration ?? (options.actionLabel ? 6000 : 2600))
  }

  function runToastAction() {
    const run = toastActionRun
    clearToast(false)
    run?.()
  }

  return { settings, loading, interfaceLanguage, toast, toastAction, receive, load, save, notify, clearToast, runToastAction }
})
