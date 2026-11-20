<script setup lang="ts">
import { displayTargetLanguage, LOCALE_META, UI_LOCALES } from '../../../shared/locales'
import { MAX_SPEECH_RATE, MIN_SPEECH_RATE, SPEECH_RATE_STEP } from '../../../shared/speech'
import { ref, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import Fold from './Fold.vue'
import LevelCard from './LevelCard.vue'
import { vTip } from '../core/tip'
import { levelOverview, stepName } from '../../level'
import { useSettingsPage } from '../logic/SettingsPage'

const {
  tab, languageDraft, languageDirty, saveLanguagePreferences, setLanguage, languages, speechAvailable, speechRecommendationKey,
  displayedSpeechRate, displayedTargetLanguage, modelRequired, defaultProvider, saveDefaultProvider, selectableProviders,
  providerDrafts, providerName, providerStatus, savedCapabilityMatches, verified, providerSignature, hasModelList, modelsLoaded,
  currentModelIsOfficial, modelLabel, availableModels, activateModel, keys, invalidateProvider, updateActiveModelProfile, result,
  clearingKey, savingProvider, testing, loadingModels, deleteProviderKey, loadModels, test, saveProvider, providerHasChanges,
  webLookupEnabled, webLookupDirty, saveWebLookup, memoryTidyEnabled, saveMemoryTidy, currentProviderName, remote, loadingRemote, loadRemote, copyRemoteUrl,
  downloadBackup, confirmReset, resetting, resetAllConfig, store, t, locale,
  voiceSources, voiceInputChoice, voiceInputNotes, voiceBrowserWarning,
  registers, variantChoices, variantName, reviewProvider, saveReviewProvider,
  customDraft, savingCustom, customError, customSaved, customDirty, saveCustomEndpoint, removeCustomEndpoint, typeModel,
  usage, usageFailed, limitDraft, savingLimit, cost, usageTasks, usageModels, usageMonth, limitDirty, saveLimit,
  priceDrafts, savingPrice, priceChanged, savePrice, estimateText, regionNote,
  profiles, maxProfiles, newProfileName, profileBusy, profileError, renaming, renameDraft, removingProfile,
  profileName, profileLanguage, addProfile, startRename, saveRename, switchProfile, removeProfile,
  lan, lanBusy, lanRestart, setLan, renewLanCode, copyText,
} = useSettingsPage()

const tabs = [
  { id: 'language', key: 'settings.tabLanguage' },
  { id: 'models', key: 'settings.tabModels' },
  { id: 'usage', key: 'settings.tabUsage' },
  { id: 'web', key: 'settings.tabWeb' },
  { id: 'data', key: 'settings.tabData' },
] as const
function savedLevel() {
  const profile = store.settings ? levelOverview(store.settings.learning.targetLanguageCode)?.profile : null
  return profile ? stepName(profile.step) : ''
}
const corrections = [
  { id: 'light', key: 'settings.correctionLight' },
  { id: 'balanced', key: 'settings.correctionBalanced' },
  { id: 'intensive', key: 'settings.correctionIntensive' },
] as const

// Presentation only: one provider is unfolded at a time, starting with the one in use, and its
// token budgets stay behind "more".
const openProvider = ref('')
const budgets = ref(false)
watch(() => [defaultProvider.value, providerDrafts.value.length] as const, ([current]) => {
  if (!openProvider.value) openProvider.value = current || providerDrafts.value[0]?.id || ''
}, { immediate: true })
function toggleProvider(id: string) {
  openProvider.value = openProvider.value === id ? '' : id
  budgets.value = false
}
function ready(provider: any) {
  return savedCapabilityMatches(provider) || verified.value[provider.id] === providerSignature(provider)
}
</script>

<template>
  <div class="y-page narrow y-settings">
    <header class="y-head"><h1>{{ t('settings.title') }}</h1></header>

    <template v-if="store.settings">
      <nav class="y-seg y-set-tabs" role="tablist">
        <button v-for="item in tabs" :key="item.id" type="button" role="tab" :aria-selected="tab === item.id" :aria-pressed="tab === item.id" @click="tab = item.id">{{ t(item.key) }}</button>
      </nav>

      <Transition name="y-view" mode="out-in">
        <section v-if="tab === 'language'" key="language" class="y-pane">
          <div class="y-pair">
            <div class="y-field">
              <label class="y-label" for="st-ui">{{ t('settings.interfaceLanguage') }}</label>
              <select id="st-ui" v-model="languageDraft.ui.locale" class="y-input y-select">
                <option v-for="code in UI_LOCALES" :key="code" :value="code">{{ LOCALE_META[code].nativeName }}</option>
              </select>
            </div>
            <div class="y-field">
              <label class="y-label" for="st-target">{{ t('settings.targetLanguage') }}</label>
              <select id="st-target" class="y-input y-select" :value="languageDraft.learning.targetLanguageCode" @change="setLanguage(($event.target as HTMLSelectElement).value)">
                <option v-for="item in languages" :key="item.code" :value="item.code">{{ displayTargetLanguage(item.code, locale) }}</option>
              </select>
            </div>
          </div>
          <div class="y-pair">
            <div v-if="variantChoices.length" class="y-field">
              <label class="y-label" for="st-variant">{{ t('settings.variant') }}</label>
              <select id="st-variant" v-model="languageDraft.learning.variant" class="y-input y-select">
                <option value="">{{ t('settings.variantAny') }}</option>
                <option v-for="code in variantChoices" :key="code" :value="code">{{ variantName(code) }}</option>
              </select>
            </div>
            <div class="y-field">
              <span id="st-register" class="y-label">{{ t('settings.registerLabel') }}</span>
              <div class="y-seg y-voice-seg" role="group" aria-labelledby="st-register">
                <button v-for="item in registers" :key="item" type="button" :aria-pressed="(languageDraft.learning.register || 'neutral') === item" @click="languageDraft.learning.register = item">{{ t(`settings.registerName.${item}`) }}</button>
              </div>
            </div>
          </div>
          <div class="y-field">
            <span class="y-label">{{ t('settings.level') }}</span>
            <LevelCard :language-code="languageDraft.learning.targetLanguageCode" compact />
          </div>
          <div class="y-field">
            <span class="y-label">{{ t('settings.correction') }}</span>
            <div class="y-options" role="group" :aria-label="t('settings.correction')">
              <button v-for="item in corrections" :key="item.id" type="button" :aria-pressed="languageDraft.learning.correctionLevel === item.id" @click="languageDraft.learning.correctionLevel = item.id"><i aria-hidden="true"></i>{{ t(item.key) }}</button>
            </div>
          </div>
          <div v-if="speechAvailable" class="y-field">
            <div class="y-range-top">
              <label class="y-label" for="speech-rate">{{ t('settings.speechRate') }}</label>
              <output for="speech-rate">{{ displayedSpeechRate }}×</output>
            </div>
            <input
              id="speech-rate"
              v-model.number="languageDraft.learning.speechRate"
              class="y-range"
              name="speechRate"
              type="range"
              :min="MIN_SPEECH_RATE"
              :max="MAX_SPEECH_RATE"
              :step="SPEECH_RATE_STEP"
              :aria-valuetext="t('settings.speechRateValue', { rate: displayedSpeechRate })"
              :style="{ '--fill': `${((Number(displayedSpeechRate) - MIN_SPEECH_RATE) / (MAX_SPEECH_RATE - MIN_SPEECH_RATE)) * 100}%` }"
            />
          </div>
          <div v-else class="y-notice" role="status">
            <p>{{ t('settings.speechUnavailable', { language: displayedTargetLanguage }) }}</p>
            <p>{{ t(speechRecommendationKey) }}</p>
          </div>
          <div class="y-field">
            <span id="voice-input-label" class="y-label">{{ t('settings.voiceInput') }}</span>
            <div class="y-seg y-voice-seg" role="group" aria-labelledby="voice-input-label">
              <button v-for="source in voiceSources" :key="source" type="button" :aria-pressed="voiceInputChoice === source" @click="languageDraft.learning.voiceInput = source">{{ t(source === 'model' ? 'settings.voiceInputModel' : 'settings.voiceInputBrowser') }}</button>
            </div>
            <small v-for="line in voiceInputNotes" :key="line" class="y-field-note">{{ line }}</small>
            <small v-if="voiceBrowserWarning" class="y-field-note warn" role="status">{{ voiceBrowserWarning }}</small>
          </div>
          <label v-if="speechAvailable" class="y-switch quiet">
            <span>
              <b>{{ t('settings.listenFirst') }}</b>
              <small>{{ t('settings.listenFirstHelp') }}</small>
            </span>
            <span class="y-toggle"><input v-model="languageDraft.learning.listenFirst" type="checkbox" name="listenFirst" /><i aria-hidden="true"></i></span>
          </label>
          <label class="y-switch quiet">
            <span>
              <b>{{ t('settings.reviewInConversation') }}</b>
              <small>{{ t('settings.reviewInConversationHelp') }}</small>
            </span>
            <span class="y-toggle"><input v-model="languageDraft.learning.reviewInConversation" type="checkbox" name="reviewInConversation" /><i aria-hidden="true"></i></span>
          </label>
          <footer class="y-pane-foot"><button type="button" class="y-btn primary" :disabled="!languageDirty" @click="saveLanguagePreferences">{{ t('settings.savePreferences') }}</button></footer>
        </section>

        <section v-else-if="tab === 'models'" key="models" class="y-pane y-models">
          <div v-if="modelRequired" class="y-notice warn" role="alert">
            <b>{{ t('settings.modelRequiredTitle') }}</b>
            <p>{{ t('settings.modelRequiredBody') }}</p>
          </div>
          <div v-if="regionNote" class="y-notice" role="note"><p>{{ t('settings.regionNote') }}</p></div>
          <div class="y-pair">
            <div class="y-field">
              <label class="y-label" for="st-default">{{ t('settings.defaultProvider') }}</label>
              <select id="st-default" v-model="defaultProvider" class="y-input y-select" @change="saveDefaultProvider">
                <option v-for="p in selectableProviders" :key="p.id" :value="p.id">{{ providerName(p) }} · {{ p.model }}</option>
                <option v-if="!selectableProviders.length" disabled value="">{{ t('settings.noQualifiedModels') }}</option>
              </select>
            </div>
            <div class="y-field">
              <label class="y-label" for="st-review">{{ t('settings.reviewProvider') }}</label>
              <select id="st-review" v-model="reviewProvider" v-tip="t('settings.reviewHelp')" class="y-input y-select" @change="saveReviewProvider">
                <option value="">{{ t('settings.reviewSame') }}</option>
                <option v-if="reviewProvider && !selectableProviders.some((p) => p.id === reviewProvider)" :value="reviewProvider">{{ t('settings.reviewSame') }}</option>
                <option v-for="p in selectableProviders" :key="p.id" :value="p.id">{{ providerName(p) }} · {{ p.model }}</option>
              </select>
            </div>
          </div>

          <ul class="y-rows y-providers">
            <li v-for="provider in providerDrafts" :key="provider.id" class="y-provider y-fold" :class="{ open: openProvider === provider.id }">
              <button type="button" class="y-row" :class="{ on: openProvider === provider.id }" :aria-expanded="openProvider === provider.id" @click="toggleProvider(provider.id)">
                <Icon name="chevron" :size="13" :weight="2.2" class="turn" />
                <b>{{ providerName(provider) }}</b>
                <span>{{ provider.model }}</span>
                <em class="y-tag" :class="{ accent: ready(provider) }">{{ providerStatus(provider) }}</em>
              </button>
              <div class="y-fold-body"><div :inert="openProvider !== provider.id">
                <div class="y-provider-body">
                  <div class="y-field">
                    <label class="y-label" :for="`model-${provider.id}`">{{ t('settings.modelName') }}</label>
                    <template v-if="provider.id === 'custom'">
                      <input :id="`model-${provider.id}`" class="y-input" type="text" :value="provider.model" :list="`models-${provider.id}`" autocomplete="off" spellcheck="false" @change="typeModel(provider, ($event.target as HTMLInputElement).value)" />
                      <datalist :id="`models-${provider.id}`"><option v-for="model in availableModels[provider.id] || []" :key="model.id" :value="model.id"></option></datalist>
                    </template>
                    <select v-else :id="`model-${provider.id}`" class="y-input y-select" :value="provider.model" :disabled="!hasModelList(provider)" @change="activateModel(provider, ($event.target as HTMLSelectElement).value)">
                      <option v-if="!provider.model" disabled value="">{{ t('settings.chooseModel') }}</option>
                      <option v-if="provider.model && !currentModelIsOfficial(provider)" disabled :value="provider.model">{{ provider.model }}</option>
                      <option v-for="model in availableModels[provider.id] || []" :key="model.id" :value="model.id">{{ modelLabel(model) }}</option>
                    </select>
                    <small v-if="modelsLoaded(provider) && !hasModelList(provider)" class="y-field-note">{{ t('settings.noModels') }}</small>
                    <small v-if="estimateText(provider)" class="y-field-note">{{ estimateText(provider) }}</small>
                  </div>
                  <div v-if="provider.apiKeySecret" class="y-field">
                    <label class="y-label" :for="`api-key-${provider.id}`">{{ t('settings.apiKey') }}<em v-if="provider.hasApiKey" class="y-tag">{{ t('settings.keySaved') }}</em></label>
                    <input :id="`api-key-${provider.id}`" v-model="keys[provider.id]" class="y-input" type="password" :placeholder="provider.hasApiKey ? '••••••••' : ''" autocomplete="new-password" @input="invalidateProvider(provider.id)" />
                  </div>

                  <button type="button" class="y-link" :aria-expanded="budgets" @click="budgets = !budgets">{{ t('nav.more') }}<Icon name="chevron" :size="12" :weight="2.2" class="turn" /></button>
                  <div class="y-fold" :class="{ open: budgets }">
                    <div class="y-fold-body"><div :inert="!budgets">
                      <div class="y-pair">
                        <div class="y-field">
                          <label class="y-label" :for="`context-${provider.id}`">{{ t('settings.contextBudget') }}</label>
                          <input :id="`context-${provider.id}`" v-model.number="provider.contextWindowTokens" class="y-input" type="number" min="4096" step="1024" @input="updateActiveModelProfile(provider)" />
                        </div>
                        <div class="y-field">
                          <label class="y-label" :for="`output-${provider.id}`">{{ t('settings.outputBudget') }}</label>
                          <input :id="`output-${provider.id}`" v-model.number="provider.maxOutputTokens" class="y-input" type="number" min="256" step="128" @input="updateActiveModelProfile(provider)" />
                        </div>
                      </div>
                      <div v-if="priceDrafts[provider.id]" class="y-price">
                        <div class="y-pair">
                          <div class="y-field">
                            <label class="y-label" :for="`price-in-${provider.id}`">{{ t('usage.priceInput') }}</label>
                            <input :id="`price-in-${provider.id}`" v-model="priceDrafts[provider.id].input" class="y-input" type="number" min="0" step="0.01" inputmode="decimal" />
                          </div>
                          <div class="y-field">
                            <label class="y-label" :for="`price-out-${provider.id}`">{{ t('usage.priceOutput') }}</label>
                            <input :id="`price-out-${provider.id}`" v-model="priceDrafts[provider.id].output" class="y-input" type="number" min="0" step="0.01" inputmode="decimal" />
                          </div>
                        </div>
                        <div class="y-price-foot">
                          <small class="y-field-note">{{ t('usage.priceHelp') }}</small>
                          <button type="button" class="y-btn sm" :disabled="!priceChanged(provider.id) || savingPrice === provider.id" @click="savePrice(provider)">{{ t('usage.priceSave') }}</button>
                        </div>
                      </div>
                    </div></div>
                  </div>

                  <p v-if="result[provider.id]" class="y-result" :class="{ success: result[provider.id]?.startsWith('✓') }" role="status" aria-live="polite">{{ result[provider.id] }}</p>
                  <footer>
                    <button v-if="provider.hasApiKey" type="button" class="y-link danger" :disabled="clearingKey === provider.id || savingProvider === provider.id || testing === provider.id" @click="deleteProviderKey(provider)">{{ clearingKey === provider.id ? t('settings.deletingKey') : t('settings.deleteKey') }}</button>
                    <button type="button" class="y-btn sm push" :disabled="loadingModels === provider.id || savingProvider === provider.id || testing === provider.id" @click="loadModels(provider)">{{ loadingModels === provider.id ? t('settings.loadingModels') : t('settings.refreshModels') }}</button>
                    <button type="button" class="y-btn sm" :disabled="testing === provider.id || savingProvider === provider.id" @click="test(provider)">{{ testing === provider.id ? t('settings.testing') : t('settings.testDialogue') }}</button>
                    <button type="button" class="y-btn primary sm" :disabled="savingProvider === provider.id || testing === provider.id || !providerHasChanges(provider)" @click="saveProvider(provider)">{{ savingProvider === provider.id ? t('settings.validating') : t('common.save') }}</button>
                  </footer>
                </div>
              </div></div>
            </li>
          </ul>
          <Fold :title="t('settings.customTitle')">
            <template #head><em v-if="customSaved" class="y-tag">{{ customSaved.name }}</em></template>
            <div class="y-fold-in">
              <div class="y-pair">
                <div class="y-field">
                  <label class="y-label" for="custom-name">{{ t('settings.customName') }}</label>
                  <input id="custom-name" v-model="customDraft.name" class="y-input" type="text" maxlength="60" autocomplete="off" />
                </div>
                <div class="y-field">
                  <label class="y-label" for="custom-url">{{ t('settings.customUrl') }}</label>
                  <input id="custom-url" v-model="customDraft.baseUrl" class="y-input" type="url" placeholder="https://example.com/v1" autocomplete="off" spellcheck="false" />
                </div>
              </div>
              <small class="y-field-note">{{ t('settings.customHelp') }}</small>
              <small v-if="customSaved" class="y-field-note">{{ t('settings.customChange') }}</small>
              <p v-if="customError" class="y-error" role="alert">{{ customError }}</p>
              <footer class="y-fold-foot">
                <button v-if="customSaved" type="button" class="y-link danger" :disabled="savingCustom" @click="removeCustomEndpoint">{{ t('settings.customRemove') }}</button>
                <button type="button" class="y-btn primary sm push" :disabled="!customDirty || savingCustom" @click="saveCustomEndpoint">{{ t('common.save') }}</button>
              </footer>
            </div>
          </Fold>
        </section>

        <section v-else-if="tab === 'usage'" key="usage" class="y-pane y-spend">
          <p v-if="usageFailed && !usage" class="y-error" role="alert">{{ t('common.operationFailed') }}</p>
          <template v-else-if="usage">
            <div v-if="usage.overLimit" class="y-notice warn" role="status"><b>{{ t('usage.over', { limit: cost(usage.limit || 0) }) }}</b></div>
            <div class="y-usage-top">
              <span>{{ usageMonth }}</span>
              <b>{{ cost(usage.month.cost) }}</b>
              <small>{{ t('usage.requests', { count: usage.month.requests }) }} · {{ t('usage.lastMonth', { cost: cost(usage.previous.cost) }) }}</small>
            </div>
            <template v-if="usageTasks.length">
              <div class="y-usage-part">
                <h2 class="y-h2">{{ t('usage.byTask') }}</h2>
                <ul class="y-usage-list">
                  <li v-for="item in usageTasks" :key="item.task"><span>{{ item.name }}</span><small>{{ t('usage.requests', { count: item.requests }) }}</small><b>{{ cost(item.cost) }}</b></li>
                </ul>
              </div>
              <div class="y-usage-part">
                <h2 class="y-h2">{{ t('usage.byModel') }}</h2>
                <ul class="y-usage-list">
                  <li v-for="item in usageModels" :key="`${item.providerId}/${item.model}`"><span>{{ item.name }}</span><small>{{ t('usage.requests', { count: item.requests }) }}</small><b>{{ item.priced ? cost(item.cost) : t('usage.unpriced') }}</b></li>
                </ul>
                <small v-if="usage.month.unpriced" class="y-field-note">{{ t('usage.unpricedNote') }}</small>
              </div>
            </template>
            <p v-else class="y-recap-note">{{ t('usage.none') }}</p>
            <div class="y-field">
              <label class="y-label" for="usage-limit">{{ t('usage.limit') }}</label>
              <div class="y-inline">
                <input id="usage-limit" v-model="limitDraft" class="y-input" type="number" min="0" step="1" inputmode="decimal" />
                <button type="button" class="y-btn sm" :disabled="!limitDirty || savingLimit" @click="saveLimit">{{ t('common.save') }}</button>
              </div>
              <small class="y-field-note">{{ t('usage.limitHelp') }}</small>
            </div>
            <small class="y-field-note">{{ t('usage.basis', { date: usage.pricesUpdated }) }}</small>
          </template>
        </section>

        <section v-else-if="tab === 'web'" key="web" class="y-pane">
          <label class="y-switch" :class="{ off: !store.settings.webLookupReady }">
            <span>
              <b>{{ t('settings.webToggle') }}</b>
              <small v-if="!store.settings.webLookupReady">{{ t('settings.webNeedsCurrentModel') }}</small>
            </span>
            <span class="y-toggle"><input v-model="webLookupEnabled" type="checkbox" :disabled="!store.settings.webLookupReady" /><i aria-hidden="true"></i></span>
          </label>
          <footer class="y-pane-foot"><button type="button" class="y-btn primary" :disabled="!webLookupDirty" @click="saveWebLookup">{{ t('common.save') }}</button></footer>
        </section>

        <section v-else key="data" class="y-pane y-data">
          <label class="y-switch y-tidy">
            <span>
              <b>{{ t('settings.memoryTidy') }}</b>
              <small>{{ t('settings.memoryTidyHelp') }}</small>
            </span>
            <span class="y-toggle"><input v-model="memoryTidyEnabled" type="checkbox" @change="saveMemoryTidy" /><i aria-hidden="true"></i></span>
          </label>
          <Fold :title="t('settings.remoteTitle')">
            <template #head><em class="y-tag" :class="{ accent: remote?.active }">{{ remote?.active ? t('settings.running') : t('settings.localMode') }}</em></template>
            <div class="y-remote">
              <template v-if="remote?.active">
                <a class="y-url" :href="remote.url" target="_blank" rel="noreferrer"><Icon name="link" :size="13" /><span>{{ remote.url }}</span></a>
                <p>{{ t('settings.allowedEmail', { emails: remote.allowedEmails?.join(', ') }) }}</p>
                <p class="warn">{{ t('settings.remoteWarning') }}</p>
                <div class="y-remote-acts">
                  <button type="button" class="y-btn sm" @click="copyRemoteUrl">{{ t('settings.copyUrl') }}</button>
                  <button type="button" class="y-btn sm" :disabled="loadingRemote" @click="loadRemote">{{ t('settings.refresh') }}</button>
                </div>
              </template>
              <template v-else>
                <p>{{ t('settings.remoteStart') }}</p>
                <code>npm run app -- remote start</code>
                <div class="y-remote-acts"><button type="button" class="y-btn sm" :disabled="loadingRemote" @click="loadRemote">{{ t('settings.refreshStatus') }}</button></div>
              </template>
            </div>
          </Fold>
          <Fold :title="t('profiles.title')" :count="profiles.length > 1 ? profiles.length : undefined">
            <div class="y-fold-in">
              <ul class="y-profiles">
                <li v-for="profile in profiles" :key="profile.id">
                  <template v-if="renaming === profile.id">
                    <input v-model="renameDraft" class="y-input" type="text" maxlength="40" :aria-label="t('profiles.name')" @keydown.enter="saveRename" />
                    <button type="button" class="y-btn sm" :disabled="!renameDraft.trim() || profileBusy === profile.id" @click="saveRename">{{ t('common.save') }}</button>
                    <button type="button" class="y-link" @click="renaming = ''">{{ t('common.cancel') }}</button>
                  </template>
                  <template v-else>
                    <b :title="profileName(profile)">{{ profileName(profile) }}</b>
                    <span>{{ profileLanguage(profile) }}</span>
                    <em v-if="profile.active" class="y-tag accent">{{ t('profiles.active') }}</em>
                    <button v-else v-tip="t('profiles.switchTip')" type="button" class="y-btn sm" :disabled="Boolean(profileBusy)" @click="switchProfile(profile)">{{ t('profiles.switch') }}</button>
                    <button v-tip="t('profiles.rename')" type="button" class="y-ic" :aria-label="t('profiles.rename')" @click="startRename(profile)"><Icon name="edit" :size="14" :weight="2" /></button>
                    <button v-if="!profile.active" v-tip="t('common.delete')" type="button" class="y-ic" :aria-label="t('common.delete')" @click="removingProfile = profile"><Icon name="trash" :size="14" :weight="2" /></button>
                  </template>
                </li>
              </ul>
              <div v-if="profiles.length < maxProfiles" class="y-inline">
                <input v-model="newProfileName" class="y-input" type="text" maxlength="40" :placeholder="t('profiles.name')" :aria-label="t('profiles.name')" @keydown.enter="addProfile" />
                <button type="button" class="y-btn sm" :disabled="!newProfileName.trim() || Boolean(profileBusy)" @click="addProfile">{{ t('profiles.add') }}</button>
              </div>
              <p v-if="profileError" class="y-error" role="alert">{{ profileError }}</p>
              <small class="y-field-note">{{ t('profiles.help') }}</small>
            </div>
          </Fold>
          <Fold v-if="lan" :title="t('lan.title')">
            <template #head><em class="y-tag" :class="{ accent: lan.listening }">{{ lan.listening ? t('settings.running') : t('lan.off') }}</em></template>
            <div class="y-fold-in">
              <label class="y-switch quiet">
                <span>
                  <b>{{ t('lan.toggle') }}</b>
                  <small>{{ t('lan.toggleHelp') }}</small>
                </span>
                <span class="y-toggle"><input type="checkbox" name="lan" :checked="lan.enabled" :disabled="lanBusy" @change="setLan(($event.target as HTMLInputElement).checked)" /><i aria-hidden="true"></i></span>
              </label>
              <small v-if="lanRestart" class="y-field-note warn" role="status">{{ t('lan.restart') }}</small>
              <template v-if="lan.enabled">
                <ul class="y-lan">
                  <li v-for="address in lan.addresses" :key="address"><span>{{ t('lan.address') }}</span><b class="mono">{{ address }}</b><button type="button" class="y-link" @click="copyText(address)">{{ t('lan.copy') }}</button></li>
                  <li><span>{{ t('lan.code') }}</span><b class="mono">{{ lan.code }}</b><button v-tip="t('lan.newCodeTip')" type="button" class="y-link" :disabled="lanBusy" @click="renewLanCode">{{ t('lan.newCode') }}</button></li>
                </ul>
                <small v-if="!lan.addresses.length" class="y-field-note warn">{{ t('lan.noAddress') }}</small>
                <small class="y-field-note">{{ t('lan.note') }}</small>
              </template>
            </div>
          </Fold>
          <Fold :title="t('settings.currentConfig')">
            <dl class="y-facts">
              <div><dt>{{ t('settings.interfaceShort') }}</dt><dd>{{ LOCALE_META[store.settings.ui.locale].nativeName }}</dd></div>
              <div><dt>{{ t('settings.targetShort') }}</dt><dd>{{ displayTargetLanguage(store.settings.learning.targetLanguageCode, locale) }}</dd></div>
              <div><dt>{{ t('settings.level') }}</dt><dd>{{ savedLevel() || store.settings.learning.proficiency }}</dd></div>
              <div><dt>{{ t('settings.providerShort') }}</dt><dd>{{ currentProviderName }}</dd></div>
              <div><dt>{{ t('settings.localDatabase') }}</dt><dd class="mono">data/app.db</dd></div>
              <div><dt>{{ t('settings.appConfig') }}</dt><dd class="mono">data/config.json</dd></div>
              <div><dt>{{ t('settings.secretFile') }}</dt><dd class="mono">data/secrets.json · 0600</dd></div>
            </dl>
          </Fold>
          <Fold :title="t('credits.title')">
            <div class="y-fold-in y-credits">
              <p>{{ t('credits.wordfreq') }} <a href="https://github.com/rspeer/wordfreq" target="_blank" rel="noreferrer">wordfreq 3.1.1 · Robyn Speer</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a></p>
              <p>{{ t('credits.prices') }} <a href="https://github.com/BerriAI/litellm" target="_blank" rel="noreferrer">LiteLLM · Berri AI</a> · MIT</p>
            </div>
          </Fold>
          <div class="y-act-row">
            <b>{{ t('settings.exportTitle') }}</b>
            <button type="button" class="y-btn sm" @click="downloadBackup"><Icon name="download" :size="13" />{{ t('settings.downloadBackup') }}</button>
          </div>
          <div class="y-act-row">
            <b>{{ t('settings.resetTitle') }}</b>
            <button type="button" class="y-btn sm danger" @click="confirmReset = true">{{ t('settings.resetButton') }}</button>
          </div>
        </section>
      </Transition>

      <Transition name="y-veil">
        <div v-if="confirmReset" class="y-veil" @click.self="confirmReset = false">
          <section class="y-dialog" role="alertdialog" aria-modal="true" :aria-label="t('settings.resetConfirmTitle')">
            <h2>{{ t('settings.resetConfirmTitle') }}</h2>
            <p>{{ t('settings.resetConfirmBody') }}</p>
            <footer>
              <button type="button" class="y-btn" :disabled="resetting" @click="confirmReset = false">{{ t('common.cancel') }}</button>
              <button type="button" class="y-btn danger" :disabled="resetting" @click="resetAllConfig">{{ resetting ? t('settings.resetting') : t('common.delete') }}</button>
            </footer>
          </section>
        </div>
      </Transition>

      <Transition name="y-veil">
        <div v-if="removingProfile" class="y-veil" @click.self="removingProfile = null">
          <section class="y-dialog" role="alertdialog" aria-modal="true" :aria-label="t('profiles.removeTitle', { name: profileName(removingProfile) })">
            <h2>{{ t('profiles.removeTitle', { name: profileName(removingProfile) }) }}</h2>
            <p>{{ t('profiles.removeBody') }}</p>
            <footer>
              <button type="button" class="y-btn" :disabled="Boolean(profileBusy)" @click="removingProfile = null">{{ t('common.cancel') }}</button>
              <button type="button" class="y-btn danger" :disabled="Boolean(profileBusy)" @click="removeProfile">{{ t('common.delete') }}</button>
            </footer>
          </section>
        </div>
      </Transition>
    </template>
  </div>
</template>
