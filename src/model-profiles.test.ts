import assert from 'node:assert/strict'
import test from 'node:test'
import { switchProviderModel } from './model-profiles.js'
import type { Provider } from './types.js'

function provider(): Provider {
  return {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    model: 'model-a',
    apiKeySecret: 'providers.openai.apiKey',
    enabled: true,
    contextWindowTokens: 64_000,
    maxOutputTokens: 2_000,
    modelProfiles: {},
  }
}

test('switching models keeps separate token budgets for each model', () => {
  const draft = provider()

  switchProviderModel(draft, 'model-b')
  assert.deepEqual(draft.modelProfiles?.['model-a'], {
    contextWindowTokens: 64_000,
    maxOutputTokens: 2_000,
  })
  assert.equal(draft.contextWindowTokens, 32_768)
  assert.equal(draft.maxOutputTokens, 1_200)

  draft.contextWindowTokens = 128_000
  draft.maxOutputTokens = 4_000
  switchProviderModel(draft, 'model-a')
  assert.deepEqual(draft.modelProfiles?.['model-b'], {
    contextWindowTokens: 128_000,
    maxOutputTokens: 4_000,
  })
  assert.equal(draft.contextWindowTokens, 64_000)
  assert.equal(draft.maxOutputTokens, 2_000)
})
