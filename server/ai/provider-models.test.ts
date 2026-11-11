import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeProviderModelOptions } from './provider.js'

test('normalizes official OpenAI model ids without inventing metadata', () => {
  assert.deepEqual(normalizeProviderModelOptions({ kind: 'openai' }, {
    data: [{ id: 'gpt-current', object: 'model' }],
  }), [{ id: 'gpt-current', displayName: 'gpt-current' }])
})

test('keeps only active Anthropic models and their official token limits', () => {
  assert.deepEqual(normalizeProviderModelOptions({ kind: 'anthropic' }, {
    data: [
      { id: 'claude-current', display_name: 'Claude Current', lifecycle: 'active', max_input_tokens: 200_000, max_tokens: 16_000 },
      { id: 'claude-retired', display_name: 'Claude Retired', lifecycle: 'retired' },
    ],
  }), [{
    id: 'claude-current',
    displayName: 'Claude Current',
    contextWindowTokens: 200_000,
    maxOutputTokens: 16_000,
  }])
})

test('filters Gemini models that cannot generate content and maps official limits', () => {
  assert.deepEqual(normalizeProviderModelOptions({ kind: 'gemini' }, {
    models: [
      { name: 'models/gemini-chat', displayName: 'Gemini Chat', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 1_000_000, outputTokenLimit: 8_192 },
      { name: 'models/text-embedding', supportedGenerationMethods: ['embedContent'] },
    ],
  }), [{
    id: 'gemini-chat',
    displayName: 'Gemini Chat',
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 8_192,
  }])
})

test('maps DeepSeek and Kimi metadata returned by their official model lists', () => {
  assert.deepEqual(normalizeProviderModelOptions({ kind: 'deepseek' }, {
    data: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', context_window: 64_000, max_output_tokens: 8_000 }],
  }), [{
    id: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    contextWindowTokens: 64_000,
    maxOutputTokens: 8_000,
  }])
  assert.deepEqual(normalizeProviderModelOptions({ kind: 'kimi' }, {
    data: [{ id: 'kimi-current', context_length: 131_072 }],
  }), [{
    id: 'kimi-current',
    displayName: 'kimi-current',
    contextWindowTokens: 131_072,
  }])
})
