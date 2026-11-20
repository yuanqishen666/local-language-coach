// Generated from src/pages/SceneBuilderPage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api } from '../../api'
import { useAppStore } from '../../stores/app'
import type { ConversationSetup } from '../../types'
import { anchorConversationPresets, instantConversationPresets } from '../../../shared/conversation-presets'
import { displayTargetLanguage } from '../../../shared/locales'
import { guideToModelSettings, needsModelConfiguration, sceneDraftKey } from '../../model-access'

export function useSceneBuilderPage() {
const store = useAppStore()
const router = useRouter()
const { t, locale } = useI18n()
const loading = ref(false)
const startingPreset = ref('')
const setups = ref<ConversationSetup[]>([])
const actionError = ref('')
// Which part of the page the error belongs to, and whether model settings can fix it.
const errorSource = ref<'preset' | 'custom' | 'random' | ''>('')
const errorFixInSettings = ref(false)
const customSection = ref<HTMLElement | null>(null)
const form = ref({ domain: 'social', place: '', detail: '' })
const domains = ['daily', 'travel', 'work', 'social', 'study', 'opinion', 'custom']
const instantPresets = instantConversationPresets()
const anchorPresets = anchorConversationPresets()
const anchorPresetId = ref(anchorPresets[0].id)
const anchorValue = ref('')
const selectedAnchorPreset = computed(() => anchorPresets.find((item) => item.id === anchorPresetId.value) || anchorPresets[0])
const selectedAnchorMultiline = computed(() => 'multiline' in selectedAnchorPreset.value.anchor && selectedAnchorPreset.value.anchor.multiline === true)
const isStarting = computed(() => Boolean(startingPreset.value))

function domainName() { return t(`scene.domain.${form.value.domain}`) }
function targetLanguageCode() { return store.settings?.learning.targetLanguageCode || '' }
function preserveDraft() {
  sessionStorage.setItem(sceneDraftKey, JSON.stringify({ form: form.value, setups: setups.value, anchorPresetId: anchorPresetId.value, anchorValue: anchorValue.value, interfaceLocale: String(locale.value), targetLanguageCode: targetLanguageCode() }))
}

onMounted(async () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(sceneDraftKey) || 'null')
    if (saved?.form) form.value = { ...form.value, ...saved.form }
    // Openings are written in the language being learned and described in the language of the page;
    // after either one changes they no longer fit.
    if (saved?.interfaceLocale === String(locale.value) && saved?.targetLanguageCode === targetLanguageCode() && Array.isArray(saved?.setups)) setups.value = saved.setups
    if (anchorPresets.some((item) => item.id === saved?.anchorPresetId)) anchorPresetId.value = saved.anchorPresetId
    if (typeof saved?.anchorValue === 'string') anchorValue.value = saved.anchorValue
    if (saved?.showCustom) {
      await nextTick()
      customSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  } catch { sessionStorage.removeItem(sceneDraftKey) }
})

watch(locale, () => { setups.value = []; preserveDraft() })
watch(anchorPresetId, () => { anchorValue.value = ''; clearError() })

const errorKeys: Record<string, string> = {
  PROVIDER_RATE_LIMITED: 'error.turnBusy',
  PROVIDER_TIMEOUT: 'error.turnTimeout',
  PROVIDER_NETWORK_ERROR: 'error.turnNetwork',
  PROVIDER_UNAVAILABLE: 'error.turnUnavailable',
  PROVIDER_EMPTY_RESPONSE: 'error.turnIncomplete',
  PROVIDER_INVALID_RESPONSE: 'error.turnIncomplete',
  PROVIDER_TRUNCATED_RESPONSE: 'error.turnTruncated',
  PROVIDER_REFUSAL: 'error.turnRefusal',
  PROVIDER_AUTH_FAILED: 'error.turnAuth',
  PROVIDER_BALANCE_REQUIRED: 'error.turnBalance',
  PROVIDER_NOT_FOUND: 'error.turnModel',
  PROVIDER_INVALID_REQUEST: 'error.turnInvalidRequest',
  PROVIDER_ERROR: 'error.turnProvider',
}
const settingsErrorCodes = new Set(['PROVIDER_TRUNCATED_RESPONSE', 'PROVIDER_AUTH_FAILED', 'PROVIDER_NOT_FOUND', 'PROVIDER_INVALID_REQUEST'])

function clearError() {
  actionError.value = ''
  errorSource.value = ''
  errorFixInSettings.value = false
}

