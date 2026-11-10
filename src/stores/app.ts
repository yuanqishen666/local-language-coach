import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api'
import { copyText } from '../i18n/copy'
import type { Settings } from '../types'

export const useAppStore = defineStore('app', () => {
  const settings = ref<Settings | null>(null)
  const loading = ref(true)
  const toast = ref('')

  async function load() {
    loading.value = true
    try { settings.value = await api.get<Settings>('/settings') }
    finally { loading.value = false }
  }

  async function save(next: Settings) {
    settings.value = await api.put<Settings>('/settings', next)
    notify(copyText('common.settingsSaved', settings.value.ui.locale))
  }

  function notify(message: string) {
    toast.value = message
    window.setTimeout(() => { if (toast.value === message) toast.value = '' }, 2600)
  }

  return { settings, loading, toast, load, save, notify }
})
