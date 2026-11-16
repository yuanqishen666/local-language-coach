import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultConfig, validateConfig } from './services/config.js'

test('an unconfigured provider does not ship with a hard-coded model name', () => {
  const config = structuredClone(defaultConfig)
  assert.equal(config.providers.every((provider) => provider.model === ''), true)
  assert.doesNotThrow(() => validateConfig(config))
})

test('speech rate defaults to a slower pace and validates the learning range', () => {
  const config = structuredClone(defaultConfig)
  assert.equal(config.learning.speechRate, 0.85)
  assert.doesNotThrow(() => validateConfig(config))

  delete config.learning.speechRate
  assert.doesNotThrow(() => validateConfig(config))

  config.learning.speechRate = 0.59
  assert.throws(() => validateConfig(config), /Speech rate is invalid/)
  config.learning.speechRate = 1.21
  assert.throws(() => validateConfig(config), /Speech rate is invalid/)
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

test('stored provider certifications remain loadable across contract upgrades', () => {
  const config = structuredClone(defaultConfig)
  const provider = config.providers.find((item) => item.id === 'deepseek')!
  provider.enabled = true
  provider.model = 'deepseek-chat'
  provider.capability = {
    outputMode: 'json_object',
    conversationReady: true,
    lookupReady: true,
    baseUrl: provider.baseUrl,
    model: provider.model,
    contractVersion: 6,
    testedAt: new Date().toISOString(),
  }

  assert.doesNotThrow(() => validateConfig(config))
  provider.capability.contractVersion = 7
  assert.doesNotThrow(() => validateConfig(config))
  provider.capability.contractVersion = 0
  assert.throws(() => validateConfig(config), /Provider capability is stale or invalid/)
})