function showError(source: 'preset' | 'custom' | 'random', fallbackKey: string, error?: unknown) {
  const code = error instanceof ApiError ? error.code || '' : ''
  const details = error instanceof ApiError ? error.details : undefined
  errorSource.value = source
  errorFixInSettings.value = settingsErrorCodes.has(code)
  if (code === 'PROVIDER_TRUNCATED_RESPONSE' && details?.maxOutputTokens && details.recommendedMaxOutputTokens) {
    actionError.value = t('scene.outputLimitError', { current: details.maxOutputTokens, recommended: details.recommendedMaxOutputTokens })
  } else if (code === 'PROVIDER_WRONG_LANGUAGE') {
    const target = String(details?.targetLanguageCode || store.settings?.learning.targetLanguageCode || '')
    actionError.value = t('scene.openingLanguageError', { language: displayTargetLanguage(target, locale.value) })
  } else {
    actionError.value = t(errorKeys[code] || fallbackKey)
  }
}

async function openModelSettings() {
  preserveDraft()
  await router.push({ path: '/settings', query: { tab: 'models', returnTo: '/start' } })
}

async function requireModel() {
  if (store.settings?.modelReady) return true
  preserveDraft()
  await guideToModelSettings(router, '/start')
  return false
}

async function openPreset(presetId: string, anchor = '') {
  if (isStarting.value || !await requireModel()) return
  startingPreset.value = presetId
  clearError()
  try {
    const data = await api.post<{ id: string }>(`/conversation-presets/${encodeURIComponent(presetId)}/start`, { anchor, interfaceLocale: String(locale.value) })
    sessionStorage.removeItem(sceneDraftKey)
    await router.push(`/conversation/${data.id}`)
  } catch (error) {
    if (needsModelConfiguration(error)) await guideToModelSettings(router, '/start')
    else showError('preset', 'scene.presetStartError', error)
  } finally { startingPreset.value = '' }
}

/** Surprise me: a kind of conversation, a place and a person are drawn, and the conversation opens. */
async function surprise() {
  if (isStarting.value || loading.value || !await requireModel()) return
  startingPreset.value = 'random'
  clearError()
  try {
    const data = await api.post<{ id: string }>('/conversation-setups/random', { interfaceLocale: String(locale.value) })
    sessionStorage.removeItem(sceneDraftKey)
    await router.push(`/conversation/${data.id}`)
  } catch (error) {
    if (needsModelConfiguration(error)) await guideToModelSettings(router, '/start')
    else showError('random', 'scene.presetStartError', error)
  } finally { startingPreset.value = '' }
}


async function startAnchor() {
  const value = anchorValue.value.trim()
  if (!value) { showError('preset', 'scene.anchorRequired'); return }
  await openPreset(selectedAnchorPreset.value.id, value)
}

async function generate() {
  clearError()
  if (!await requireModel()) return
  loading.value = true
  try {
    const data = await api.post<{ setups: ConversationSetup[] }>('/conversation-setups/suggest', { domain: domainName(), place: form.value.place, detail: form.value.detail, interfaceLocale: String(locale.value) })
    setups.value = data.setups
    preserveDraft()
  } catch (error) {
    if (needsModelConfiguration(error)) { preserveDraft(); await guideToModelSettings(router, '/start') }
    else showError('custom', 'scene.generateOpenError', error)
  } finally { loading.value = false }
}

async function start(setup: ConversationSetup) {
  if (isStarting.value || !await requireModel()) return
  startingPreset.value = 'custom'
  clearError()
  try {
    const data = await api.post<{ id: string }>('/conversations', { setup, interfaceLocale: String(locale.value) })
    sessionStorage.removeItem(sceneDraftKey)
    await router.push(`/conversation/${data.id}`)
  } catch (error) {
    if (needsModelConfiguration(error)) await guideToModelSettings(router, '/start')
    else showError('custom', 'scene.startOpenError', error)
  } finally { startingPreset.value = '' }
}

  return { store, router, t, locale, loading, startingPreset, setups, actionError, errorSource, errorFixInSettings, customSection, form, domains, instantPresets, anchorPresets, anchorPresetId, anchorValue, selectedAnchorPreset, selectedAnchorMultiline, isStarting, domainName, targetLanguageCode, preserveDraft, errorKeys, settingsErrorCodes, clearError, showError, openModelSettings, requireModel, openPreset, surprise, startAnchor, generate, start }
}
