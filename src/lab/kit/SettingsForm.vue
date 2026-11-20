<script setup lang="ts">
import { displayTargetLanguage, LOCALE_META, UI_LOCALES } from '../../../shared/locales'
import { MAX_SPEECH_RATE, MIN_SPEECH_RATE, SPEECH_RATE_STEP } from '../../../shared/speech'
import Icon from './Icon.vue'
import { useSettingsPage } from '../logic/SettingsPage'

/** The settings form itself. Structure is shared; every theme dresses the st-* classes its own way. */
const {
  tab, languageDraft, languageDirty, saveLanguagePreferences, setLanguage, languages, speechAvailable, speechRecommendationKey,
  displayedSpeechRate, displayedTargetLanguage, modelRequired, defaultProvider, saveDefaultProvider, selectableProviders,
  providerDrafts, providerName, providerStatus, savedCapabilityMatches, verified, providerSignature, hasModelList, modelsLoaded,
  currentModelIsOfficial, modelLabel, availableModels, activateModel, keys, invalidateProvider, updateActiveModelProfile, result,
  clearingKey, savingProvider, testing, loadingModels, deleteProviderKey, loadModels, test, saveProvider, providerHasChanges,
  webLookupEnabled, webLookupDirty, saveWebLookup, currentProviderName, remote, loadingRemote, loadRemote, copyRemoteUrl,
  downloadBackup, confirmReset, resetting, resetAllConfig, store, t, locale,
} = useSettingsPage()

const tabs = [
  { id: 'language', icon: 'language', key: 'settings.tabLanguage' },
  { id: 'models', icon: 'plug', key: 'settings.tabModels' },
  { id: 'web', icon: 'globe', key: 'settings.tabWeb' },
  { id: 'data', icon: 'lock', key: 'settings.tabData' },
] as const
const levels = ['A2', 'B1', 'B2', 'C1'] as const
const corrections = [
  { id: 'light', key: 'settings.correctionLight' },
  { id: 'balanced', key: 'settings.correctionBalanced' },
  { id: 'intensive', key: 'settings.correctionIntensive' },
] as const
</script>

