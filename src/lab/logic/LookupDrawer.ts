// Generated from src/components/LookupDrawer.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../api'
import { useAppStore } from '../../stores/app'
import type { TermLookup } from '../../types'

export function useLookupDrawer(props: { term: string; sentence: string; conversationId: string; open: boolean; setup?: unknown; targetLanguageCode?: string }) {
const sessionCache = new Map<string, TermLookup>()


const store = useAppStore()
const { t, locale } = useI18n()
const loading = ref(false)
const data = ref<TermLookup | null>(null)
const saved = ref(false)
const error = ref('')
let requestVersion = 0

function normalized(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ')
}

function cacheKey() {
  return JSON.stringify([
    normalized(props.term),
    normalized(props.sentence),
    props.setup || null,
    targetLanguageCode.value,
    String(locale.value).toLowerCase(),
  ])
}

function remember(key: string, value: TermLookup) {
  if (sessionCache.size >= 200) sessionCache.delete(sessionCache.keys().next().value!)
  sessionCache.set(key, value)
}

// The conversation's own learning language when the page passes one; otherwise the current setting.
const targetLanguageCode = computed(() => props.targetLanguageCode || store.settings?.learning.targetLanguageCode || 'en')
const collocations = computed(() => ((data.value?.collocations || []) as unknown[]).map((item) => {
  if (typeof item === 'string') return { phrase: item, meaning: '' }
  if (!item || typeof item !== 'object') return { phrase: '', meaning: '' }
  const value = item as Record<string, unknown>
  return {
    phrase: String(value.phrase || value.collocation || value.text || ''),
    meaning: String(value.meaning || value.definition || value.translation || ''),
  }
}).filter((item) => item.phrase))

watch(
  () => [props.open, props.term, props.sentence, props.setup, targetLanguageCode.value, locale.value],
  async () => {
    const version = ++requestVersion
    if (!props.open || !props.term) {
      loading.value = false
      return
    }
    const key = cacheKey()
    const cached = sessionCache.get(key)
    saved.value = false
    error.value = ''
    if (cached) {
      data.value = cached
      loading.value = false
      return
    }
    loading.value = true
    data.value = null
    try {
      const result = await api.post<{ lookup: TermLookup }>('/lookup', {
        term: props.term,
        sentence: props.sentence,
        setup: props.setup,
        interfaceLocale: String(locale.value),
        conversationId: props.conversationId,
      })
      if (version !== requestVersion) return
      remember(key, result.lookup)
      data.value = result.lookup
    } catch {
      if (version === requestVersion) error.value = t('common.operationFailed')
    } finally {
      if (version === requestVersion) loading.value = false
    }
  },
  { immediate: true },
)

async function save() {
  if (!data.value || !store.settings) return
  await api.post('/words', {
    term: props.term,
    lemma: data.value.lemma,
    meaning: data.value.contextMeaning,
    language: targetLanguageCode.value,
    interfaceLocale: String(locale.value),
    details: data.value,
    sourceSentence: props.sentence,
    conversationId: props.conversationId,
  })
  saved.value = true
  store.notify(t('lookup.saved'))
}

  return { sessionCache, store, t, locale, loading, data, saved, error, normalized, cacheKey, remember, targetLanguageCode, collocations, save }
}
