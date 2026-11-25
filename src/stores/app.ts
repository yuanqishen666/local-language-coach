import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { api } from '../api'
import { copyText } from '../i18n/copy'
import type { Settings } from '../types'
import { chooseSpeechLocale } from '../speech'
import { speechVariant } from '../../shared/variants'
import type { UiLocale } from '../../shared/locales'

export const useAppStore = defineStore('app', () => {
  const settings = ref<Settings | null>(null)
  const loading = ref(true)
  const interfaceLanguage = ref<UiLocale>()
  const toast = ref('')

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

  function notify(message: string) {
    toast.value = message
    window.setTimeout(() => { if (toast.value === message) toast.value = '' }, 2600)
  }

  return { settings, loading, interfaceLanguage, toast, receive, load, save, notify }
})
