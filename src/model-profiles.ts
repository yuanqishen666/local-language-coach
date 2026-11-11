import type { Provider } from './types'

export const DEFAULT_CONTEXT_WINDOW = 32_768
export const DEFAULT_OUTPUT_LIMIT = 1_200

export function rememberProviderModelProfile(provider: Provider, model = provider.model) {
  const key = model.trim()
  if (!key) return
  provider.modelProfiles ||= {}
  provider.modelProfiles[key] = {
    contextWindowTokens: provider.contextWindowTokens,
    maxOutputTokens: provider.maxOutputTokens,
  }
}

export function switchProviderModel(
  provider: Provider,
  rawModel: string,
  previousModel = provider.model,
) {
  const model = rawModel.trim()
  rememberProviderModelProfile(provider, previousModel)
  provider.model = model
  const profile = model ? provider.modelProfiles?.[model] : undefined
  provider.contextWindowTokens = profile?.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW
  provider.maxOutputTokens = profile?.maxOutputTokens ?? DEFAULT_OUTPUT_LIMIT
  rememberProviderModelProfile(provider)
}
