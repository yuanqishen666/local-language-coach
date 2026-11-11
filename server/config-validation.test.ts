import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultConfig, validateConfig } from './services/config.js'

test('an unconfigured provider does not ship with a hard-coded model name', () => {
  const config = structuredClone(defaultConfig)
  assert.equal(config.providers.every((provider) => provider.model === ''), true)
  assert.doesNotThrow(() => validateConfig(config))
})

test('configured providers require a model and accept separate model profiles', () => {
  const config = structuredClone(defaultConfig)
  const provider = config.providers[0]
  provider.enabled = true
  assert.throws(() => validateConfig(config), /Provider model is invalid/)

  provider.model = 'model-a'
  provider.modelProfiles = {
    'model-a': { contextWindowTokens: 64_000, maxOutputTokens: 2_000 },
    'model-b': { contextWindowTokens: 128_000, maxOutputTokens: 4_000 },
  }
  assert.doesNotThrow(() => validateConfig(config))
})
