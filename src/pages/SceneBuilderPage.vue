<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api } from '../api'
import { useAppStore } from '../stores/app'
import AppIcon from '../components/AppIcon.vue'
import type { ConversationSetup } from '../types'
import { anchorConversationPresets, instantConversationPresets } from '../../shared/conversation-presets'
import { displayTargetLanguage } from '../../shared/locales'
import { guideToModelSettings, needsModelConfiguration, sceneDraftKey } from '../model-access'

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
</script>

<template>
  <div class="page builder" data-qs-id="qs-scene-builder">
    <header class="builder-bar">
      <RouterLink to="/" class="back" :aria-label="t('common.back')">←</RouterLink>
      <b>{{ t('home.settingTitle') }}</b>
      <span>{{ store.settings?.learning.targetLanguageCode.toUpperCase() }} · {{ store.settings?.learning.proficiency }}</span>
    </header>

    <main :aria-busy="isStarting || loading">
      <section class="hero" aria-labelledby="scene-quick-title">
        <span class="eyebrow">{{ t('scene.quickEyebrow') }}</span>
        <h1 id="scene-quick-title">{{ t('scene.quickTitle') }}</h1>
        <p>{{ t('scene.quickBody') }}</p>
        <div class="preset-grid" data-qs-id="qs-instant-scenes">
          <button v-for="(preset, index) in instantPresets" :key="preset.id" type="button" class="preset-row" :disabled="isStarting" :data-qs-id="`qs-preset-${preset.id}`" @click="openPreset(preset.id)">
            <span class="preset-index">0{{ index + 1 }}</span>
            <span><b>{{ t(preset.titleKey) }}</b><small>{{ t(preset.descriptionKey) }}</small></span>
            <AppIcon name="arrow" />
          </button>
        </div>
        <progress v-if="isStarting" class="scene-progress" :aria-label="t('scene.presetStarting')"></progress>
        <p v-if="isStarting" class="loading-copy" role="status" aria-live="polite">{{ t('scene.presetStarting') }}</p>
      </section>

      <section class="anchor-stage" aria-labelledby="scene-anchor-title" data-qs-id="qs-anchor-scene">
        <div class="section-heading">
          <span class="eyebrow">{{ t('scene.anchorEyebrow') }}</span>
          <h2 id="scene-anchor-title">{{ t('scene.anchorTitle') }}</h2>
          <p>{{ t('scene.anchorBody') }}</p>
        </div>
        <form class="anchor-form" autocomplete="off" @submit.prevent="startAnchor">
          <div class="field">
            <label for="anchor-kind">{{ t('scene.anchorType') }}</label>
            <select id="anchor-kind" v-model="anchorPresetId" name="anchor-kind">
              <option v-for="preset in anchorPresets" :key="preset.id" :value="preset.id">{{ t(preset.titleKey) }}</option>
            </select>
          </div>
          <div class="anchor-detail">
            <div class="field">
              <label for="anchor-value">{{ t(selectedAnchorPreset.anchor.labelKey) }}</label>
              <textarea v-if="selectedAnchorMultiline" id="anchor-value" v-model="anchorValue" name="anchor-value" autocomplete="off" required :maxlength="selectedAnchorPreset.anchor.maxLength" :placeholder="t(selectedAnchorPreset.anchor.placeholderKey)"></textarea>
              <input v-else id="anchor-value" v-model="anchorValue" name="anchor-value" autocomplete="off" required :maxlength="selectedAnchorPreset.anchor.maxLength" :placeholder="t(selectedAnchorPreset.anchor.placeholderKey)" />
              <small>{{ t(selectedAnchorPreset.anchor.helpKey) }}</small>
            </div>
            <button class="btn primary" type="submit" :disabled="isStarting"><span>{{ t('scene.anchorStart') }}</span><AppIcon name="arrow" /></button>
          </div>
        </form>
      </section>

      <p v-if="actionError" class="action-error" role="alert">{{ actionError }}</p>

      <section ref="customSection" class="custom-stage" aria-labelledby="scene-custom-title" data-qs-id="qs-custom-scene">
        <div class="section-heading">
          <span class="eyebrow">{{ t('scene.customEyebrow') }}</span>
          <h2 id="scene-custom-title">{{ t('scene.customTitle') }}</h2>
          <p>{{ t('scene.customBody') }}</p>
        </div>
        <form autocomplete="off" @submit.prevent="generate">
          <div class="domain-grid" role="group" :aria-label="t('scene.domainLabel')">
            <button v-for="item in domains" :key="item" type="button" :aria-pressed="form.domain === item" :class="[{ selected: form.domain === item }, `domain-${item}`]" @click="form.domain = item">
              <span>{{ item === 'custom' ? '＋' : t(`scene.domain.${item}`).slice(0, 1) }}</span><b>{{ t(`scene.domain.${item}`) }}</b>
            </button>
          </div>
          <div class="context-row">
            <div class="field"><label for="custom-place">{{ t('scene.placeOpenLabel') }}</label><input id="custom-place" v-model="form.place" name="place" autocomplete="off" /></div>
            <div class="field"><label for="custom-detail">{{ t('scene.topicLabel') }}</label><textarea id="custom-detail" v-model="form.detail" name="detail" autocomplete="off"></textarea></div>
            <button class="btn primary generate" type="submit" :disabled="loading || isStarting">{{ loading ? t('scene.generatingOpen') : t('scene.generateOpen') }}<AppIcon name="arrow" /></button>
          </div>
          <progress v-if="loading" class="scene-progress" :aria-label="t('scene.generatingOpen')"></progress>
        </form>
      </section>

      <section v-if="setups.length" class="options" aria-labelledby="scene-options-title">
        <div class="option-heading"><span>02</span><h2 id="scene-options-title">{{ t('scene.choosePerson') }}</h2></div>
        <div class="option-grid">
          <article v-for="setup in setups" :key="setup.title + setup.openingLine" class="option">
            <div class="partner-avatar">{{ (setup.partnerName || setup.partnerRole).slice(0, 1) }}</div><span class="badge">{{ setup.category }} · {{ setup.difficulty }}</span>
            <h2>{{ setup.title }}</h2><p class="partner-role">{{ setup.partnerName || setup.partnerRole }} · {{ setup.partnerRole }}</p><blockquote>“{{ setup.openingLine }}”</blockquote>
            <button type="button" :disabled="isStarting" @click="start(setup)"><span>{{ t('scene.startOpen') }}</span><AppIcon name="arrow" /></button>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.builder{max-width:1240px;padding-top:26px}.builder-bar{height:56px;display:grid;grid-template-columns:42px 1fr auto;align-items:center;gap:14px;border-bottom:1px solid var(--line)}.builder-bar .back{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:var(--paper);font-size:19px;transition:transform .18s}.builder-bar .back:hover{transform:translateX(-3px)}.builder-bar b{font-size:13px}.builder-bar>span{color:var(--muted);font-size:10px}.hero{padding:64px 6px 46px}.eyebrow{display:block;margin-bottom:14px;color:var(--blue);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.hero h1,.section-heading h2{font-family:'Songti SC',STSong,serif;font-weight:520;line-height:1.03}.hero h1{max-width:850px;font-size:clamp(48px,6vw,82px)}.hero>p,.section-heading p{max-width:660px;color:var(--muted);line-height:1.8}.preset-grid{margin-top:40px;border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.preset-row{min-height:112px;padding:18px 8px;display:grid;grid-template-columns:34px 1fr 28px;align-items:center;gap:14px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);text-align:left}.preset-row:nth-child(odd){border-right:1px solid var(--line)}.preset-row:hover:not(:disabled){background:rgba(255,255,255,.5)}.preset-index{color:var(--muted);font-size:10px}.preset-row b,.preset-row small{display:block}.preset-row b{font-family:'Songti SC',STSong,serif;font-size:22px;font-weight:550}.preset-row small{max-width:370px;margin-top:7px;color:var(--muted);line-height:1.5}.preset-row svg{color:var(--blue)}.scene-progress{width:100%;height:3px;margin-top:18px;border:0;accent-color:var(--blue)}.loading-copy{margin-top:8px!important;font-size:11px}.anchor-stage,.custom-stage{margin:0 6px;padding:54px clamp(24px,5vw,68px);border-radius:26px;background:var(--ink);color:#f8f5ec}.custom-stage{margin-top:22px;background:#e7e1d6;color:var(--ink);scroll-margin-top:24px}.section-heading{display:grid;grid-template-columns:minmax(260px,1fr) minmax(300px,.8fr);column-gap:40px;align-items:end}.section-heading .eyebrow{grid-column:1/-1}.section-heading h2{font-size:clamp(38px,4.5vw,62px)}.anchor-stage .section-heading p{color:#b9b8b2}.anchor-form{margin-top:42px}.anchor-form>.field{max-width:390px}.anchor-detail{margin-top:16px;display:grid;grid-template-columns:1fr auto;gap:14px;align-items:end}.anchor-detail .btn{height:54px;min-width:190px;justify-content:space-between}.field label{display:block;margin-bottom:8px;font-size:11px;font-weight:800}.field small{display:block;margin-top:8px;color:#aaa9a4;line-height:1.45}.anchor-stage input,.anchor-stage textarea,.anchor-stage select{border-color:#555650;background:#30312d;color:#fff}.anchor-stage input::placeholder,.anchor-stage textarea::placeholder{color:#92928d}.anchor-stage textarea{min-height:96px;resize:vertical}.action-error{margin:16px 6px 0;padding:11px 13px;border-radius:9px;background:#f7e9e6;color:var(--red);font-size:11px}.custom-stage .section-heading p{color:#6f6c64}.custom-stage form{margin-top:40px}.domain-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(138px,1fr));gap:8px}.domain-grid button{position:relative;min-height:112px;padding:15px;display:flex;align-items:end;border:1px solid rgba(32,33,30,.08);border-radius:13px;background:rgba(255,255,255,.34);color:var(--ink);text-align:left;transition:transform .2s var(--ease),box-shadow .2s}.domain-grid button:hover{transform:translateY(-2px)}.domain-grid button.selected{box-shadow:inset 0 0 0 3px var(--blue)}.domain-grid button>span{position:absolute;top:13px;right:14px;font:27px/1 'Songti SC',STSong,serif;opacity:.22}.domain-grid button b{font-size:13px}.context-row{margin-top:20px;display:grid;grid-template-columns:1fr 1fr auto;gap:12px}.context-row textarea{height:54px;min-height:54px;padding-top:16px;resize:none}.generate{height:54px;align-self:end;padding:0 20px}.options{padding:58px 6px 24px}.option-heading{display:flex;align-items:flex-start;gap:20px;margin-bottom:32px}.option-heading>span{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:var(--ink);color:white;font-size:10px}.option-heading h2{font-family:'Songti SC',STSong,serif;font-size:clamp(36px,4vw,56px);font-weight:520}.option-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}.option{min-height:410px;padding:24px;display:flex;flex-direction:column;border-radius:24px;background:var(--paper);transition:transform .24s var(--ease),box-shadow .24s}.option:nth-child(2){background:#dfe8df}.option:nth-child(3){background:#eadbd1}.option:hover{transform:translateY(-5px);box-shadow:0 22px 46px rgba(39,39,33,.11)}.partner-avatar{width:76px;height:76px;display:grid;place-items:center;border-radius:50%;background:var(--ink);color:white;font:30px/1 'Songti SC',STSong,serif}.option .badge{align-self:flex-start;margin-top:22px}.option h2{margin:15px 0 6px;font-family:'Songti SC',STSong,serif;font-size:28px;font-weight:520}.partner-role{margin:0;color:var(--muted);font-size:11px}.option blockquote{margin:auto 0 20px;padding-top:18px;border-top:1px solid var(--line);font-size:14px;line-height:1.7}.option>button{height:42px;padding:0;display:flex;align-items:center;justify-content:space-between;border:0;background:transparent;color:var(--blue);font-weight:700}.option>button:disabled{opacity:.45}
@media(max-width:780px){.builder{padding:18px 16px 92px}.hero{padding:40px 0 32px}.hero h1{font-size:45px}.preset-grid{grid-template-columns:1fr}.preset-row:nth-child(odd){border-right:0}.anchor-stage,.custom-stage{margin-left:0;margin-right:0;padding:32px 22px}.section-heading{grid-template-columns:1fr}.section-heading p{margin-top:14px}.anchor-detail,.context-row{grid-template-columns:1fr}.anchor-detail .btn,.generate{width:100%;justify-content:space-between}.options{padding-left:0;padding-right:0}}
@media(prefers-reduced-motion:reduce){.builder-bar .back,.domain-grid button,.option{transition:none}}
.hero h1,.section-heading h2{text-wrap:balance}.preset-row>span:nth-child(2){min-width:0}.preset-row small{overflow-wrap:anywhere}
</style>
