import assert from 'node:assert/strict'
import test from 'node:test'
import { providerConfigurationKey } from './form-state.js'

test('provider dirty-state includes profiles for models that are not currently selected', () => {
  const base = {
    model: 'model-a',
    contextWindowTokens: 64_000,
    maxOutputTokens: 2_000,
    modelProfiles: {
      'model-a': { contextWindowTokens: 64_000, maxOutputTokens: 2_000 },
      'model-b': { contextWindowTokens: 32_768, maxOutputTokens: 1_200 },
    },
  }
  const changed = structuredClone(base)
  changed.modelProfiles['model-b'].maxOutputTokens = 3_000
  assert.notEqual(providerConfigurationKey(base), providerConfigurationKey(changed))
})
