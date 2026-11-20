// Generated from src/pages/RecapPage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api } from '../../api'
import { useAppStore } from '../../stores/app'
import { modelErrorKey } from '../../provider-error-copy'
import { guideToModelSettings, needsModelConfiguration } from '../../model-access'
import { changeLine, loadLevel, stepName } from '../../level'
import { isErrorCategory } from '../../../shared/memory'
import { RECAP_MIN_TURNS, type Practice, type Recap } from '../../../shared/recap'
import type { ProficiencyChange } from '../../../shared/proficiency'
import { formatCost, type Spend } from '../../usage'

export function useRecapPage() {
type Change = Pick<ProficiencyChange, 'kind' | 'fromStep' | 'toStep'>

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const { t, locale } = useI18n()

const conversationId = computed(() => String(route.params.id))
const conversationPath = computed(() => `/conversations/${encodeURIComponent(conversationId.value)}`)
const recap = ref<Recap | null>(null)
// What the conversation moved in the level. Told once, right after the recap is written.
const changes = ref<Change[]>([])
const state = ref<'loading' | 'writing' | 'ready' | 'short' | 'failed'>('loading')
const error = ref('')
const busy = ref<'' | 'note' | 'word' | 'practice'>('')
const actionError = ref('')
const minTurns = RECAP_MIN_TURNS
const languageCode = computed(() => recap.value?.languageCode || store.settings?.learning.targetLanguageCode || 'en')
let version = 0

// What the model requests of this conversation came to, the recap included.
const spend = ref<Spend | null>(null)
async function loadSpend() {
  try {
    spend.value = await api.get<Spend>(`/usage/conversations/${encodeURIComponent(conversationId.value)}`)
  } catch {
    spend.value = null
  }
}
const spendLine = computed(() => {
  const value = spend.value
  if (!value?.requests) return ''
  return value.unpriced >= value.requests
    ? t('usage.spentUnpriced', { count: value.requests })
    : t('usage.spent', { cost: formatCost(value.cost, String(locale.value)), count: value.requests })
})
watch(state, (value) => { if (value === 'ready') void loadSpend() })

const expressionName = computed(() => (recap.value?.expression ? stepName(recap.value.expression.step) : ''))
const difficultyLine = computed(() => {
  const session = recap.value?.session
  if (!session) return ''
  const from = stepName(session.startStep)
  return session.startStep === session.endStep ? from : `${from} → ${stepName(session.endStep)}`
})
const helpUsed = computed(() => {
  const help = recap.value?.session?.help
  if (!help) return []
  return (['lookups', 'translations', 'simpler', 'slower', 'hints'] as const)
    .filter((kind) => help[kind] > 0)
    .map((kind) => ({ kind, count: help[kind] }))
})
const changeLines = computed(() => changes.value.map((change) => changeLine(change, t)))

function mistakeLabel(category: string) {
  return t(`learning.error.${isErrorCategory(category) ? category : 'other'}`)
}

function failureText(value: unknown, fallback: string) {
  return t(modelErrorKey(value) || fallback)
}

/** Shows the recap already written for this conversation, or has one written. */
async function open() {
  const current = ++version
  state.value = 'loading'
  error.value = ''
  actionError.value = ''
  changes.value = []
  try {
    const found = await api.get<{ available: boolean; recap: Recap | null }>(`${conversationPath.value}/recap?interfaceLocale=${encodeURIComponent(String(locale.value))}`)
    if (current !== version) return
    recap.value = found.recap
    if (found.recap) { state.value = 'ready'; return }
    if (!found.available) { state.value = 'short'; return }
  } catch {
    if (current !== version) return
    recap.value = null
    state.value = 'failed'
    error.value = t('common.operationFailed')
    return
  }
  await write()
}

async function write() {
  const current = ++version
  state.value = 'writing'
  error.value = ''
  actionError.value = ''
  try {
    const result = await api.post<{ recap: Recap; changes: Change[] }>(`${conversationPath.value}/recap`, { interfaceLocale: String(locale.value) })
    if (current !== version) return
    recap.value = result.recap
    changes.value = result.changes || []
    state.value = 'ready'
    void loadLevel(result.recap.languageCode).catch(() => undefined)
  } catch (value) {
    if (current !== version) return
    if (needsModelConfiguration(value)) { await guideToModelSettings(router, route.fullPath); return }
    if (value instanceof ApiError && value.code === 'RECAP_TOO_SHORT') { state.value = 'short'; return }
    // A recap written earlier stays on the page when writing it again fails.
    if (recap.value) {
      state.value = 'ready'
      actionError.value = failureText(value, 'recap.failed')
    } else {
      state.value = 'failed'
      error.value = failureText(value, 'recap.failed')
    }
  }
}

/** The learner asks for this kind of mistake to be watched in later conversations. Nothing is kept without the press. */
async function notePattern() {
  if (!recap.value?.pattern || busy.value) return
  busy.value = 'note'
  actionError.value = ''
  try {
    await api.post(`${conversationPath.value}/recap/pattern`, {})
    if (recap.value?.pattern) recap.value.pattern.noted = true
  } catch {
    actionError.value = t('common.operationFailed')
  } finally { busy.value = '' }
}

async function addTakeaway() {
  if (!recap.value?.takeaway || busy.value) return
  busy.value = 'word'
  actionError.value = ''
  try {
    const saved = await api.post<{ wordId: string }>(`${conversationPath.value}/recap/takeaway`, { interfaceLocale: String(locale.value) })
    if (recap.value?.takeaway) recap.value.takeaway.wordId = saved.wordId
  } catch {
    actionError.value = t('common.operationFailed')
  } finally { busy.value = '' }
}

async function startPractice() {
  if (busy.value) return
  busy.value = 'practice'
  actionError.value = ''
  try {
    const result = await api.post<{ practice: Practice }>(`${conversationPath.value}/practice`, { interfaceLocale: String(locale.value) })
    await router.push(`/practice/${encodeURIComponent(result.practice.id)}`)
  } catch (value) {
    if (needsModelConfiguration(value)) { await guideToModelSettings(router, route.fullPath); return }
    if (value instanceof ApiError && value.code === 'PRACTICE_NOTHING') {
      if (recap.value) recap.value.practice = false
      actionError.value = t('recap.practiceNothing')
      return
    }
    actionError.value = failureText(value, 'common.operationFailed')
  } finally { busy.value = '' }
}

function backToConversation() {
  void router.push(`/conversation/${encodeURIComponent(conversationId.value)}`)
}

onMounted(open)
watch(locale, open)
watch(conversationId, (next, previous) => { if (next && next !== previous) void open() })

  return { route, router, store, t, locale, conversationId, conversationPath, recap, changes, state, error, busy, actionError, minTurns, languageCode, spend, loadSpend, spendLine, expressionName, difficultyLine, helpUsed, changeLines, mistakeLabel, failureText, open, write, notePattern, addTakeaway, startPractice, backToConversation }
}
