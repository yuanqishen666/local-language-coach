// Generated from src/components/LevelCard.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { displayTargetLanguage } from '../../../shared/locales'
import { CEFR_LEVELS, MAX_STEP, PROFICIENCY_SKILLS, stepFromScore, stepParts, type CefrLevel } from '../../../shared/proficiency'
import { changeLine, levelOverview, loadLevel, stepName, updateLevel } from '../../level'

export function useLevelCard(props: { languageCode: string }) {
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()

const overview = computed(() => levelOverview(props.languageCode))
const loaded = computed(() => Boolean(overview.value))
const profile = computed(() => overview.value?.profile || null)
const languageName = computed(() => displayTargetLanguage(props.languageCode, locale.value))
const levelName = computed(() => (profile.value ? stepName(profile.value.step) : ''))
const difficultyName = computed(() => (profile.value ? stepName(profile.value.workingStep) : ''))
const pickedLevel = computed(() => (profile.value ? stepParts(profile.value.step).level : null))
const levels = CEFR_LEVELS.map((level) => ({ id: level, key: `onboarding.level${level}` }))

// Only what has been observed is shown; a skill nothing has been seen of yet has no level to state.
const skills = computed(() => PROFICIENCY_SKILLS
  .filter((skill) => (profile.value?.skills[skill]?.evidence || 0) > 0)
  .map((skill) => ({ skill, name: stepName(stepFromScore(profile.value!.skills[skill].score)) })))

const history = computed(() => (overview.value?.history || []).map((change) => ({
  id: change.id,
  line: changeLine(change, t),
  reason: t(`level.reason.${change.reason}`),
  at: change.createdAt,
})))
const latest = computed(() => history.value[0] || null)

/** The estimate over time, oldest first, as points of a line 100 wide and 28 high. */
const curve = computed(() => {
  const steps = (overview.value?.history || []).filter((change) => change.kind === 'estimate').map((change) => change.toStep).reverse()
  if (steps.length < 3) return ''
  // Drawn over the range the estimate has actually covered: on the whole scale a few steps would look flat.
  const low = Math.max(0, Math.min(...steps) - 1)
  const high = Math.min(MAX_STEP, Math.max(...steps) + 1)
  return steps.map((step, index) => `${((index / (steps.length - 1)) * 100).toFixed(1)},${(26 - ((step - low) / Math.max(1, high - low)) * 24).toFixed(1)}`).join(' ')
})

const quickCheck = computed(() => overview.value?.quickCheck?.reason || '')
const picking = ref(false)
const confirmingClear = ref(false)
const busy = ref(false)
const failed = ref(false)

async function refresh() {
  try { await loadLevel(props.languageCode) } catch { /* The card stays empty; the page it sits on has its own way to reload. */ }
}

async function change(update: Parameters<typeof updateLevel>[1]) {
  if (busy.value) return false
  busy.value = true
  failed.value = false
  try {
    await updateLevel(props.languageCode, update)
    return true
  } catch {
    failed.value = true
    return false
  } finally {
    busy.value = false
  }
}

async function chooseLevel(level: CefrLevel) {
  if (await change({ level, source: profile.value ? 'manual' : 'self' })) picking.value = false
}

async function toggleLock() {
  if (profile.value) await change({ locked: !profile.value.locked })
}

/** Asked twice: the first press only arms it. */
async function clear() {
  if (!confirmingClear.value) {
    confirmingClear.value = true
    return
  }
  confirmingClear.value = false
  await change({ clear: true })
}

async function test(mode: 'full' | 'quick' = 'full') {
  await router.push({ path: '/placement', query: { language: props.languageCode, ...(mode === 'quick' ? { mode } : {}), from: route.fullPath } })
}

onMounted(refresh)
watch(() => props.languageCode, () => {
  picking.value = false
  confirmingClear.value = false
  failed.value = false
  void refresh()
})

  return { router, route, t, locale, overview, loaded, profile, languageName, levelName, difficultyName, pickedLevel, levels, skills, history, latest, curve, quickCheck, picking, confirmingClear, busy, failed, refresh, change, chooseLevel, toggleLock, clear, test }
}
