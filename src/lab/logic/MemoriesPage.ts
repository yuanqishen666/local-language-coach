// Generated from src/pages/MemoriesPage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, ApiError } from '../../api'
import { hasMeaningfulTextChange } from '../../form-state'
import { useAppStore } from '../../stores/app'
import type { LearningLanguageStatus, MemorySuggestion } from '../../types'

export function useMemoriesPage() {
const { t, locale } = useI18n()
const memories = ref<any[]>([])
// What only the learner can settle: memories that came out of scenes, and what tidying up proposed.
const suggestions = ref<MemorySuggestion[]>([])
// Built from corrections, one record per learning language. Nothing in it is asked about.
const learning = ref<LearningLanguageStatus[]>([])
const editing = ref('')
const value = ref('')
const initialValue = ref('')
const error = ref('')
const memoryDirty = computed(() =>
  hasMeaningfulTextChange(value.value, initialValue.value),
)

async function load() {
  const requestedLocale = String(locale.value)
  error.value = ''
  void loadReview()
  const loaded = await api.get<any[]>('/memories')
  if (requestedLocale !== String(locale.value)) return
  if (!loaded.some((item) => item.interfaceLocale !== requestedLocale)) {
    memories.value = loaded.filter((item) => item.interfaceLocale === requestedLocale)
    return
  }
  try {
    const localized = await api.post<any[]>('/memories/localize', { interfaceLocale: requestedLocale })
    if (requestedLocale === String(locale.value)) {
      memories.value = localized.filter((item) => item.interfaceLocale === requestedLocale)
    }
  } catch {
    if (requestedLocale === String(locale.value)) {
      memories.value = loaded
      error.value = t('memories.updateError')
    }
  }
}
async function loadReview() {
  try {
    const [pending, status] = await Promise.all([
      api.get<MemorySuggestion[]>('/memory-suggestions'),
      api.get<{ languages: LearningLanguageStatus[] }>('/learning-status'),
    ])
    suggestions.value = pending
    learning.value = status.languages
  } catch {
    // The memories themselves still load and can be managed.
  }
}
onMounted(load)
watch(locale, () => {
  cancelEdit()
  memories.value = []
  void load()
})

// Core is a mark on a memory, not a place: every memory sits in the layer its kind belongs to.
const groups = computed(() => ({
  about: memories.value.filter((memory) => memory.category === 'about'),
  plan: memories.value.filter((memory) => memory.category === 'plan'),
  learning: memories.value.filter((memory) => memory.category === 'learning'),
}))
const coreCount = computed(() => memories.value.filter((memory) => memory.tier === 'core').length)

function edit(item: any) {
  editing.value = item.id
  value.value = item.value
  initialValue.value = item.value
}
function cancelEdit() {
  editing.value = ''
  value.value = ''
  initialValue.value = ''
}
async function save(item: any) {
  if (!memoryDirty.value) return
  await api.put(`/memories/${item.id}`, { value: value.value.trim(), interfaceLocale: String(locale.value) })
  cancelEdit()
  await load()
}
async function remove(id: string) {
  await api.delete(`/memories/${id}`)
  await load()
}
async function toggleTier(item: any) {
  error.value = ''
  try {
    await api.patch(`/memories/${item.id}/tier`, { tier: item.tier === 'core' ? 'long_term' : 'core' })
    await load()
  } catch (value) {
    error.value = value instanceof ApiError && value.code === 'CORE_MEMORY_LIMIT'
      ? t('memories.coreLimit')
      : t('memories.updateError')
  }
}
/** Keeps a memory that has run out, or is about to, for a while longer. */
async function renew(item: any) {
  await api.post(`/memories/${item.id}/renew`, {})
  await load()
}
async function resolveSuggestion(item: MemorySuggestion, action: 'accept' | 'dismiss' | 'toConversation' | 'delete') {
  error.value = ''
  try {
    await api.post(`/memory-suggestions/${item.id}/resolve`, { action, interfaceLocale: String(locale.value) })
  } catch {
    error.value = t('memories.updateError')
  }
  await load()
}
async function forgetMistakes(language: string, category: string) {
  await api.delete(`/learning-status/${encodeURIComponent(language)}/errors/${encodeURIComponent(category)}`)
  await loadReview()
}
async function forgetLearningRecord(id: string) {
  await api.delete(`/learning-events/${encodeURIComponent(id)}`)
  await loadReview()
}
async function exportMemories() {
  const data = await api.get<unknown>('/memories/export')
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `yujian-memories-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
/** Brings in memories from a file this app exported, here or on another computer. What is already known is not added twice. */
const importing = ref(false)
async function importMemories(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || importing.value) return
  const store = useAppStore()
  importing.value = true
  try {
    const result = await api.post<{ added: number; updated: number; skipped: number }>('/memories/import', JSON.parse(await file.text()))
    store.notify(t('memories.imported', { added: result.added, updated: result.updated }))
    await load()
  } catch {
    store.notify(t('memories.importFailed'))
  } finally {
    importing.value = false
  }
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(String(locale.value), {
    dateStyle: 'medium',
  }).format(new Date(value))
}

  return { t, locale, memories, suggestions, learning, editing, value, initialValue, error, memoryDirty, load, loadReview, groups, coreCount, edit, cancelEdit, save, remove, toggleTier, renew, resolveSuggestion, forgetMistakes, forgetLearningRecord, exportMemories, importing, importMemories, formatDate }
}
