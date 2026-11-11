<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ApiError, api } from "../api";
import { useAppStore } from "../stores/app";
import AppIcon from "../components/AppIcon.vue";
import { displayTargetLanguage, LOCALE_META, TARGET_LANGUAGES, UI_LOCALES } from "../../shared/locales";
import { learningPreferencesKey, providerConfigurationKey } from "../form-state";
import { rememberProviderModelProfile, switchProviderModel } from "../model-profiles";
import type { Provider, Settings } from "../types";
type RemoteStatus = {
  active: boolean;
  url?: string;
  allowedEmails?: string[];
  startedAt?: string;
};
type ProviderCapability = {
  outputMode: "json_schema" | "json_object" | "prompt_json";
  baseUrl: string;
  model: string;
  conversationReady: true;
  lookupReady: true;
  contractVersion: number;
  testedAt: string;
};
type ProviderTestResult = {
  ok: boolean;
  message: string;
  model: string;
  capability: ProviderCapability;
  certificationToken: string;
};
const store = useAppStore();
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const requestedTab = typeof route.query.tab === "string" ? route.query.tab : "";
const tab = ref(["models", "web", "data"].includes(requestedTab) ? requestedTab : "language");
const testing = ref("");
const savingProvider = ref("");
const loadingModels = ref("");
const clearingKey = ref("");
const confirmReset = ref(false);
const resetting = ref(false);
const result = ref<Record<string, string>>({});
const verified = ref<Record<string, string>>({});
const testedCapability = ref<Record<string, ProviderCapability>>({});
const certificationTokens = ref<Record<string, string>>({});
const availableModels = ref<Record<string, string[]>>({});
const manualModels = ref<Record<string, boolean>>({});
const modelBeforeEdit = ref<Record<string, string>>({});
const keys = ref<Record<string, string>>({});
const providerDrafts = ref<Provider[]>([]);
const providerBaselines = ref<Record<string, string>>({});
const defaultProvider = ref("");
const webLookupEnabled = ref(false);
const languageDraft = reactive<Pick<Settings, "ui" | "learning">>({
  ui: { locale: "zh-CN" },
  learning: {
    targetLanguage: "English",
    targetLanguageCode: "en",
    proficiency: "B2",
    correctionLevel: "balanced",
  },
});
const languageBaseline = ref("");
const remote = ref<RemoteStatus | null>(null);
const loadingRemote = ref(false);
const modelRequired = computed(() => route.query.reason === "model-required");
const languageDirty = computed(
  () => learningPreferencesKey(languageDraft) !== languageBaseline.value,
);
const webLookupDirty = computed(
  () => Boolean(store.settings && webLookupEnabled.value !== store.settings.webLookup.enabled),
);
const currentProviderName = computed(() => {
  const id = store.settings?.llm.defaultProvider;
  return store.settings?.providers.find((provider) => provider.id === id)?.name || "";
});
const selectableProviders = computed(() =>
  providerDrafts.value.filter((provider) => provider.capabilityReady && provider.hasApiKey),
);
const languages = TARGET_LANGUAGES;
function cloneValue<T>(value: T): T {
  return structuredClone(toRaw(value));
}
function prepareProviderDraft(provider: Provider) {
  const draft = cloneValue(provider);
  draft.modelProfiles = { ...(draft.modelProfiles || {}) };
  if (draft.model.trim() && !draft.modelProfiles[draft.model.trim()]) {
    draft.modelProfiles[draft.model.trim()] = {
      contextWindowTokens: draft.contextWindowTokens,
      maxOutputTokens: draft.maxOutputTokens,
    };
  }
  return draft;
}
function syncLanguageDraft() {
  if (!store.settings) return;
  Object.assign(languageDraft.ui, store.settings.ui);
  Object.assign(languageDraft.learning, store.settings.learning);
  languageBaseline.value = learningPreferencesKey(languageDraft);
}
function syncProviderDraft(id: string) {
  const fresh = store.settings?.providers.find((item) => item.id === id);
  if (!fresh) return;
  const index = providerDrafts.value.findIndex((item) => item.id === id);
  const draft = prepareProviderDraft(fresh);
  if (index === -1) providerDrafts.value.push(draft);
  else providerDrafts.value[index] = draft;
  providerBaselines.value[id] = providerConfigurationKey(draft);
}
function initializeDrafts() {
  if (!store.settings) return;
  syncLanguageDraft();
  defaultProvider.value = store.settings.llm.defaultProvider;
  webLookupEnabled.value = store.settings.webLookup.enabled;
  providerDrafts.value = store.settings.providers.map(prepareProviderDraft);
  providerBaselines.value = Object.fromEntries(
    providerDrafts.value.map((provider) => [
      provider.id,
      providerConfigurationKey(provider),
    ]),
  );
}
function safeReturnTo() {
  const value = route.query.returnTo;
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/";
}
async function continuePracticeIfReady() {
  if (modelRequired.value && store.settings?.modelReady)
    await router.replace(safeReturnTo());
}
async function saveLanguagePreferences() {
  if (!store.settings || !languageDirty.value) return;
  const next = cloneValue(store.settings);
  next.ui = { ...languageDraft.ui };
  next.learning = { ...languageDraft.learning };
  await store.save(next);
  syncLanguageDraft();
  await continuePracticeIfReady();
}
async function saveDefaultProvider() {
  if (
    !store.settings ||
    defaultProvider.value === store.settings.llm.defaultProvider
  )
    return;
  const next = cloneValue(store.settings);
  next.llm.defaultProvider = defaultProvider.value;
  await store.save(next);
  defaultProvider.value = store.settings.llm.defaultProvider;
  await continuePracticeIfReady();
}
function setLanguage(code: string) {
  const item = languages.find((language) => language.code === code)!;
  languageDraft.learning.targetLanguage = item.name;
  languageDraft.learning.targetLanguageCode = code;
}
function providerSignature(provider: any) {
  return JSON.stringify([
    provider.model?.trim(),
    keys.value[provider.id]?.trim() || "__saved_key__",
  ]);
}
function providerOverrides(provider: any) {
  const key = keys.value[provider.id]?.trim();
  return {
    model: provider.model.trim(),
    ...(key ? { apiKey: key } : {}),
  };
}
function rememberModelProfile(provider: Provider, model = provider.model) {
  rememberProviderModelProfile(provider, model);
}
function activateModel(provider: Provider, rawModel: string, previousModel = provider.model) {
  switchProviderModel(provider, rawModel, previousModel);
  invalidateProvider(provider.id);
}
function beginManualModelEdit(provider: Provider) {
  modelBeforeEdit.value[provider.id] = provider.model;
  rememberModelProfile(provider);
}
function finishManualModelEdit(provider: Provider) {
  const previousModel = modelBeforeEdit.value[provider.id] ?? provider.model;
  const nextModel = provider.model;
  delete modelBeforeEdit.value[provider.id];
  activateModel(provider, nextModel, previousModel);
}
function updateActiveModelProfile(provider: Provider) {
  rememberModelProfile(provider);
  invalidateProvider(provider.id);
}
function hasModelList(provider: Provider) {
  return Boolean(availableModels.value[provider.id]?.length);
}
function modelChoices(provider: Provider) {
  const current = provider.model.trim();
  const models = availableModels.value[provider.id] || [];
  return current && !models.includes(current) ? [current, ...models] : models;
}
function invalidateProvider(id: string) {
  delete verified.value[id];
  delete testedCapability.value[id];
  delete certificationTokens.value[id];
  result.value[id] = "";
}
function providerHasChanges(provider: Provider) {
  const configurationChanged =
    providerConfigurationKey(provider) !== providerBaselines.value[provider.id];
  const keyChanged = Boolean(keys.value[provider.id]?.trim());
  const hasFreshTest =
    verified.value[provider.id] === providerSignature(provider) &&
    Boolean(testedCapability.value[provider.id]);
  return configurationChanged || keyChanged || hasFreshTest;
}
function savedCapabilityMatches(provider: any) {
  const capability = provider.capability as ProviderCapability | undefined;
  return Boolean(
    capability &&
      provider.capabilityReady &&
      capability.conversationReady === true &&
      capability.model === provider.model?.trim() &&
      !keys.value[provider.id]?.trim(),
  );
}
function providerStatus(provider: any) {
  if (verified.value[provider.id] === providerSignature(provider))
    return t("settings.statusTested");
  if (savedCapabilityMatches(provider))
    return t("settings.statusVerified");
  if (provider.hasApiKey || (!provider.apiKeySecret && provider.enabled))
    return t("settings.statusTestRequired");
  return t("settings.statusNotSet");
}
function providerName(provider: any) {
  return provider.name;
}
async function saveWebLookup() {
  if (!store.settings || !webLookupDirty.value) return;
  if (webLookupEnabled.value && !store.settings.webLookupReady) {
    webLookupEnabled.value = false;
    store.notify(t("settings.webNeedsCurrentModel"));
    return;
  }
  const next = cloneValue(store.settings);
  next.webLookup.enabled = webLookupEnabled.value;
  await store.save(next);
  webLookupEnabled.value = store.settings.webLookup.enabled;
  store.notify(t("settings.webSaved"));
}
function friendlyError(error: unknown) {
  if (!(error instanceof ApiError))
    return t("common.operationFailed");
  const messages: Record<string, string> = {
    PROVIDER_AUTH_FAILED: "settings.errorAuth",
    PROVIDER_BALANCE_REQUIRED: "settings.errorBalance",
    PROVIDER_RATE_LIMITED: "settings.errorRate",
    PROVIDER_UNAVAILABLE: "settings.errorUnavailable",
    PROVIDER_TIMEOUT: "settings.errorTimeout",
    PROVIDER_NETWORK_ERROR: "settings.errorNetwork",
    PROVIDER_NOT_FOUND: "settings.errorNotFound",
    PROVIDER_INVALID_REQUEST: "settings.errorInvalidRequest",
    PROVIDER_LOOKUP_UNSUPPORTED: "settings.errorLookupUnsupported",
  };
  return error.code && messages[error.code] ? t(messages[error.code]) : t("common.operationFailed");
}
async function runProviderTest(provider: any) {
  testing.value = provider.id;
  result.value[provider.id] = "";
  try {
    const data = await api.post<ProviderTestResult>(
      `/providers/${provider.id}/test`,
      providerOverrides(provider),
    );
    if (!data.ok) throw new Error(data.message);
    verified.value[provider.id] = providerSignature(provider);
    testedCapability.value[provider.id] = data.capability;
    certificationTokens.value[provider.id] = data.certificationToken;
    result.value[provider.id] = "✓ " + t("settings.statusVerified");
    return true;
  } catch (error) {
    delete verified.value[provider.id];
    delete testedCapability.value[provider.id];
    delete certificationTokens.value[provider.id];
    result.value[provider.id] = "× " + friendlyError(error);
    return false;
  } finally {
    testing.value = "";
  }
}
async function saveProvider(provider: any) {
  if (
    savingProvider.value ||
    testing.value ||
    !providerHasChanges(provider)
  )
    return;
  savingProvider.value = provider.id;
  try {
    rememberModelProfile(provider);
    if (
      !savedCapabilityMatches(provider) &&
      verified.value[provider.id] !== providerSignature(provider) &&
      !(await runProviderTest(provider))
    )
      return;
    await api.put(`/providers/${provider.id}`, {
      ...providerOverrides(provider),
      enabled: true,
      contextWindowTokens: provider.contextWindowTokens,
      maxOutputTokens: provider.maxOutputTokens,
      modelProfiles: provider.modelProfiles,
      capability: testedCapability.value[provider.id] || provider.capability,
      certificationToken: certificationTokens.value[provider.id],
    });
    keys.value[provider.id] = "";
    delete verified.value[provider.id];
    delete testedCapability.value[provider.id];
    delete certificationTokens.value[provider.id];
    await store.load();
    syncProviderDraft(provider.id);
    defaultProvider.value = store.settings?.llm.defaultProvider || "";
    result.value[provider.id] = "✓ " + t("settings.testSaved");
    store.notify(t("settings.providerSaved"));
    await continuePracticeIfReady();
  } catch (error) {
    result.value[provider.id] = "× " + friendlyError(error);
  } finally {
    savingProvider.value = "";
  }
}
async function deleteProviderKey(provider: any) {
  clearingKey.value = provider.id;
  try {
    await api.delete(`/providers/${provider.id}/secret`);
    await store.load();
    syncProviderDraft(provider.id);
    store.notify(t("settings.keyDeleted"));
  } finally {
    clearingKey.value = "";
  }
}
async function test(provider: any) {
  await runProviderTest(provider);
}
async function loadModels(provider: any) {
  loadingModels.value = provider.id;
  result.value[provider.id] = "";
  try {
    const data = await api.post<{ models: string[] }>(
      `/providers/${provider.id}/models`,
      providerOverrides(provider),
    );
    availableModels.value[provider.id] = data.models;
    if (data.models.length) manualModels.value[provider.id] = false;
    result.value[provider.id] = data.models.length
      ? "✓ " + t("settings.modelsFound", { count: data.models.length })
      : "× " + t("settings.noModels");
  } catch (error) {
    result.value[provider.id] = "× " + friendlyError(error);
  } finally {
    loadingModels.value = "";
  }
}
async function downloadBackup() {
  const data = await api.get<any>("/export");
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `language-coach-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function resetAllConfig() {
  if (resetting.value) return;
  resetting.value = true;
  try {
    await api.post("/settings/reset");
    await store.load();
    confirmReset.value = false;
    await router.push("/onboarding");
  } finally {
    resetting.value = false;
  }
}
async function loadRemote() {
  loadingRemote.value = true;
  try {
    remote.value = await api.get<RemoteStatus>("/remote/status");
  } finally {
    loadingRemote.value = false;
  }
}
async function copyRemoteUrl() {
  if (!remote.value?.url) return;
  try {
    await navigator.clipboard.writeText(remote.value.url);
    store.notify(t("settings.urlCopied"));
  } catch {
    store.notify(t("settings.copyFailed"));
  }
}
initializeDrafts();
onMounted(loadRemote);
</script>
<template>
  <div v-if="store.settings" class="page settings-page">
    <header class="page-head">
      <div>
        <h1>{{ t('settings.title') }}</h1>
        <p class="subhead">{{ t('settings.subtitle') }}</p>
      </div>
    </header>
    <div class="settings-layout">
      <nav>
        <button
          v-for="item in [
            {id:'language',icon:'language',key:'settings.tabLanguage'},
            {id:'models',icon:'spark',key:'settings.tabModels'},
            {id:'web',icon:'search',key:'settings.tabWeb'},
            {id:'data',icon:'download',key:'settings.tabData'},
          ]"
          :key="item.id"
          :class="{ active: tab === item.id }"
          @click="tab = item.id"
        >
          <AppIcon :name="item.icon" />{{ t(item.key) }}
        </button>
      </nav>
      <main>
        <section v-if="tab === 'language'" class="settings-section card">
          <h2>{{ t('settings.languageTitle') }}</h2>
          <p>{{ t('settings.languageHelp') }}</p>
          <div class="settings-fields">
            <div class="field">
              <label>{{ t('settings.interfaceLanguage') }}</label
              ><select v-model="languageDraft.ui.locale">
                <option v-for="code in UI_LOCALES" :key="code" :value="code">{{ LOCALE_META[code].nativeName }}</option>
              </select>
            </div>
            <div class="field">
              <label>{{ t('settings.targetLanguage') }}</label
              ><select
                :value="languageDraft.learning.targetLanguageCode"
                @change="
                  setLanguage(($event.target as HTMLSelectElement).value)
                "
              >
                <option v-for="item in languages" :key="item.code" :value="item.code">
                  {{ displayTargetLanguage(item.code,locale) }}
                </option>
              </select>
            </div>
            <div class="field">
              <label>{{ t('settings.level') }}</label
              ><select v-model="languageDraft.learning.proficiency">
                <option>A2</option>
                <option>B1</option>
                <option>B2</option>
                <option>C1</option>
              </select>
            </div>
            <div class="field">
              <label>{{ t('settings.correction') }}</label
              ><select v-model="languageDraft.learning.correctionLevel">
                <option value="light">
                  {{ t('settings.correctionLight') }}
                </option>
                <option value="balanced">
                  {{ t('settings.correctionBalanced') }}
                </option>
                <option value="intensive">
                  {{ t('settings.correctionIntensive') }}
                </option>
              </select>
            </div>
          </div>
          <button
            class="btn primary"
            :disabled="!languageDirty"
            @click="saveLanguagePreferences"
          >
            <AppIcon name="check" />{{ t('settings.savePreferences') }}
          </button>
        </section>
        <section v-else-if="tab === 'models'" class="settings-section">
          <div v-if="modelRequired" class="model-required-banner" role="alert">
            <span><AppIcon name="spark" /></span>
            <div>
              <h2>{{ t('settings.modelRequiredTitle') }}</h2>
              <p>{{ t('settings.modelRequiredBody') }}</p>
            </div>
          </div>
          <div class="section-intro">
            <h2>{{ t('settings.modelsTitle') }}</h2>
            <p>{{ t('settings.modelsBody') }}</p>
            <div class="field default-provider">
              <label>{{ t('settings.defaultProvider') }}</label
              ><select
                v-model="defaultProvider"
                @change="saveDefaultProvider"
              >
                <option
                  v-for="p in selectableProviders"
                  :key="p.id"
                  :value="p.id"
                >
                  {{ providerName(p) }} · {{ p.model }}
                </option>
                <option v-if="!selectableProviders.length" disabled value="">
                  {{ t('settings.noQualifiedModels') }}
                </option>
              </select>
            </div>
          </div>
          <article
            v-for="provider in providerDrafts"
            :key="provider.id"
            class="provider-card card"
          >
            <header>
              <div class="provider-logo">
                {{ provider.id.slice(0, 2).toUpperCase() }}
              </div>
              <div>
                <h3>{{ providerName(provider) }}</h3>
                <span>
                  {{ t('settings.officialDirect') }}
                  <i v-if="provider.hasApiKey">
                    · {{ t('settings.keySaved') }}</i
                  >
                </span>
              </div>
              <em
                :class="{
                  ready:
                    savedCapabilityMatches(provider) ||
                    verified[provider.id] === providerSignature(provider),
                }"
                >{{ providerStatus(provider) }}</em
              >
            </header>
            <div class="provider-fields">
              <div class="field model-field">
                <div class="field-label-row">
                  <label :for="`model-${provider.id}`">{{ t('settings.modelName') }}</label>
                  <button
                    v-if="hasModelList(provider)"
                    type="button"
                    class="text-action"
                    @click="manualModels[provider.id] = !manualModels[provider.id]"
                  >
                    {{ manualModels[provider.id] ? t('settings.chooseFromModels') : t('settings.enterModelManually') }}
                  </button>
                </div>
                <select
                  v-if="hasModelList(provider) && !manualModels[provider.id]"
                  :id="`model-${provider.id}`"
                  :value="provider.model"
                  @change="activateModel(provider, ($event.target as HTMLSelectElement).value)"
                >
                  <option disabled value="">{{ t('settings.chooseModel') }}</option>
                  <option
                    v-for="model in modelChoices(provider)"
                    :key="model"
                    :value="model"
                  >{{ model }}</option>
                </select>
                <input
                  v-else
                  :id="`model-${provider.id}`"
                  v-model="provider.model"
                  :placeholder="t('settings.modelNamePlaceholder')"
                  @focus="beginManualModelEdit(provider)"
                  @input="invalidateProvider(provider.id)"
                  @change="finishManualModelEdit(provider)"
                />
                <small>{{ hasModelList(provider) ? t('settings.modelListHelp', { count: availableModels[provider.id].length }) : t('settings.modelDiscoveryHelp') }}</small>
              </div>
              <div v-if="provider.apiKeySecret" class="field api-key">
                <label>{{ t('settings.apiKey') }}</label
                ><input
                  v-model="keys[provider.id]"
                  type="password"
                  :placeholder="
                    provider.hasApiKey
                      ? '••••••••  ' + t('settings.keepKey')
                      : 'sk-…'
                  "
                  autocomplete="new-password"
                  @input="invalidateProvider(provider.id)"
                />
              </div>
              <div class="field budget-field">
                <label>{{ t('settings.contextBudget') }}</label>
                <input v-model.number="provider.contextWindowTokens" type="number" min="4096" step="1024" @input="updateActiveModelProfile(provider)" />
                <small>{{ t('settings.contextBudgetHelp') }}</small>
              </div>
              <div class="field budget-field">
                <label>{{ t('settings.outputBudget') }}</label>
                <input v-model.number="provider.maxOutputTokens" type="number" min="256" step="128" @input="updateActiveModelProfile(provider)" />
                <small>{{ t('settings.outputBudgetHelp') }}</small>
              </div>
            </div>
            <footer>
              <span
                :class="{ success: result[provider.id]?.startsWith('✓') }"
                >{{ result[provider.id] }}</span
              >
              <div>
                <button
                  v-if="provider.hasApiKey"
                  class="btn small danger"
                  :disabled="
                    clearingKey === provider.id ||
                    savingProvider === provider.id ||
                    testing === provider.id
                  "
                  @click="deleteProviderKey(provider)"
                >
                  {{
                    clearingKey === provider.id
                      ? t('settings.deletingKey')
                      : t('settings.deleteKey')
                  }}</button
                ><button
                  class="btn small"
                  :disabled="
                    loadingModels === provider.id ||
                    savingProvider === provider.id ||
                    testing === provider.id
                  "
                  @click="loadModels(provider)"
                >
                  {{
                    loadingModels === provider.id
                      ? t('settings.loadingModels')
                      : t('settings.refreshModels')
                  }}</button
                ><button
                  class="btn small"
                  :disabled="
                    testing === provider.id || savingProvider === provider.id
                  "
                  @click="test(provider)"
                >
                  {{
                    testing === provider.id
                      ? t('settings.testing')
                      : t('settings.testDialogue')
                  }}</button
                ><button
                  class="btn small primary"
                  :disabled="
                    savingProvider === provider.id ||
                    testing === provider.id ||
                    !providerHasChanges(provider)
                  "
                  @click="saveProvider(provider)"
                >
                  {{
                    savingProvider === provider.id
                      ? t('settings.validating')
                      : t('common.save')
                  }}
                </button>
              </div>
            </footer>
          </article>
        </section>
        <section v-else-if="tab === 'web'" class="settings-section card web-settings">
          <h2>{{ t('settings.webTitle') }}</h2>
          <p>{{ t('settings.webHelp') }}</p>
          <label class="web-toggle" :class="{ unavailable: !store.settings.webLookupReady }">
            <span>
              <b>{{ t('settings.webToggle') }}</b>
              <small>{{ t(store.settings.webLookupReady ? 'settings.webToggleHelp' : 'settings.webNeedsCurrentModel') }}</small>
            </span>
            <input
              v-model="webLookupEnabled"
              type="checkbox"
              :disabled="!store.settings.webLookupReady"
            />
          </label>
          <p class="web-note">{{ t('settings.webExplicitLocation') }}</p>
          <button class="btn primary" :disabled="!webLookupDirty" @click="saveWebLookup">
            <AppIcon name="check" />{{ t('common.save') }}
          </button>
        </section>
        <section v-else class="settings-section card">
          <h2>{{ t('settings.dataTitle') }}</h2>
          <p>{{ t('settings.dataBody') }}</p>
          <div class="config-summary">
            <h3>{{ t('settings.currentConfig') }}</h3>
            <div>
              <span
                ><small>{{ t('settings.interfaceShort') }}</small
                ><b>{{ LOCALE_META[store.settings.ui.locale].nativeName }}</b></span
              ><span
                ><small>{{ t('settings.targetShort') }}</small
                ><b>{{ displayTargetLanguage(store.settings.learning.targetLanguageCode, locale) }}</b></span
              ><span
                ><small>{{ t('settings.level') }}</small
                ><b>{{ store.settings.learning.proficiency }}</b></span
              ><span
                ><small>{{ t('settings.providerShort') }}</small
                ><b>{{ currentProviderName }}</b></span
              >
            </div>
          </div>
          <div class="privacy-grid">
            <div>
              <AppIcon name="memory" /><b>{{ t('settings.localDatabase') }}</b
              ><span>data/app.db</span>
            </div>
            <div>
              <AppIcon name="settings" /><b>{{ t('settings.appConfig') }}</b
              ><span>data/config.json</span>
            </div>
            <div>
              <AppIcon name="bookmark" /><b>{{ t('settings.secretFile') }}</b
              ><span>data/secrets.json · 0600</span>
            </div>
          </div>
          <article class="remote-card">
            <header>
              <span class="remote-icon"><AppIcon name="phone" /></span>
              <div>
                <h3>{{ t('settings.remoteTitle') }}</h3>
                <p>{{ t(remote?.active ? 'settings.remoteRunningBody' : 'settings.remoteOffBody') }}</p>
              </div>
              <em :class="{ active: remote?.active }">{{
                remote?.active
                  ? t('settings.running')
                  : t('settings.localMode')
              }}</em>
            </header>
            <template v-if="remote?.active"
              ><a
                class="remote-url"
                :href="remote.url"
                target="_blank"
                rel="noreferrer"
                ><AppIcon name="link" :size="16" /><span>{{
                  remote.url
                }}</span></a
              >
              <p>{{ t('settings.allowedEmail', { emails: remote.allowedEmails?.join(', ') }) }}</p>
              <p class="remote-warning">{{ t('settings.remoteWarning') }}</p>
              <footer>
                <button class="btn small" @click="copyRemoteUrl">
                  {{ t('settings.copyUrl') }}</button
                ><button
                  class="btn small"
                  :disabled="loadingRemote"
                  @click="loadRemote"
                >
                  <AppIcon name="refresh" :size="14" />{{ t('settings.refresh') }}
                </button>
              </footer></template
            ><template v-else
              ><p>{{ t('settings.remoteStart') }}</p>
              <code>npm run app -- remote start</code>
              <p>{{ t('settings.remoteHelper') }}</p>
              <footer>
                <button
                  class="btn small"
                  :disabled="loadingRemote"
                  @click="loadRemote"
                >
                  <AppIcon name="refresh" :size="14" />{{ t('settings.refreshStatus') }}
                </button>
              </footer></template
            >
          </article>
          <hr />
          <h3>{{ t('settings.exportTitle') }}</h3>
          <p>{{ t('settings.exportBody') }}</p>
          <button class="btn" @click="downloadBackup">
            <AppIcon name="download" />{{ t('settings.downloadBackup') }}
          </button>
          <hr />
          <div class="danger-zone">
            <h3>{{ t('settings.resetTitle') }}</h3>
            <p>{{ t('settings.resetBody') }}</p>
            <button class="btn danger" @click="confirmReset = true">
              {{ t('settings.resetButton') }}
            </button>
          </div>
        </section>
      </main>
    </div>
    <Teleport to="body"
      ><div
        v-if="confirmReset"
        class="reset-backdrop"
        @click.self="confirmReset = false"
      >
        <section class="reset-dialog card" role="alertdialog" aria-modal="true">
          <span><AppIcon name="settings" :size="23" /></span>
          <h2>{{ t('settings.resetConfirmTitle') }}</h2>
          <p>{{ t('settings.resetConfirmBody') }}</p>
          <footer>
            <button
              class="btn"
              :disabled="resetting"
              @click="confirmReset = false"
            >
              {{ t('common.cancel') }}</button
            ><button
              class="btn danger solid"
              :disabled="resetting"
              @click="resetAllConfig"
            >
              {{
                resetting
                  ? t('settings.resetting')
                  : t('common.delete')
              }}
            </button>
          </footer>
        </section>
      </div></Teleport
    >
  </div>
</template>
<style scoped>
.settings-layout {
  display: grid;
  grid-template-columns: 190px 1fr;
  gap: 25px;
  min-width: 0;
}
.settings-layout > nav {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.settings-layout > nav button {
  height: 42px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 9px;
  text-align: left;
  padding: 0 11px;
  font-size: 11px;
}
.settings-layout > nav button.active {
  background: var(--paper);
  color: var(--green);
  box-shadow: 0 2px 10px rgba(30, 35, 29, 0.05);
}
.settings-section {
  padding: 25px;
  min-width: 0;
}
.settings-section > h2,
.section-intro h2 {
  font-size: 18px;
}
.settings-section > p,
.section-intro p,
.danger-zone p {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.65;
}
.settings-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 25px 0;
}
.section-intro {
  padding: 0 2px 18px;
}
.model-required-banner {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 13px;
  align-items: start;
  margin: 0 0 20px;
  padding: 17px;
  border: 1px solid #ddc889;
  border-radius: 13px;
  background: #faf4df;
}
.model-required-banner > span {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  background: #f1e3b8;
  color: #7b6424;
  display: grid;
  place-items: center;
}
.model-required-banner h2 {
  font-size: 15px;
  margin: 1px 0 6px;
  color: #4f451f;
}
.model-required-banner p {
  font-size:11px;
  line-height: 1.65;
  color: #766c48;
  margin: 0;
}
.default-provider {
  max-width: 330px;
  margin-top: 15px;
}
.provider-card {
  padding: 17px;
  margin-bottom: 10px;
}
.provider-card header {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 11px;
  align-items: center;
}
.provider-logo {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: #e7ebe4;
  color: var(--green);
  display: grid;
  place-items: center;
  font-size:11px;
  font-weight: 800;
}
.provider-card h3 {
  font-size: 12px;
  margin: 0 0 3px;
}
.provider-card header span {
  font-size:11px;
  color: var(--muted);
}
.provider-card header i {
  color: var(--green);
  font-style: normal;
}
.provider-card header em {
  font-size:11px;
  font-style: normal;
  color: var(--muted);
  letter-spacing: 0.08em;
}
.provider-card header em.ready {
  color: var(--green);
}
.provider-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 15px;
}
.provider-fields .api-key {
  grid-column: 1/-1;
}
.field-label-row {
  min-height: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.text-action {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--green);
  font-size: 11px;
  font-weight: 680;
}
.text-action:hover {
  text-decoration: underline;
}
.model-field small {
  line-height: 1.5;
}
.web-settings > p {
  max-width: 720px;
}
.web-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin: 24px 0 12px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--paper);
}
.web-toggle.unavailable {
  opacity: 0.65;
}
.web-toggle span,
.web-toggle b,
.web-toggle small {
  display: block;
}
.web-toggle b {
  font-size: 12px;
  margin-bottom: 5px;
}
.web-toggle small,
.web-note {
  color: var(--muted);
  font-size:11px;
  line-height: 1.6;
}
.web-toggle input {
  width: 18px;
  height: 18px;
  accent-color: var(--green);
  flex: 0 0 auto;
}
.web-note {
  margin: 0 0 18px;
}
.provider-card footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-top: 12px;
}
.provider-card footer > span {
  font-size:11px;
  color: var(--red);
  max-width: 50%;
  line-height: 1.55;
  padding-top: 8px;
}
.provider-card footer > span.success {
  color: var(--green);
}
.provider-card footer > div {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-left: auto;
}
.config-summary {
  margin: 22px 0;
  padding: 17px;
  border-radius: 13px;
  background: #edf0e9;
}
.config-summary > div {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.config-summary span small,
.config-summary span b {
  display: block;
}
.config-summary small {
  font-size:11px;
  color: var(--muted);
  letter-spacing: 0.08em;
}
.config-summary b {
  font-size: 11px;
  margin-top: 4px;
}
.privacy-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
  margin: 22px 0;
}
.privacy-grid div {
  border: 1px solid var(--line);
  border-radius: 11px;
  padding: 15px;
  color: var(--green);
}
.privacy-grid b,
.privacy-grid span {
  display: block;
}
.privacy-grid b {
  font-size:11px;
  margin: 9px 0 4px;
}
.privacy-grid span {
  font-size:11px;
  color: var(--muted);
}
.remote-card {
  margin: 22px 0;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: #fbfaf6;
}
.remote-card header {
  display: grid;
  grid-template-columns: 42px 1fr auto;
  gap: 12px;
  align-items: center;
}
.remote-card header h3 {
  margin: 0 0 4px;
}
.remote-card header p,
.remote-card > p {
  margin: 0;
  color: var(--muted);
  font-size:11px;
  line-height: 1.65;
}
.remote-icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  background: #e9eee7;
  color: var(--green);
  display: grid;
  place-items: center;
}
.remote-card em {
  font-style: normal;
  font-size:11px;
  letter-spacing: 0.08em;
  color: var(--muted);
  padding: 5px 8px;
  border-radius: 10px;
  background: #ecece7;
}
.remote-card em.active {
  color: var(--green);
  background: var(--lime);
}
.remote-url {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0 10px;
  padding: 11px 12px;
  border-radius: 9px;
  background: #e9eee7;
  color: var(--green);
  font-size:11px;
  text-decoration: none;
}
.remote-url span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.remote-warning {
  color: #8a5b33 !important;
  margin-top: 7px !important;
}
.remote-card code {
  display: block;
  margin: 14px 0 10px;
  padding: 11px 12px;
  background: #222822;
  color: #f4f1ea;
  border-radius: 8px;
  font-size:11px;
  overflow: auto;
}
.remote-card footer {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 14px;
}
.remote-card footer .btn {
  display: flex;
  align-items: center;
  gap: 5px;
}
.settings-section hr {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 25px 0;
}
.settings-section h3 {
  font-size: 12px;
}
.danger-zone {
  padding: 16px;
  border: 1px solid #ead3ce;
  border-radius: 12px;
  background: #fcf7f5;
}
.danger-zone h3 {
  color: var(--red);
  margin-top: 0;
}
.reset-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(27, 31, 26, 0.32);
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
}
.reset-dialog {
  width: min(430px, 100%);
  padding: 27px;
}
.reset-dialog > span {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: #f5e7e3;
  color: var(--red);
  display: grid;
  place-items: center;
  margin-bottom: 18px;
}
.reset-dialog h2 {
  font-size: 22px;
  margin: 0;
}
.reset-dialog > p {
  font-size: 11px;
  line-height: 1.7;
  color: var(--muted);
}
.reset-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
.btn.danger.solid {
  background: var(--red);
  border-color: var(--red);
  color: white;
}
@media (max-width: 760px) {
  .settings-layout {
    display: block;
  }
  .settings-layout > nav {
    flex-direction: row;
    overflow: auto;
    margin-bottom: 18px;
  }
  .settings-layout > nav button {
    white-space: nowrap;
  }
  .settings-fields,
  .provider-fields,
  .privacy-grid,
  .config-summary > div {
    grid-template-columns: 1fr;
  }
  .provider-fields .api-key {
    grid-column: auto;
  }
  .settings-section {
    padding: 18px;
  }
  .provider-card footer {
    display: block;
  }
  .provider-card footer > span {
    display: block;
    max-width: none;
    margin-bottom: 8px;
  }
  .provider-card footer > div {
    justify-content: flex-start;
  }
  .remote-card header {
    grid-template-columns: 42px 1fr;
  }
  .remote-card header em {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
