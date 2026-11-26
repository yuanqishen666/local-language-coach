<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api } from '../api'
import { modelErrorKey } from '../provider-error-copy'
import { guideToModelSettings, needsModelConfiguration } from '../model-access'
import { stepName } from '../level'
import { IMPORT_MIN_LENGTH, type ImportedContent, type ImportedContentSummary } from '../../shared/wordbook'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const contentId = computed(() => String(route.params.id || ''))
const content = ref<ImportedContent | null>(null)
const items = ref<ImportedContentSummary[]>([])
const draft = ref('')
// 'list' is the page with nothing open: the box to paste into, and what was read before.
const state = ref<'loading' | 'list' | 'reading' | 'ready' | 'missing'>('loading')
const error = ref('')
// Which question is opening a conversation, which word is being kept, which link is being read again.
const starting = ref(-1)
const saving = ref('')
const rereading = ref('')
const levelName = computed(() => (content.value ? stepName(content.value.step) : ''))
let version = 0
let rereadVersion = 0

function failureText(value: unknown) {
  const code = value instanceof ApiError ? value.code : ''
  if (code === 'IMPORT_TOO_SHORT') return t('import.tooShort', { count: IMPORT_MIN_LENGTH })
  if (code === 'IMPORT_URL_INVALID') return t('import.urlInvalid')
  if (code === 'IMPORT_READ_FAILED') return t('import.readFailed')
  if (code === 'IMPORT_NOT_FOUND') return t('import.notFound')
  return t(modelErrorKey(value) || 'import.failed')
}

async function open() {
  const current = ++version
  error.value = ''
  if (!contentId.value) {
    content.value = null
    state.value = 'loading'
    try { items.value = (await api.get<{ items: ImportedContentSummary[] }>('/imports')).items }
    catch { items.value = [] }
    if (current === version) state.value = 'list'
    return
  }
  if (content.value?.id === contentId.value) { state.value = 'ready'; return }
  state.value = 'loading'
  try {
    const found = await api.get<{ content: ImportedContent }>(`/imports/${encodeURIComponent(contentId.value)}?interfaceLocale=${encodeURIComponent(String(locale.value))}`)
    if (current !== version) return
    content.value = found.content
    state.value = 'ready'
  } catch (value) {
    if (current !== version) return
    content.value = null
    state.value = 'missing'
    error.value = value instanceof ApiError && value.code === 'IMPORT_NOT_FOUND' ? t('import.notFound') : t('common.operationFailed')
  }
}

/** Pasted text, or an address to read, is retold at the learner's level with questions to talk about. */
async function read() {
  const text = draft.value.trim()
  if (!text || state.value !== 'list') return
  const current = ++version
  state.value = 'reading'
  error.value = ''
  try {
    const result = await api.post<{ content: ImportedContent }>('/imports', { text, interfaceLocale: String(locale.value) })
    if (current !== version) {
      void api.delete(`/imports/${encodeURIComponent(result.content.id)}`).catch(() => undefined)
      return
    }
    content.value = result.content
    draft.value = ''
    state.value = 'ready'
    await router.push(`/start/import/${encodeURIComponent(result.content.id)}`)
  } catch (value) {
    if (current !== version) return
    state.value = 'list'
    if (needsModelConfiguration(value)) { await guideToModelSettings(router, route.fullPath); return }
    error.value = failureText(value)
  }
}

function cancelRead() {
  if (state.value !== 'reading') return
  version += 1
  state.value = 'list'
  error.value = ''
}

/** Reads a saved address again, for a page whose content changes. */
async function reread(id: string) {
  if (rereading.value) return
  const current = ++rereadVersion
  rereading.value = id
  error.value = ''
  try {
    const result = await api.post<{ content: ImportedContent }>(`/imports/${encodeURIComponent(id)}/refresh`, { interfaceLocale: String(locale.value) })
    if (current !== rereadVersion) {
      void api.delete(`/imports/${encodeURIComponent(result.content.id)}`).catch(() => undefined)
      return
    }
    content.value = result.content
    await router.push(`/start/import/${encodeURIComponent(result.content.id)}`)
  } catch (value) {
    if (current !== rereadVersion) return
    if (needsModelConfiguration(value)) { await guideToModelSettings(router, route.fullPath); return }
    error.value = failureText(value)
  } finally {
    if (current === rereadVersion) rereading.value = ''
  }
}

function cancelReread() {
  if (!rereading.value) return
  rereadVersion += 1
  rereading.value = ''
  error.value = ''
}

async function remove(id: string) {
  error.value = ''
  try {
    await api.delete(`/imports/${encodeURIComponent(id)}`)
    items.value = items.value.filter((item) => item.id !== id)
    if (contentId.value === id) await router.push('/start/import')
  } catch {
    error.value = t('common.operationFailed')
  }
}

/** Starts the conversation with the question the learner picked. */
async function talk(question: number) {
  if (!content.value || starting.value >= 0) return
  starting.value = question
  error.value = ''
  try {
    const created = await api.post<{ id: string }>(`/imports/${encodeURIComponent(content.value.id)}/talk`, { question, interfaceLocale: String(locale.value) })
    await router.push(`/conversation/${created.id}`)
  } catch (value) {
    if (needsModelConfiguration(value)) { await guideToModelSettings(router, route.fullPath); return }
    error.value = value instanceof ApiError && value.code === 'IMPORT_NOT_FOUND' ? t('import.notFound') : t('common.operationFailed')
  } finally { starting.value = -1 }
}

async function keepWord(term: string) {
  if (!content.value || saving.value) return
  saving.value = term
  error.value = ''
  try {
    const saved = await api.post<{ wordId: string }>(`/imports/${encodeURIComponent(content.value.id)}/words`, { term })
    const word = content.value?.words.find((item) => item.term === term)
    if (word) word.wordId = saved.wordId
  } catch {
    error.value = t('common.operationFailed')
  } finally { saving.value = '' }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(String(locale.value), { dateStyle: 'medium' }).format(new Date(value))
}

/** The site an address belongs to, as people say it. */
function siteOf(url: string | null) {
  try { return url ? new URL(url).host.replace(/^www\./u, '') : '' }
  catch { return '' }
}

onMounted(open)
onUnmounted(() => {
  version += 1
  rereadVersion += 1
})
watch(contentId, () => { void open() })
watch(locale, () => { content.value = null; void open() })
</script>

<template>
  <main>{{ t('import.title') }}</main>
</template>