<template>
  <div v-if="store.settings" class="st">
    <nav class="st-nav">
      <button v-for="item in tabs" :key="item.id" type="button" :class="{ on: tab === item.id }" :aria-pressed="tab === item.id" @click="tab = item.id">
        <Icon :name="item.icon" :size="17" /><span>{{ t(item.key) }}</span>
      </button>
    </nav>

    <div class="st-body">
      <Transition name="st-pane" mode="out-in">
        <section v-if="tab === 'language'" key="language" class="st-pane">
          <div class="st-grid">
            <div class="st-field">
              <label for="st-ui">{{ t('settings.interfaceLanguage') }}</label>
              <select id="st-ui" v-model="languageDraft.ui.locale" class="st-select">
                <option v-for="code in UI_LOCALES" :key="code" :value="code">{{ LOCALE_META[code].nativeName }}</option>
              </select>
            </div>
            <div class="st-field">
              <label for="st-target">{{ t('settings.targetLanguage') }}</label>
              <select id="st-target" class="st-select" :value="languageDraft.learning.targetLanguageCode" @change="setLanguage(($event.target as HTMLSelectElement).value)">
                <option v-for="item in languages" :key="item.code" :value="item.code">{{ displayTargetLanguage(item.code, locale) }}</option>
              </select>
            </div>
          </div>
          <div class="st-field">
            <span class="st-label">{{ t('settings.level') }}</span>
            <div class="st-choice" role="group" :aria-label="t('settings.level')">
              <button v-for="level in levels" :key="level" type="button" :aria-pressed="languageDraft.learning.proficiency === level" @click="languageDraft.learning.proficiency = level">{{ level }}</button>
            </div>
          </div>
          <div class="st-field">
            <span class="st-label">{{ t('settings.correction') }}</span>
            <div class="st-options" role="group" :aria-label="t('settings.correction')">
              <button v-for="item in corrections" :key="item.id" type="button" :aria-pressed="languageDraft.learning.correctionLevel === item.id" @click="languageDraft.learning.correctionLevel = item.id"><i aria-hidden="true"></i>{{ t(item.key) }}</button>
            </div>
          </div>
          <section class="st-block" aria-labelledby="st-speech">
            <h3 id="st-speech">{{ t('settings.pronunciationTitle') }}</h3>
            <div v-if="speechAvailable" class="st-field">
              <div class="st-row">
                <label for="speech-rate">{{ t('settings.speechRate') }}</label>
                <output for="speech-rate">{{ displayedSpeechRate }}×</output>
              </div>
              <input
                id="speech-rate"
                v-model.number="languageDraft.learning.speechRate"
                class="st-range"
                name="speechRate"
                type="range"
                :min="MIN_SPEECH_RATE"
                :max="MAX_SPEECH_RATE"
                :step="SPEECH_RATE_STEP"
                :aria-valuetext="t('settings.speechRateValue', { rate: displayedSpeechRate })"
                :style="{ '--fill': `${((Number(displayedSpeechRate) - MIN_SPEECH_RATE) / (MAX_SPEECH_RATE - MIN_SPEECH_RATE)) * 100}%` }"
              />
              <div class="st-scale" aria-hidden="true"><span>{{ t('settings.speechSlower') }}</span><span>{{ t('settings.speechFaster') }}</span></div>
            </div>
            <div v-else class="st-note" role="status">
              <p>{{ t('settings.speechUnavailable', { language: displayedTargetLanguage }) }}</p>
              <p>{{ t(speechRecommendationKey) }}</p>
            </div>
          </section>
          <footer class="st-foot"><button type="button" class="st-btn primary" :disabled="!languageDirty" @click="saveLanguagePreferences">{{ t('settings.savePreferences') }}</button></footer>
        </section>

        <section v-else-if="tab === 'models'" key="models" class="st-pane">
          <div v-if="modelRequired" class="st-alert" role="alert">
            <h2>{{ t('settings.modelRequiredTitle') }}</h2>
            <p>{{ t('settings.modelRequiredBody') }}</p>
          </div>
          <p class="st-note">{{ t('settings.modelsBody') }}</p>
          <div class="st-field">
            <label for="st-default">{{ t('settings.defaultProvider') }}</label>
            <select id="st-default" v-model="defaultProvider" class="st-select" @change="saveDefaultProvider">
              <option v-for="p in selectableProviders" :key="p.id" :value="p.id">{{ providerName(p) }} · {{ p.model }}</option>
              <option v-if="!selectableProviders.length" disabled value="">{{ t('settings.noQualifiedModels') }}</option>
            </select>
          </div>
          <article v-for="provider in providerDrafts" :key="provider.id" class="st-provider" :class="{ ready: savedCapabilityMatches(provider) || verified[provider.id] === providerSignature(provider) }">
            <header>
              <i class="st-logo" aria-hidden="true">{{ provider.id.slice(0, 2).toUpperCase() }}</i>
              <div>
                <h3>{{ providerName(provider) }}</h3>
                <span>{{ t('settings.officialDirect') }}<template v-if="provider.hasApiKey"> · {{ t('settings.keySaved') }}</template></span>
              </div>
              <em class="st-state" :class="{ ready: savedCapabilityMatches(provider) || verified[provider.id] === providerSignature(provider) }">{{ providerStatus(provider) }}</em>
            </header>
            <div class="st-grid">
              <div class="st-field wide">
                <label :for="`model-${provider.id}`">{{ t('settings.modelName') }}</label>
                <select :id="`model-${provider.id}`" class="st-select" :value="provider.model" :disabled="!hasModelList(provider)" @change="activateModel(provider, ($event.target as HTMLSelectElement).value)">
                  <option v-if="!provider.model" disabled value="">{{ t('settings.chooseModel') }}</option>
                  <option v-if="provider.model && !currentModelIsOfficial(provider)" disabled :value="provider.model">{{ provider.model }}</option>
                  <option v-for="model in availableModels[provider.id] || []" :key="model.id" :value="model.id">{{ modelLabel(model) }}</option>
                </select>
                <small>{{ modelsLoaded(provider) ? (hasModelList(provider) ? t('settings.modelListHelp', { count: availableModels[provider.id].length }) : t('settings.noModels')) : t('settings.modelDiscoveryHelp') }}</small>
              </div>
              <div v-if="provider.apiKeySecret" class="st-field wide">
                <label :for="`api-key-${provider.id}`">{{ t('settings.apiKey') }}</label>
                <input :id="`api-key-${provider.id}`" v-model="keys[provider.id]" class="st-input" type="password" :placeholder="provider.hasApiKey ? '••••••••  ' + t('settings.keepKey') : 'sk-…'" autocomplete="new-password" @input="invalidateProvider(provider.id)" />
              </div>
              <div class="st-field">
                <label :for="`context-${provider.id}`">{{ t('settings.contextBudget') }}</label>
                <input :id="`context-${provider.id}`" v-model.number="provider.contextWindowTokens" class="st-input" type="number" min="4096" step="1024" @input="updateActiveModelProfile(provider)" />
              </div>
              <div class="st-field">
                <label :for="`output-${provider.id}`">{{ t('settings.outputBudget') }}</label>
                <input :id="`output-${provider.id}`" v-model.number="provider.maxOutputTokens" class="st-input" type="number" min="256" step="128" @input="updateActiveModelProfile(provider)" />
              </div>
            </div>
            <footer>
              <span class="st-result" :class="{ success: result[provider.id]?.startsWith('✓') }" role="status" aria-live="polite">{{ result[provider.id] }}</span>
              <div class="st-actions">
                <button v-if="provider.hasApiKey" type="button" class="st-btn danger" :disabled="clearingKey === provider.id || savingProvider === provider.id || testing === provider.id" @click="deleteProviderKey(provider)">{{ clearingKey === provider.id ? t('settings.deletingKey') : t('settings.deleteKey') }}</button>
                <button type="button" class="st-btn" :disabled="loadingModels === provider.id || savingProvider === provider.id || testing === provider.id" @click="loadModels(provider)">{{ loadingModels === provider.id ? t('settings.loadingModels') : t('settings.refreshModels') }}</button>
                <button type="button" class="st-btn" :disabled="testing === provider.id || savingProvider === provider.id" @click="test(provider)">{{ testing === provider.id ? t('settings.testing') : t('settings.testDialogue') }}</button>
                <button type="button" class="st-btn primary" :disabled="savingProvider === provider.id || testing === provider.id || !providerHasChanges(provider)" @click="saveProvider(provider)">{{ savingProvider === provider.id ? t('settings.validating') : t('common.save') }}</button>
              </div>
            </footer>
          </article>
        </section>

        <section v-else-if="tab === 'web'" key="web" class="st-pane">
          <p class="st-note">{{ t('settings.webHelp') }}</p>
          <label class="st-switch" :class="{ off: !store.settings.webLookupReady }">
            <span>
              <b>{{ t('settings.webToggle') }}</b>
              <small v-if="!store.settings.webLookupReady">{{ t('settings.webNeedsCurrentModel') }}</small>
            </span>
            <span class="st-toggle"><input v-model="webLookupEnabled" type="checkbox" :disabled="!store.settings.webLookupReady" /><i aria-hidden="true"></i></span>
          </label>
          <p class="st-note quiet">{{ t('settings.webExplicitLocation') }}</p>
          <footer class="st-foot"><button type="button" class="st-btn primary" :disabled="!webLookupDirty" @click="saveWebLookup">{{ t('common.save') }}</button></footer>
        </section>

        <section v-else key="data" class="st-pane">
          <p class="st-note">{{ t('settings.dataBody') }}</p>
          <dl class="st-facts" :aria-label="t('settings.currentConfig')">
            <div><dt>{{ t('settings.interfaceShort') }}</dt><dd>{{ LOCALE_META[store.settings.ui.locale].nativeName }}</dd></div>
            <div><dt>{{ t('settings.targetShort') }}</dt><dd>{{ displayTargetLanguage(store.settings.learning.targetLanguageCode, locale) }}</dd></div>
            <div><dt>{{ t('settings.level') }}</dt><dd>{{ store.settings.learning.proficiency }}</dd></div>
            <div><dt>{{ t('settings.providerShort') }}</dt><dd>{{ currentProviderName }}</dd></div>
          </dl>
          <dl class="st-files">
            <div><dt>{{ t('settings.localDatabase') }}</dt><dd>data/app.db</dd></div>
            <div><dt>{{ t('settings.appConfig') }}</dt><dd>data/config.json</dd></div>
            <div><dt>{{ t('settings.secretFile') }}</dt><dd>data/secrets.json · 0600</dd></div>
          </dl>
          <article class="st-remote" :class="{ active: remote?.active }">
            <header>
              <Icon name="phone" :size="18" />
              <h3>{{ t('settings.remoteTitle') }}</h3>
              <em class="st-state" :class="{ ready: remote?.active }">{{ remote?.active ? t('settings.running') : t('settings.localMode') }}</em>
            </header>
            <template v-if="remote?.active">
              <a class="st-url" :href="remote.url" target="_blank" rel="noreferrer"><Icon name="link" :size="15" /><span>{{ remote.url }}</span></a>
              <p>{{ t('settings.allowedEmail', { emails: remote.allowedEmails?.join(', ') }) }}</p>
              <p class="st-warn">{{ t('settings.remoteWarning') }}</p>
              <div class="st-actions">
                <button type="button" class="st-btn" @click="copyRemoteUrl">{{ t('settings.copyUrl') }}</button>
                <button type="button" class="st-btn" :disabled="loadingRemote" @click="loadRemote">{{ t('settings.refresh') }}</button>
              </div>
            </template>
            <template v-else>
              <p>{{ t('settings.remoteStart') }}</p>
              <code>npm run app -- remote start</code>
              <div class="st-actions"><button type="button" class="st-btn" :disabled="loadingRemote" @click="loadRemote">{{ t('settings.refreshStatus') }}</button></div>
            </template>
          </article>
          <section class="st-block">
            <h3>{{ t('settings.exportTitle') }}</h3>
            <p>{{ t('settings.exportBody') }}</p>
            <button type="button" class="st-btn" @click="downloadBackup"><Icon name="download" :size="15" />{{ t('settings.downloadBackup') }}</button>
          </section>
          <section class="st-block danger">
            <h3>{{ t('settings.resetTitle') }}</h3>
            <p>{{ t('settings.resetBody') }}</p>
            <button type="button" class="st-btn danger" @click="confirmReset = true">{{ t('settings.resetButton') }}</button>
          </section>
        </section>
      </Transition>
    </div>

    <div v-if="confirmReset" class="st-veil" @click.self="confirmReset = false">
      <section class="st-dialog" role="alertdialog" aria-modal="true" :aria-label="t('settings.resetConfirmTitle')">
        <h2>{{ t('settings.resetConfirmTitle') }}</h2>
        <p>{{ t('settings.resetConfirmBody') }}</p>
        <footer>
          <button type="button" class="st-btn" :disabled="resetting" @click="confirmReset = false">{{ t('common.cancel') }}</button>
          <button type="button" class="st-btn danger solid" :disabled="resetting" @click="resetAllConfig">{{ resetting ? t('settings.resetting') : t('common.delete') }}</button>
        </footer>
      </section>
    </div>
  </div>
</template>
