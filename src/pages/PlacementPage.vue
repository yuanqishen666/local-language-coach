<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '../api'
import { useAppStore } from '../stores/app'
import { browserSpeech } from '../speech'
import { DEFAULT_SPEECH_RATE, normalizeSpeechRate } from '../../shared/speech'
import { displayTargetLanguage, TARGET_LANGUAGES } from '../../shared/locales'
import { CEFR_LEVELS, stepOf, stepParts, type CefrLevel } from '../../shared/proficiency'
import type { PlacementProgress, PlacementResult } from '../../shared/placement'
import { modelSettingsLocation, needsModelConfiguration } from '../model-access'
import { levelOverview, loadLevel, markLevelPrompted, stepName, updateLevel } from '../level'
import { formatCost, type Spend } from '../usage'
import { runsForOneself } from '../install'

const store = useAppStore()
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()

const languageCode = computed(() => {
  const asked = String(route.query.language || '')
  return TARGET_LANGUAGES.some((item) => item.code === asked) ? asked : store.settings?.learning.targetLanguageCode || 'en'
})
const languageName = computed(() => displayTargetLanguage(languageCode.value, locale.value))
const overview = computed(() => levelOverview(languageCode.value))
const profile = computed(() => overview.value?.profile || null)
// A short check confirms a level that already exists; without one the full test is given.
const quick = computed(() => route.query.mode === 'quick' && Boolean(profile.value))
const questionCount = computed(() => (quick.value ? 5 : 10))
const minutes = computed(() => (quick.value ? '3' : '5–8'))
const modelReady = computed(() => Boolean(store.settings?.modelReady))
const returnTo = computed(() => {
  const from = String(route.query.from || '')
  return from.startsWith('/') && !from.startsWith('//') ? from : '/'
})

type Stage = 'intro' | 'pick' | 'question' | 'result'
const stage = ref<Stage>(route.query.pick === '1' ? 'pick' : 'intro')
const busy = ref<'' | 'question' | 'grading' | 'saving'>('')
const error = ref<'' | 'item' | 'grade' | 'save'>('')
const progress = ref<PlacementProgress | null>(null)
const question = computed(() => progress.value?.question || null)
const result = ref<PlacementResult | null>(null)
// What the model requests of this test came to.
const spend = ref<Spend | null>(null)
async function loadSpend(sessionId: string) {
  if (!runsForOneself()) return
  try {
    spend.value = await api.get<Spend>(`/usage/placement/${encodeURIComponent(sessionId)}`)
  } catch {
    spend.value = null
  }
}
const spendLine = computed(() => {
  const value = spend.value
  if (!value?.requests) return ''
  return value.unpriced >= value.requests
    ? t('usage.spentUnpriced', { count: value.requests })
    : t('usage.spentTest', { cost: formatCost(value.cost, String(locale.value)), count: value.requests })
})
const choice = ref<number | null>(null)
const answerText = ref('')
const heard = ref(false)
// The voice failed on a listening question: its text is shown, so the question can still be answered.
const readInstead = ref(false)

const levels = CEFR_LEVELS.map((level) => ({ id: level, step: stepOf(level), key: `onboarding.level${level}` }))
const pickedLevel = computed(() => (profile.value ? stepParts(profile.value.step).level : null))

// Listening needs a voice for the language in this browser; without one those questions are read instead.
const canListen = computed(() => {
  browserSpeech.voicesVersion.value
  return browserSpeech.supported.value && browserSpeech.hasTrustedVoice(languageCode.value)
})
const speechId = computed(() => `placement-${question.value?.id || ''}`)
const speaking = computed(() => browserSpeech.activeId.value === speechId.value)

const canSubmit = computed(() => {
  if (!question.value || busy.value) return false
  if (question.value.kind === 'expression') return answerText.value.trim().length > 0
  return choice.value !== null && (question.value.kind !== 'listening' || heard.value)
})

const resultLevel = computed<CefrLevel | null>(() => (result.value ? stepParts(result.value.step).level : null))
const resultName = computed(() => (result.value ? stepName(result.value.step) : ''))
const startsAt = computed(() => {
  const current = profile.value
  if (!current) return ''
  return t(current.locked ? 'placement.startsLocked' : 'placement.startsAt', { level: stepName(current.workingStep) })
})
const resultParts = computed(() => {
  if (!result.value) return []
  const skills = result.value.skills
  return (['reading', 'listening', 'expression', 'vocabulary', 'grammar'] as const)
    .filter((skill) => typeof skills[skill] === 'number')
    .map((skill) => ({ skill, name: stepName(skills[skill] as number) }))
})

