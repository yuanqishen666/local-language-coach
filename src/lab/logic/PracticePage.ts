// Generated from src/pages/PracticePage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '../../api'
import { useAppStore } from '../../stores/app'
import { modelErrorKey } from '../../provider-error-copy'
import { guideToModelSettings, needsModelConfiguration } from '../../model-access'
import { displayTargetLanguage } from '../../../shared/locales'
import { isErrorCategory } from '../../../shared/memory'
import { PRACTICE_GAP, type Practice, type PracticeResult } from '../../../shared/recap'

export function usePracticePage() {
const route = useRoute()
const router = useRouter()
const store = useAppStore()
const { t, locale } = useI18n()

const practice = ref<Practice | null>(null)
const at = ref(0)
const choice = ref<number | null>(null)
const answerText = ref('')
const busy = ref(false)
const error = ref('')
const loadFailed = ref(false)
// Every question is answered and the learner has moved past the last one.
const finished = ref(false)

const languageCode = computed(() => practice.value?.languageCode || store.settings?.learning.targetLanguageCode || 'en')
const languageName = computed(() => displayTargetLanguage(languageCode.value, locale.value))
const total = computed(() => practice.value?.items.length || 0)
const item = computed(() => practice.value?.items[at.value] || null)
const result = computed<PracticeResult | null>(() => item.value?.result || null)
const last = computed(() => at.value >= total.value - 1)
const canSubmit = computed(() => {
  if (!item.value || busy.value || result.value) return false
  return item.value.kind === 'gap' ? choice.value !== null : answerText.value.trim().length > 0
})
const letters = ['A', 'B', 'C', 'D']
// Once a gap question is answered: which choice was picked and which one fits.
const givenIndex = computed(() => {
  const current = item.value
  if (!current || current.kind !== 'gap' || !current.result) return -1
  return current.options.indexOf(current.result.given)
})
const rightIndex = computed(() => {
  const current = item.value
  if (!current || current.kind !== 'gap' || !current.result) return -1
  const answer = current.result.answer
  return current.options.findIndex((option) => current.sentence.replace(PRACTICE_GAP, option) === answer)
})

function mistakeLabel(category: string) {
  return t(`learning.error.${isErrorCategory(category) ? category : 'other'}`)
}

function place(loaded: Practice) {
  practice.value = loaded
  const open = loaded.items.findIndex((entry) => !entry.result)
  // Opened again after it was finished, it shows how it went.
  finished.value = open < 0
  at.value = open < 0 ? Math.max(0, loaded.items.length - 1) : open
  choice.value = null
  answerText.value = ''
}

async function load() {
  loadFailed.value = false
  error.value = ''
  try {
    place((await api.get<{ practice: Practice }>(`/practice/${encodeURIComponent(String(route.params.id))}`)).practice)
  } catch {
    practice.value = null
    loadFailed.value = true
  }
}

async function submit() {
  const current = item.value
  if (!current || !practice.value || !canSubmit.value) return
  busy.value = true
  error.value = ''
  try {
    const body = current.kind === 'gap'
      ? { itemId: current.id, choice: choice.value }
      : { itemId: current.id, text: answerText.value.trim() }
    const answered = await api.post<{ result: PracticeResult; practice: Practice }>(`/practice/${encodeURIComponent(practice.value.id)}/answer`, body)
    practice.value = answered.practice
  } catch (value) {
    if (needsModelConfiguration(value)) { await guideToModelSettings(router, route.fullPath); return }
    error.value = t(modelErrorKey(value) || 'practice.failed')
  } finally { busy.value = false }
}

function next() {
  if (last.value) { finished.value = true; return }
  at.value += 1
  choice.value = null
  answerText.value = ''
}

function leave() {
  const conversationId = practice.value?.conversationId
  void router.push(conversationId ? `/conversation/${encodeURIComponent(conversationId)}/recap` : '/')
}

onMounted(load)
watch(() => route.params.id, (next, previous) => { if (next && next !== previous) void load() })

  return { route, router, store, t, locale, practice, at, choice, answerText, busy, error, loadFailed, finished, languageCode, languageName, total, item, result, last, canSubmit, letters, givenIndex, rightIndex, mistakeLabel, place, load, submit, next, leave }
}
