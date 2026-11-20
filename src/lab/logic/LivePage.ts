// Generated from src/pages/LivePage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '../../api'
import { useAppStore } from '../../stores/app'
import { modelErrorKey } from '../../provider-error-copy'
import { guideToModelSettings, needsModelConfiguration } from '../../model-access'
import { isErrorCategory } from '../../../shared/memory'
import { LIVE_NOTES_MAX } from '../../../shared/quick-talk'

export function useLivePage() {
type CardItem =
  | { kind: 'pattern'; category: string; example: string }
  | { kind: 'words'; words: Array<{ term: string; meaning: string }> }
  | { kind: 'say'; sentences: Array<{ original: string; improved: string }> }

interface LiveSession {
  id: string
  languageCode: string
  createdAt: string
  finishedAt: string | null
  items: CardItem[]
  outcome: {
    used: boolean[]
    gaps: Array<{ original: string; improved: string }>
    errors: Array<{ original: string; improved: string; explanation: string; category: string }>
  } | null
}

const router = useRouter()
const store = useAppStore()
const { t, locale } = useI18n()

const state = ref<'loading' | 'ready' | 'failed'>('loading')
/** The card taken along and not yet come back to. */
const session = ref<LiveSession | null>(null)
/** The session just written up, shown until another card is taken. */
const result = ref<LiveSession | null>(null)
const past = ref<LiveSession[]>([])
const busy = ref<'' | 'card' | 'debrief' | 'drop'>('')
const error = ref('')
const used = ref<boolean[]>([])
const stuck = ref<string[]>([''])
const corrected = ref<Array<{ said: string; right: string }>>([{ said: '', right: '' }])
const maxNotes = LIVE_NOTES_MAX

const languageCode = computed(() => session.value?.languageCode || result.value?.languageCode || store.settings?.learning.targetLanguageCode || 'en')
const earlier = computed(() => past.value.filter((item) => item.id !== result.value?.id))
const hasNotes = computed(() => stuck.value.some((note) => note.trim()) || corrected.value.some((pair) => pair.said.trim() && pair.right.trim()))

function resetForm(items: CardItem[]) {
  used.value = items.map(() => false)
  stuck.value = ['']
  corrected.value = [{ said: '', right: '' }]
}

async function load() {
  try {
    const data = await api.get<{ current: LiveSession | null; past: LiveSession[] }>('/live')
    session.value = data.current
    past.value = data.past
    if (data.current) resetForm(data.current.items)
    state.value = 'ready'
  } catch {
    state.value = 'failed'
  }
}
onMounted(load)

/** The card is put together from what is already on record, without a model. */
async function takeCard() {
  if (busy.value) return
  busy.value = 'card'
  error.value = ''
  try {
    const created = await api.post<LiveSession>('/live')
    if (result.value) past.value = [result.value, ...earlier.value]
    result.value = null
    session.value = created
    resetForm(created.items)
  } catch {
    error.value = t('live.failed')
  } finally {
    busy.value = ''
  }
}

function addStuck() {
  if (stuck.value.length < maxNotes) stuck.value.push('')
}
function addCorrected() {
  if (corrected.value.length < maxNotes) corrected.value.push({ said: '', right: '' })
}

/** Has the notes written up and put on the learning record. One model request, none when nothing was noted. */
async function finish() {
  const current = session.value
  if (!current || busy.value) return
  if (hasNotes.value && !store.settings?.modelReady) {
    await guideToModelSettings(router, '/progress/live')
    return
  }
  busy.value = 'debrief'
  error.value = ''
  try {
    const done = await api.post<LiveSession>(`/live/${encodeURIComponent(current.id)}/debrief`, {
      used: used.value,
      stuck: stuck.value.map((note) => note.trim()).filter(Boolean),
      corrected: corrected.value.map((pair) => ({ said: pair.said.trim(), right: pair.right.trim() })).filter((pair) => pair.said && pair.right),
      interfaceLocale: String(locale.value),
    })
    session.value = null
    result.value = done
  } catch (failure) {
    if (needsModelConfiguration(failure)) await guideToModelSettings(router, '/progress/live')
    else error.value = t(modelErrorKey(failure) || 'live.failed')
  } finally {
    busy.value = ''
  }
}

/** Takes a session away, and with it what it put on the learning record. */
async function remove(id: string) {
  if (busy.value) return
  busy.value = 'drop'
  error.value = ''
  try {
    await api.delete(`/live/${encodeURIComponent(id)}`)
    if (session.value?.id === id) session.value = null
    if (result.value?.id === id) result.value = null
    past.value = past.value.filter((item) => item.id !== id)
  } catch {
    error.value = t('live.failed')
  } finally {
    busy.value = ''
  }
}

function mistakeLabel(category: string) {
  return t(`learning.error.${isErrorCategory(category) ? category : 'other'}`)
}
function usedCount(item: LiveSession) {
  return item.outcome?.used.filter(Boolean).length || 0
}
function back() {
  void router.push('/progress')
}

  return { router, store, t, locale, state, session, result, past, busy, error, used, stuck, corrected, maxNotes, languageCode, earlier, hasNotes, resetForm, load, takeCard, addStuck, addCorrected, finish, remove, mistakeLabel, usedCount, back }
}
