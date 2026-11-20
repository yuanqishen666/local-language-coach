// Generated from src/pages/OnboardingPage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import { type UiLocale } from '../../../shared/locales'
import { CEFR_LEVELS, stepParts } from '../../../shared/proficiency'
import { loadLevel, updateLevel } from '../../level'

export function useOnboardingPage() {
const store = useAppStore(); const router = useRouter(); const { t, locale } = useI18n()
const step = ref(1)
const saving = ref(false)
const submitError = ref('')
const levels = CEFR_LEVELS.map((level) => ({ id: level as string, key: `onboarding.level${level}` }))
// The level is either measured or chosen. Measuring is the default: 'test' stands for taking the placement test.
const TEST = 'test'
const draft = ref({ uiLocale: 'zh-CN' as UiLocale, language: 'English', code: 'en', level: TEST })
onMounted(() => {
  if (store.settings) draft.value = { uiLocale: store.settings.ui.locale, language: store.settings.learning.targetLanguage, code: store.settings.learning.targetLanguageCode, level: TEST }
  locale.value = draft.value.uiLocale
})
watch(() => draft.value.uiLocale, (value) => { locale.value = value })

function chooseLanguage(code: string, name: string) { draft.value.language = name; draft.value.code = code }
async function finish() {
  if (!store.settings || saving.value) return
  saving.value = true
  submitError.value = ''
  const next = {
    ...store.settings,
    setupComplete: true,
    ui: { ...store.settings.ui, locale: draft.value.uiLocale },
    learning: {
      ...store.settings.learning,
      targetLanguage: draft.value.language,
      targetLanguageCode: draft.value.code,
      proficiency: draft.value.level === TEST ? store.settings.learning.proficiency : draft.value.level,
    },
    providers: store.settings.providers.map((provider) => ({ ...provider })),
  }
  try {
    await store.save(next)
    locale.value = draft.value.uiLocale
    if (draft.value.level === TEST) {
      await router.replace('/placement')
      return
    }
    try {
      const picked = draft.value.level
      const overview = await loadLevel(draft.value.code)
      if (!overview.profile || stepParts(overview.profile.step).level !== picked) await updateLevel(draft.value.code, { level: picked, source: 'self' })
    } catch {
      // The level is also in the settings just saved, which conversations fall back to.
    }
    await router.replace('/')
  } catch {
    submitError.value = t('onboarding.saveError')
  } finally {
    saving.value = false
  }
}

  return { store, router, t, locale, step, saving, submitError, levels, TEST, draft, chooseLanguage, finish }
}
