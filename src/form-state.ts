import type { Provider, Settings } from './types'
import { DEFAULT_SPEECH_RATE } from '../shared/speech'

type LearningPreferences = Pick<Settings, 'ui' | 'learning'>

/** Stable comparison key for fields owned by the learning-preferences form. */
export function learningPreferencesKey(value: LearningPreferences) {
  return JSON.stringify([
    value.ui.locale,
    value.learning.targetLanguageCode,
    value.learning.targetLanguage,
    value.learning.proficiency,
    value.learning.correctionLevel,
    value.learning.speechRate ?? DEFAULT_SPEECH_RATE,
    value.learning.reviewInConversation !== false,
    value.learning.voiceInput === 'model' ? 'model' : 'browser',
    value.learning.listenFirst === true,
    value.learning.variant || '',
    value.learning.register || 'neutral',
  ])
}

/** Only user-editable provider fields participate in dirty-state checks. */
export function providerConfigurationKey(
  provider: Pick<Provider, 'model' | 'contextWindowTokens' | 'maxOutputTokens' | 'modelProfiles'>,
) {
  const profiles = Object.entries(provider.modelProfiles || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([model, profile]) => [model, profile.contextWindowTokens, profile.maxOutputTokens])
  return JSON.stringify([
    provider.model.trim(),
    provider.contextWindowTokens,
    provider.maxOutputTokens,
    profiles,
  ])
}

export function hasMeaningfulTextChange(current: string, initial: string) {
  const next = current.trim()
  return next.length > 0 && next !== initial.trim()
}
