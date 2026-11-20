// Generated from src/pages/ProgressPage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '../../api'
import { useAppStore } from '../../stores/app'
import { guideToModelSettings, needsModelConfiguration } from '../../model-access'
import { stepName } from '../../level'
import { clockOffset } from '../../usage'
import { activityGrid, levelCurve, monthStarts, type GridCell, type ProgressDay } from '../../progress-grid'
import { isErrorCategory } from '../../../shared/memory'
import { displayTargetLanguage } from '../../../shared/locales'
import { BEDTIME_CATEGORY, bedtimeOpening } from '../../../shared/quick-talk'
import { normalizeRegister, normalizeVariant } from '../../../shared/variants'

export function useProgressPage() {
interface WeekSummary {
  from: string
  to: string
  messages: number
  amount: number
  conversations: number
  days: number
  previous: { messages: number; amount: number }
  firstUsed: Array<{ term: string; meaning: string }>
  fewer: { category: string; before: number; now: number } | null
}
interface Progress {
  languageCode: string
  unit: 'words' | 'characters'
  weeks: number
  today: string
  days: ProgressDay[]
  week: WeekSummary
  lastWeek: WeekSummary
  level: Array<{ at: string; step: number; reason: string }>
}

const router = useRouter()
const store = useAppStore()
const { t, locale } = useI18n()

const progress = ref<Progress | null>(null)
const state = ref<'loading' | 'ready' | 'failed'>('loading')
const starting = ref(false)
const startError = ref('')
let version = 0

const languageCode = computed(() => store.settings?.learning.targetLanguageCode || 'en')
const languageName = computed(() => displayTargetLanguage(languageCode.value, locale.value))

async function load() {
  const current = ++version
  try {
    const data = await api.get<Progress>(`/progress?offset=${clockOffset()}&language=${encodeURIComponent(languageCode.value)}`)
    if (current !== version) return
    progress.value = data
    state.value = 'ready'
  } catch {
    if (current !== version) return
    state.value = progress.value ? 'ready' : 'failed'
  }
}
onMounted(load)
watch(languageCode, load)

const grid = computed<GridCell[][]>(() => progress.value ? activityGrid(progress.value.days, progress.value.today, progress.value.weeks) : [])
const months = computed(() => {
  const name = new Intl.DateTimeFormat(locale.value, { month: 'short', timeZone: 'UTC' })
  return monthStarts(grid.value).map((item) => ({ week: item.week, name: name.format(new Date(`${item.date}T00:00:00Z`)) }))
})
/** Monday, Wednesday and Friday, named beside the rows they are. */
const weekdays = computed(() => {
  const name = new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' })
  // 1 January 2024 was a Monday.
  return [0, 2, 4].map((day) => ({ row: day, name: name.format(new Date(Date.UTC(2024, 0, 1 + day))) }))
})
const activeDays = computed(() => grid.value.flat().filter((day) => day.messages > 0).length)
const empty = computed(() => state.value === 'ready' && activeDays.value === 0 && !progress.value?.level.length)

function amountText(amount: number) {
  return t(progress.value?.unit === 'characters' ? 'progress.characters' : 'progress.words', { count: amount.toLocaleString(locale.value) }, amount)
}
function dayText(day: GridCell) {
  const date = new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day.date}T00:00:00Z`))
  return day.messages ? `${date} · ${t('progress.messages', { count: day.messages })} · ${amountText(day.amount)}` : date
}
function mistakeLabel(category: string) {
  return t(`learning.error.${isErrorCategory(category) ? category : 'other'}`)
}

const weeks = computed(() => {
  const data = progress.value
  if (!data) return []
  return ([['week', data.week], ['lastWeek', data.lastWeek]] as const)
    .filter(([, week]) => week.messages > 0)
    .map(([id, week]) => ({
      id,
      title: t(id === 'week' ? 'progress.thisWeek' : 'progress.lastWeek'),
      facts: [
        { label: t('progress.daysLabel'), value: `${week.days} / 7` },
        { label: t('progress.conversationsLabel'), value: String(week.conversations) },
        { label: t('progress.messagesLabel'), value: String(week.messages) },
        { label: t(data.unit === 'characters' ? 'progress.charactersLabel' : 'progress.wordsLabel'), value: week.amount.toLocaleString(locale.value) },
      ],
      before: week.previous.messages > 0 ? t('progress.weekBefore', { amount: amountText(week.previous.amount) }) : '',
      firstUsed: week.firstUsed,
      fewer: week.fewer ? t('progress.fewer', { kind: mistakeLabel(week.fewer.category), before: week.fewer.before, now: week.fewer.now }) : '',
    }))
})

const levelNow = computed(() => {
  const last = progress.value?.level.at(-1)
  return last ? stepName(last.step) : ''
})
const levelFirst = computed(() => {
  const first = progress.value?.level[0]
  return first && (progress.value?.level.length || 0) > 1 ? stepName(first.step) : ''
})
const curve = computed(() => levelCurve((progress.value?.level || []).map((item) => item.step)))

/** A few lines about the day before sleep. The opening line is fixed, so starting costs nothing. */
async function startBedtime() {
  if (starting.value || !store.settings) return
  startError.value = ''
  if (!store.settings.modelReady) {
    await guideToModelSettings(router, '/progress')
    return
  }
  const learning = store.settings.learning
  starting.value = true
  try {
    const title = t('progress.bedtime')
    const data = await api.post<{ id: string }>('/conversations', {
      title,
      interfaceLocale: String(locale.value),
      setup: {
        title,
        category: BEDTIME_CATEGORY,
        setting: t('progress.bedtimeSetting'),
        partnerName: '',
        partnerRole: t('progress.bedtimePartner'),
        relationship: 'close friend',
        tone: 'quiet and warm',
        personalityCues: ['unhurried', 'a good listener'],
        interests: [],
        currentMood: 'winding down',
        topicSeed: t('progress.bedtimeTopic'),
        openingLine: bedtimeOpening(learning.targetLanguageCode, normalizeVariant(learning.targetLanguageCode, learning.variant), normalizeRegister(learning.register)),
        difficulty: '',
      },
    })
    await router.push(`/conversation/${data.id}`)
  } catch (error) {
    if (needsModelConfiguration(error)) await guideToModelSettings(router, '/progress')
    else startError.value = t('home.startError')
  } finally {
    starting.value = false
  }
}

  return { router, store, t, locale, progress, state, starting, startError, languageCode, languageName, load, grid, months, weekdays, activeDays, empty, amountText, dayText, mistakeLabel, weeks, levelNow, levelFirst, curve, startBedtime }
}