function resetAnswer() {
  choice.value = null
  answerText.value = ''
  heard.value = false
  readInstead.value = false
  browserSpeech.stop()
}

async function toModelSettings() {
  await router.push(modelSettingsLocation(route.fullPath))
}

async function begin() {
  if (busy.value) return
  if (!modelReady.value) {
    await toModelSettings()
    return
  }
  error.value = ''
  busy.value = 'question'
  stage.value = 'question'
  try {
    progress.value = progress.value && !progress.value.done
      // A question that failed to arrive is asked for again in the same test.
      ? await api.get<PlacementProgress>(`/placement/${progress.value.sessionId}`)
      : await api.post<PlacementProgress>('/placement', {
        language: languageCode.value,
        mode: quick.value ? 'quick' : 'full',
        listening: canListen.value,
        interfaceLocale: String(locale.value),
      })
    resetAnswer()
  } catch (failure) {
    if (needsModelConfiguration(failure)) await toModelSettings()
    else {
      error.value = 'item'
      // The test exists on the server even when its first question failed; find it so that a retry continues it.
      if (!progress.value) stage.value = 'intro'
    }
  } finally {
    busy.value = ''
  }
}

function play() {
  const current = question.value
  if (!current?.text) return
  const base = normalizeSpeechRate(store.settings?.learning.speechRate ?? DEFAULT_SPEECH_RATE)
  // A voice that fails mid-test must not leave the learner stuck on a question they cannot hear.
  const failed = () => { readInstead.value = true; heard.value = true }
  try {
    const outcome = browserSpeech.speak({
      id: speechId.value,
      text: current.text,
      languageCode: languageCode.value,
      rate: normalizeSpeechRate(base * (current.speechRateFactor || 1)),
      onError: failed,
    })
    if (outcome === 'started') heard.value = true
  } catch {
    failed()
  }
}

async function send(body: { choice?: number | null; text?: string }) {
  const current = progress.value
  if (!current?.question || busy.value) return
  error.value = ''
  busy.value = 'question'
  browserSpeech.stop()
  try {
    progress.value = await api.post<PlacementProgress>(`/placement/${current.sessionId}/answer`, { questionId: current.question.id, ...body })
    resetAnswer()
  } catch {
    // The answer may have been kept and only the next question failed; asking again sorts out which.
    progress.value = { ...current, question: null }
    error.value = 'item'
  } finally {
    busy.value = ''
  }
  if (progress.value?.done) await finish()
}

async function submit() {
  if (!canSubmit.value || !question.value) return
  if (question.value.kind === 'expression') await send({ text: answerText.value.trim() })
  else await send({ choice: choice.value })
}

/** "Not sure" on a choice, or an open question left unanswered. */
async function pass() {
  if (!question.value) return
  if (question.value.kind === 'expression') await send({ text: '' })
  else await send({ choice: null })
}

async function finish() {
  const current = progress.value
  if (!current || busy.value) return
  error.value = ''
  busy.value = 'grading'
  browserSpeech.stop()
  try {
    const response = await api.post<{ result: PlacementResult | null }>(`/placement/${current.sessionId}/finish`)
    if (!response.result) {
      await leave()
      return
    }
    result.value = response.result
    void loadSpend(current.sessionId)
    await loadLevel(languageCode.value)
    stage.value = 'result'
  } catch {
    error.value = 'grade'
  } finally {
    busy.value = ''
  }
}

/** Stops before the last question. What was answered still gives a result. */
async function stopEarly() {
  if (!progress.value || progress.value.index === 0) {
    await leave()
    return
  }
  await finish()
}

async function retry() {
  if (error.value === 'grade') await finish()
  else await begin()
}

async function chooseLevel(level: CefrLevel) {
  if (busy.value) return
  error.value = ''
  busy.value = 'saving'
  try {
    await updateLevel(languageCode.value, { level, source: result.value ? 'manual' : 'self' })
    busy.value = ''
    await leave()
  } catch {
    error.value = 'save'
  } finally {
    busy.value = ''
  }
}

async function toggleLock() {
  if (!profile.value || busy.value) return
  busy.value = 'saving'
  try { await updateLevel(languageCode.value, { locked: !profile.value.locked }) }
  catch { error.value = 'save' }
  finally { busy.value = '' }
}

async function leave() {
  browserSpeech.stop()
  await router.replace(returnTo.value)
}

onMounted(() => {
  browserSpeech.initialize()
  markLevelPrompted(languageCode.value)
  void loadLevel(languageCode.value).catch(() => undefined)
})
watch(languageCode, (code) => { void loadLevel(code).catch(() => undefined) })
onBeforeUnmount(() => browserSpeech.stop())
</script>

<template>
  <main>{{ t('placement.title') }}</main>
</template>
