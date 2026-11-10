import type { Provider, Settings } from './types'

type LearningPreferences = Pick<Settings, 'ui' | 'learning'>

/** Stable comparison key for fields owned by the learning-preferences form. */
export function learningPreferencesKey(value: LearningPreferences) {
  return JSON.stringify([
    value.ui.locale,
    value.learning.targetLanguageCode,
    value.learning.targetLanguage,
    value.learning.proficiency,
    value.learning.correctionLevel,
  ])
}

/** Only user-editable provider fields participate in dirty-state checks. */
export function providerConfigurationKey(
  provider: Pick<Provider, 'model' | 'contextWindowTokens' | 'maxOutputTokens'>,
) {
  return JSON.stringify([
    provider.model.trim(),
    provider.contextWindowTokens,
    provider.maxOutputTokens,
  ])
}

export function hasMeaningfulTextChange(current: string, initial: string) {
  const next = current.trim()
  return next.length > 0 && next !== initial.trim()
}
