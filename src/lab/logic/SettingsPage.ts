// Generated from src/pages/SettingsPage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api } from '../../api'
import { useAppStore } from '../../stores/app'
import { displayTargetLanguage, TARGET_LANGUAGES } from '../../../shared/locales'
import { learningPreferencesKey, providerConfigurationKey } from '../../form-state'
import { rememberProviderModelProfile, switchProviderModel } from '../../model-profiles'
import { browserSpeech } from '../../speech'
import { VOICE_INPUT_SOURCES, type VoiceInputSource } from '../../../shared/voice'
import { loadSpeechCapabilities, voice, voiceUnavailableText } from '../../voice'
import { DEFAULT_SPEECH_RATE, normalizeSpeechRate, speechPlatformFor, type SpeechPlatform } from '../../../shared/speech'
import type { Provider, Settings } from '../../types'
import { REGISTERS, normalizeRegister, normalizeVariant, variantRegionName, variantsFor } from '../../../shared/variants'
import { formatCost, loadMonthUsage, mainlandChinaClock, overLimit, type MonthUsage } from '../../usage'

export function useSettingsPage() {
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
  lookupReady: boolean;
  contractVersion: number;
  testedAt: string;
};
type ProviderTestResult = {
  ok: boolean;
  message: string;
  model: string;
  capability: ProviderCapability;
  setupReceipt: string;
};
type ProviderModelOption = {
  id: string;
  displayName: string;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
};
const store = useAppStore();
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const requestedTab = typeof route.query.tab === "string" ? route.query.tab : "";
const tab = ref(["models", "usage", "web", "data"].includes(requestedTab) ? requestedTab : "language");
const testing = ref("");
const savingProvider = ref("");
const loadingModels = ref("");
const clearingKey = ref("");
const confirmReset = ref(false);
const resetting = ref(false);
const result = ref<Record<string, string>>({});
const verified = ref<Record<string, string>>({});
const setupReceipts = ref<Record<string, string>>({});
const availableModels = ref<Record<string, ProviderModelOption[]>>({});
const keys = ref<Record<string, string>>({});
const providerDrafts = ref<Provider[]>([]);
const providerBaselines = ref<Record<string, string>>({});
const defaultProvider = ref("");
const webLookupEnabled = ref(false);
// Tidying memories after a conversation costs a model call, so it stays off until switched on here.
const memoryTidyEnabled = ref(false);
const languageDraft = reactive<Pick<Settings, "ui" | "learning">>({
  ui: { locale: "zh-CN" },
  learning: {
    targetLanguage: "English",
    targetLanguageCode: "en",
    proficiency: "B2",
    correctionLevel: "balanced",
    speechRate: DEFAULT_SPEECH_RATE,
    reviewInConversation: true,
    voiceInput: "browser",
    listenFirst: false,
    variant: "",
    register: "neutral",
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
const speechAvailable = computed(() => {
  browserSpeech.voicesVersion.value;
  return browserSpeech.supported.value &&
    browserSpeech.hasTrustedVoice(languageDraft.learning.targetLanguageCode);
});
// Speaking instead of typing: who writes the speech down, and what this browser can do.
const voiceSources = VOICE_INPUT_SOURCES;
const voiceInputChoice = computed<VoiceInputSource>(() =>
  languageDraft.learning.voiceInput === "model" ? "model" : "browser",
);
const audioProviderName = computed(() => {
  const capabilities = voice.capabilities.value;
  if (!capabilities.modelAudio) return "";
  return capabilities.provider === "gemini" ? "Gemini" : "OpenAI";
});
const voiceInputNotes = computed(() => {
  const provider = audioProviderName.value;
  if (voiceInputChoice.value === "model") {
    return [provider ? t("settings.voiceInputModelHelp", { provider }) : t("settings.voiceInputModelNone")];
  }
  const notes = [t("settings.voiceInputBrowserHelp")];
  if (provider) notes.push(t("settings.voiceInputFallback", { provider }));
  return notes;
});
/** Nothing here can listen: which browser can. */
const voiceBrowserWarning = computed(() =>
  voice.support.value.available || audioProviderName.value
    ? ""
    : voiceUnavailableText(t, String(locale.value), languageDraft.learning.targetLanguageCode),
);
// What the provider can do with a recording changes with the provider and its key.
watch(() => store.settings, () => { void loadSpeechCapabilities(true); });
const speechPlatform = computed<SpeechPlatform>(() => {
  if (typeof navigator === "undefined") return "other";
  const modernNavigator = navigator as Navigator & { userAgentData?: { platform?: string } };
  return speechPlatformFor(
    modernNavigator.userAgentData?.platform || navigator.platform || "",
    navigator.userAgent,
  );
});
const speechRecommendationKey = computed(() => ({
  macos: "settings.speechRecommendationMac",
  windows: "settings.speechRecommendationWindows",
  linux: "settings.speechRecommendationLinux",
  other: "settings.speechRecommendationOther",
})[speechPlatform.value]);
const displayedSpeechRate = computed(() => normalizeSpeechRate(languageDraft.learning.speechRate).toFixed(2).replace(/0$/u, ""));
const displayedTargetLanguage = computed(() => displayTargetLanguage(languageDraft.learning.targetLanguageCode, locale.value));
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
  // Bringing saved words into conversation is on unless it was switched off.
  languageDraft.learning.reviewInConversation = store.settings.learning.reviewInConversation !== false;
  languageDraft.learning.voiceInput = store.settings.learning.voiceInput === "model" ? "model" : "browser";
  languageDraft.learning.listenFirst = store.settings.learning.listenFirst === true;
  languageDraft.learning.variant = normalizeVariant(store.settings.learning.targetLanguageCode, store.settings.learning.variant);
  languageDraft.learning.register = normalizeRegister(store.settings.learning.register);
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
  memoryTidyEnabled.value = Boolean(store.settings.memory?.consolidate);
  reviewProvider.value = store.settings.llm.reviewProvider || "";
  providerDrafts.value = store.settings.providers.map(prepareProviderDraft);
  providerDrafts.value.forEach((provider) => syncPriceDraft(provider.id));
  syncCustomDraft();
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
  // A variety belongs to one language.
  languageDraft.learning.variant = normalizeVariant(code, languageDraft.learning.variant);
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
function activateModel(provider: Provider, rawModel: string) {
  const official = availableModels.value[provider.id]?.find((model) => model.id === rawModel);
  if (!official) return;
  switchProviderModel(provider, official.id, provider.model, official);
  invalidateProvider(provider.id);
}
function updateActiveModelProfile(provider: Provider) {
  rememberModelProfile(provider);
  invalidateProvider(provider.id);
}
function hasModelList(provider: Provider) {
  return Boolean(availableModels.value[provider.id]?.length);
}
function modelsLoaded(provider: Provider) {
  return Object.hasOwn(availableModels.value, provider.id);
}
function currentModelIsOfficial(provider: Provider) {
  return Boolean(availableModels.value[provider.id]?.some((model) => model.id === provider.model));
}
function modelLabel(model: ProviderModelOption) {
  return model.displayName && model.displayName !== model.id
    ? `${model.displayName} · ${model.id}`
    : model.id;
}
function invalidateProvider(id: string) {
  delete verified.value[id];
  delete setupReceipts.value[id];
  result.value[id] = "";
}
function providerHasChanges(provider: Provider) {
  const configurationChanged =
    providerConfigurationKey(provider) !== providerBaselines.value[provider.id];
  const keyChanged = Boolean(keys.value[provider.id]?.trim());
  const hasFreshTest =
    verified.value[provider.id] === providerSignature(provider) &&
    Boolean(setupReceipts.value[provider.id]);
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
async function saveMemoryTidy() {
  if (!store.settings) return;
  const next = cloneValue(store.settings);
  next.memory = { consolidate: memoryTidyEnabled.value };
  try {
    await store.save(next);
  } finally {
    memoryTidyEnabled.value = Boolean(store.settings?.memory?.consolidate);
  }
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
    MODEL_NOT_DISCOVERED: "settings.errorModelRefreshRequired",
    SETUP_RECEIPT_REQUIRED: "settings.errorRetestRequired",
    SETUP_RECEIPT_EXPIRED: "settings.errorRetestRequired",
    SETUP_RECEIPT_INVALID: "settings.errorRetestRequired",
    SETUP_RECEIPT_PROVIDER_MISMATCH: "settings.errorRetestRequired",
    SETUP_RECEIPT_MODEL_MISMATCH: "settings.errorRetestRequired",
    SETUP_RECEIPT_KEY_MISMATCH: "settings.errorRetestRequired",
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
    setupReceipts.value[provider.id] = data.setupReceipt;
    result.value[provider.id] = "✓ " + t("settings.statusVerified");
    return true;
  } catch (error) {
    delete verified.value[provider.id];
    delete setupReceipts.value[provider.id];
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
    const saved = await api.put<Settings>(`/providers/${provider.id}`, {
      ...providerOverrides(provider),
      enabled: true,
      contextWindowTokens: provider.contextWindowTokens,
      maxOutputTokens: provider.maxOutputTokens,
      modelProfiles: provider.modelProfiles,
      setupReceipt: setupReceipts.value[provider.id],
    });
    keys.value[provider.id] = "";
    delete verified.value[provider.id];
    delete setupReceipts.value[provider.id];
    store.settings = saved;
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
  delete availableModels.value[provider.id];
  try {
    const data = await api.post<{ models: ProviderModelOption[] }>(
      `/providers/${provider.id}/models`,
      providerOverrides(provider),
    );
    availableModels.value[provider.id] = data.models;
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
// The variety of the language and how formal the partner is.
const registers = REGISTERS;
const variantChoices = computed(() => variantsFor(languageDraft.learning.targetLanguageCode));
function variantName(variant: string) {
  return variantRegionName(variant, String(locale.value));
}

// The model that looks back over conversations and scores tests, when it is not the one talked with.
const reviewProvider = ref("");
async function saveReviewProvider() {
  if (!store.settings || reviewProvider.value === (store.settings.llm.reviewProvider || "")) return;
  const next = cloneValue(store.settings);
  next.llm.reviewProvider = reviewProvider.value;
  await store.save(next);
  reviewProvider.value = store.settings.llm.reviewProvider || "";
}

// A service of the learner's own that speaks the OpenAI chat interface.
const CUSTOM_ID = "custom";
const customDraft = reactive({ name: "", baseUrl: "" });
const savingCustom = ref(false);
const customError = ref("");
const customSaved = computed(() => store.settings?.providers.find((provider) => provider.id === CUSTOM_ID) || null);
const customDirty = computed(() => {
  const name = customDraft.name.trim();
  const baseUrl = customDraft.baseUrl.trim().replace(/\/+$/u, "");
  return Boolean(name && baseUrl) && (name !== (customSaved.value?.name || "") || baseUrl !== (customSaved.value?.baseUrl || ""));
});
function syncCustomDraft() {
  customDraft.name = customSaved.value?.name || "";
  customDraft.baseUrl = customSaved.value?.baseUrl || "";
}
function applyCustomChange(saved: Settings) {
  store.settings = saved;
  if (saved.providers.some((provider) => provider.id === CUSTOM_ID)) syncProviderDraft(CUSTOM_ID);
  else providerDrafts.value = providerDrafts.value.filter((provider) => provider.id !== CUSTOM_ID);
  keys.value[CUSTOM_ID] = "";
  delete availableModels.value[CUSTOM_ID];
  invalidateProvider(CUSTOM_ID);
  syncPriceDraft(CUSTOM_ID);
  defaultProvider.value = saved.llm.defaultProvider;
  reviewProvider.value = saved.llm.reviewProvider || "";
  syncCustomDraft();
}
async function saveCustomEndpoint() {
  if (savingCustom.value || !customDirty.value) return;
  savingCustom.value = true;
  customError.value = "";
  try {
    applyCustomChange(await api.put<Settings>("/providers/custom/endpoint", { name: customDraft.name.trim(), baseUrl: customDraft.baseUrl.trim() }));
    store.notify(t("common.settingsSaved"));
  } catch (error) {
    customError.value = t(error instanceof ApiError && error.code === "CUSTOM_ENDPOINT_INVALID" ? "settings.customInvalid" : "common.operationFailed");
  } finally {
    savingCustom.value = false;
  }
}
async function removeCustomEndpoint() {
  if (savingCustom.value) return;
  savingCustom.value = true;
  customError.value = "";
  try {
    applyCustomChange(await api.delete<Settings>("/providers/custom/endpoint"));
  } catch {
    customError.value = t("common.operationFailed");
  } finally {
    savingCustom.value = false;
  }
}
/** A service of the learner's own may list no models: there the name is typed. */
function typeModel(provider: Provider, rawModel: string) {
  const model = rawModel.trim();
  if (model === provider.model) return;
  const listed = availableModels.value[provider.id]?.find((item) => item.id === model);
  switchProviderModel(provider, model, provider.model, listed || {});
  invalidateProvider(provider.id);
}

// What this month's model requests came to. Worked out from list prices: an estimate, not a bill.
const usage = ref<MonthUsage | null>(null);
const usageFailed = ref(false);
const limitDraft = ref<string | number>("");
const savingLimit = ref(false);
function cost(amount: number) {
  return formatCost(amount, String(locale.value));
}
async function loadUsage() {
  try {
    const data = await loadMonthUsage();
    usage.value = data;
    usageFailed.value = false;
    limitDraft.value = data.limit ? String(data.limit) : "";
    overLimit.value = data.overLimit;
  } catch {
    usageFailed.value = true;
  }
}
const usageTasks = computed(() => (usage.value?.tasks || []).map((item) => ({ ...item, name: t(`usage.task.${item.task}`) })));
const usageModels = computed(() => (usage.value?.models || []).map((item) => ({
  ...item,
  name: `${store.settings?.providers.find((provider) => provider.id === item.providerId)?.name || item.providerId} · ${item.model}`,
})));
const usageMonth = computed(() => usage.value
  ? new Intl.DateTimeFormat(String(locale.value), { year: "numeric", month: "long" }).format(new Date(usage.value.from))
  : "");
const limitDirty = computed(() => {
  const typed = String(limitDraft.value).trim();
  return (typed ? Number(typed) : null) !== (usage.value?.limit ?? null);
});
async function saveLimit() {
  if (savingLimit.value || !limitDirty.value) return;
  const typed = String(limitDraft.value).trim();
  const limit = typed ? Number(typed) : null;
  if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
    store.notify(t("usage.limitInvalid"));
    return;
  }
  savingLimit.value = true;
  try {
    await api.put("/usage/limit", { limit });
    await loadUsage();
    store.notify(t("common.settingsSaved"));
  } catch {
    store.notify(t("usage.limitInvalid"));
  } finally {
    savingLimit.value = false;
  }
}

// The learner's own price for a provider, in US dollars per million tokens: for a model the price
// list does not know, or a rate that differs from it.
const priceDrafts = ref<Record<string, { input: string | number; output: string | number }>>({});
const savingPrice = ref("");
function savedPrice(id: string) {
  return store.settings?.providers.find((provider) => provider.id === id)?.price;
}
function syncPriceDraft(id: string) {
  const price = savedPrice(id);
  priceDrafts.value[id] = { input: price ? String(price.input) : "", output: price ? String(price.output) : "" };
}
function priceChanged(id: string) {
  const draft = priceDrafts.value[id];
  const price = savedPrice(id);
  return Boolean(draft) && (String(draft.input).trim() !== (price ? String(price.input) : "") || String(draft.output).trim() !== (price ? String(price.output) : ""));
}
async function savePrice(provider: Provider) {
  const draft = priceDrafts.value[provider.id];
  if (!draft || savingPrice.value || !priceChanged(provider.id)) return;
  const input = String(draft.input).trim();
  const output = String(draft.output).trim();
  savingPrice.value = provider.id;
  try {
    const saved = await api.put<{ price: { input: number; output: number } | null }>(
      `/usage/prices/${provider.id}`,
      input === "" && output === "" ? { input: null, output: null } : { input: Number(input), output: Number(output) },
    );
    for (const item of [store.settings?.providers.find((entry) => entry.id === provider.id), provider]) {
      if (!item) continue;
      if (saved.price) item.price = saved.price;
      else delete item.price;
    }
    syncPriceDraft(provider.id);
    delete estimates.value[estimateKey(provider)];
    void loadEstimate(provider);
    store.notify(t("common.settingsSaved"));
  } catch {
    store.notify(t("usage.priceInvalid"));
  } finally {
    savingPrice.value = "";
  }
}

// What a conversation of some twenty exchanges would come to with the model chosen for a provider.
const estimates = ref<Record<string, number | null>>({});
const estimateExchanges = ref(20);
function estimateKey(provider: Provider) {
  return `${provider.id}\n${provider.model.trim()}`;
}
async function loadEstimate(provider: Provider) {
  const model = provider.model.trim();
  const key = estimateKey(provider);
  if (!model || Object.hasOwn(estimates.value, key)) return;
  try {
    const data = await api.get<{ cost: number | null; exchanges: number }>(`/usage/estimate?provider=${encodeURIComponent(provider.id)}&model=${encodeURIComponent(model)}`);
    estimates.value[key] = data.cost;
    estimateExchanges.value = data.exchanges;
  } catch {
    // Left out when it cannot be worked out.
  }
}
function estimateText(provider: Provider) {
  const amount = estimates.value[estimateKey(provider)];
  return typeof amount === "number" ? t("usage.estimate", { count: estimateExchanges.value, cost: cost(amount) }) : "";
}
watch(
  () => providerDrafts.value.map(estimateKey).join("|"),
  () => { providerDrafts.value.forEach((provider) => { void loadEstimate(provider); }); },
);
/** Which services can usually be reached from where this computer's clock is set. */
const regionNote = computed(() => mainlandChinaClock() && !store.settings?.modelReady);

// Learners sharing this computer: each has conversations, memories, words and level of their own.
interface LearnerProfile { id: string; name: string; createdAt: string; active: boolean; targetLanguageCode: string }
const profiles = ref<LearnerProfile[]>([]);
const maxProfiles = ref(12);
const newProfileName = ref("");
const profileBusy = ref("");
const profileError = ref("");
const renaming = ref("");
const renameDraft = ref("");
const removingProfile = ref<LearnerProfile | null>(null);
function profileFailure(error: unknown) {
  const known: Record<string, string> = {
    PROFILE_LIMIT: "profiles.errorLimit",
    PROFILE_NAME_INVALID: "profiles.errorName",
    PROFILE_NAME_TAKEN: "profiles.errorTaken",
    PROFILE_BUSY: "profiles.errorBusy",
    PROFILE_IN_USE: "profiles.errorInUse",
  };
  return t(error instanceof ApiError && error.code && known[error.code] ? known[error.code] : "common.operationFailed");
}
function profileName(profile: LearnerProfile) {
  return profile.name || t("profiles.first");
}
function profileLanguage(profile: LearnerProfile) {
  return profile.targetLanguageCode ? displayTargetLanguage(profile.targetLanguageCode, locale.value) : "";
}
async function loadProfiles() {
  try {
    const data = await api.get<{ max: number; profiles: LearnerProfile[] }>("/profiles");
    profiles.value = data.profiles;
    maxProfiles.value = data.max;
  } catch {
    // The list stays as it was.
  }
}
async function addProfile() {
  const name = newProfileName.value.trim();
  if (!name || profileBusy.value) return;
  profileBusy.value = "add";
  profileError.value = "";
  try {
    profiles.value = (await api.post<{ profiles: LearnerProfile[] }>("/profiles", { name })).profiles;
    newProfileName.value = "";
  } catch (error) {
    profileError.value = profileFailure(error);
  } finally {
    profileBusy.value = "";
  }
}
function startRename(profile: LearnerProfile) {
  renaming.value = profile.id;
  renameDraft.value = profile.name;
  profileError.value = "";
}
async function saveRename() {
  const id = renaming.value;
  const name = renameDraft.value.trim();
  if (!id || !name || profileBusy.value) return;
  profileBusy.value = id;
  profileError.value = "";
  try {
    profiles.value = (await api.patch<{ profiles: LearnerProfile[] }>(`/profiles/${id}`, { name })).profiles;
    renaming.value = "";
  } catch (error) {
    profileError.value = profileFailure(error);
  } finally {
    profileBusy.value = "";
  }
}
/** Another learner's conversations, memories, words and level take the place of this one's. */
async function switchProfile(profile: LearnerProfile) {
  if (profile.active || profileBusy.value) return;
  profileBusy.value = profile.id;
  profileError.value = "";
  try {
    await api.post(`/profiles/${profile.id}/activate`);
    // Everything on screen belongs to the learner who just left: the app starts over.
    window.location.assign("/");
  } catch (error) {
    profileError.value = profileFailure(error);
    profileBusy.value = "";
  }
}
async function removeProfile() {
  const target = removingProfile.value;
  if (!target || profileBusy.value) return;
  profileBusy.value = target.id;
  profileError.value = "";
  try {
    profiles.value = (await api.delete<{ profiles: LearnerProfile[] }>(`/profiles/${target.id}`)).profiles;
  } catch (error) {
    profileError.value = profileFailure(error);
  } finally {
    removingProfile.value = null;
    profileBusy.value = "";
  }
}

// Opening the app from other devices on the same network. Only the computer it runs on may change this.
interface LanStatus { enabled: boolean; listening: boolean; code: string; addresses: string[] }
const lan = ref<LanStatus | null>(null);
const lanBusy = ref(false);
const lanRestart = computed(() => Boolean(lan.value && lan.value.enabled !== lan.value.listening));
async function loadLan() {
  try {
    lan.value = await api.get<LanStatus>("/lan");
  } catch {
    lan.value = null;
  }
}
async function changeLan(request: () => Promise<LanStatus>) {
  if (lanBusy.value) return;
  lanBusy.value = true;
  try {
    lan.value = await request();
  } catch {
    store.notify(t("common.operationFailed"));
  } finally {
    lanBusy.value = false;
  }
}
function setLan(enabled: boolean) {
  return changeLan(() => api.put<LanStatus>("/lan", { enabled }));
}
function renewLanCode() {
  return changeLan(() => api.post<LanStatus>("/lan/code"));
}
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    store.notify(t("settings.copied"));
  } catch {
    store.notify(t("settings.copyFailed"));
  }
}

initializeDrafts();
onMounted(() => {
  void loadUsage();
  void loadProfiles();
  void loadLan();
  providerDrafts.value.forEach((provider) => { void loadEstimate(provider); });
  browserSpeech.initialize();
  void loadRemote();
  void loadSpeechCapabilities(true);
});

  return { store, route, router, t, locale, requestedTab, tab, testing, savingProvider, loadingModels, clearingKey, confirmReset, resetting, result, verified, setupReceipts, availableModels, keys, providerDrafts, providerBaselines, defaultProvider, webLookupEnabled, memoryTidyEnabled, languageDraft, languageBaseline, remote, loadingRemote, modelRequired, languageDirty, webLookupDirty, speechAvailable, voiceSources, voiceInputChoice, audioProviderName, voiceInputNotes, voiceBrowserWarning, speechPlatform, speechRecommendationKey, displayedSpeechRate, displayedTargetLanguage, currentProviderName, selectableProviders, languages, cloneValue, prepareProviderDraft, syncLanguageDraft, syncProviderDraft, initializeDrafts, safeReturnTo, continuePracticeIfReady, saveLanguagePreferences, saveDefaultProvider, setLanguage, providerSignature, providerOverrides, rememberModelProfile, activateModel, updateActiveModelProfile, hasModelList, modelsLoaded, currentModelIsOfficial, modelLabel, invalidateProvider, providerHasChanges, savedCapabilityMatches, providerStatus, providerName, saveWebLookup, saveMemoryTidy, friendlyError, runProviderTest, saveProvider, deleteProviderKey, test, loadModels, downloadBackup, resetAllConfig, loadRemote, copyRemoteUrl, registers, variantChoices, variantName, reviewProvider, saveReviewProvider, CUSTOM_ID, customDraft, savingCustom, customError, customSaved, customDirty, syncCustomDraft, applyCustomChange, saveCustomEndpoint, removeCustomEndpoint, typeModel, usage, usageFailed, limitDraft, savingLimit, cost, loadUsage, usageTasks, usageModels, usageMonth, limitDirty, saveLimit, priceDrafts, savingPrice, savedPrice, syncPriceDraft, priceChanged, savePrice, estimates, estimateExchanges, estimateKey, loadEstimate, estimateText, regionNote, profiles, maxProfiles, newProfileName, profileBusy, profileError, renaming, renameDraft, removingProfile, profileFailure, profileName, profileLanguage, loadProfiles, addProfile, startRename, saveRename, switchProfile, removeProfile, lan, lanBusy, lanRestart, loadLan, changeLan, setLan, renewLanCode, copyText }
}
