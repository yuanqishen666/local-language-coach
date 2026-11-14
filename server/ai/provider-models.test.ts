import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultConfig } from '../services/config.js'
import type { ProviderConfig } from '../types.js'
import { buildAnthropicBody, buildGeminiBody, buildOpenAiPayload, normalizeProviderModelOptions, structuredOutputModes } from './provider.js'

const messages = [
  { role: 'system' as const, content: 'Return one JSON object.' },
  { role: 'user' as const, content: 'hello' },
]
const structured = {
  name: 'reply',
  schema: { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'], additionalProperties: false },
}

function provider(id: ProviderConfig['id'], model: string) {
  const selected = structuredClone(defaultConfig.providers.find((item) => item.id === id)!)
  selected.model = model
  return selected
}

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

test('builds DeepSeek structured requests with its supported JSON-object contract', () => {
  const payload = buildOpenAiPayload(provider('deepseek', 'deepseek-chat'), defaultConfig, messages, {
    structured,
    outputMode: 'json_object',
    maxOutputTokens: 1_200,
    temperature: 0.2,
  })

  assert.deepEqual(payload.response_format, { type: 'json_object' })
  assert.deepEqual(payload.thinking, { type: 'disabled' })
  assert.equal(payload.max_tokens, 1_200)
  assert.equal(payload.temperature, 0.2)
  assert.deepEqual(structuredOutputModes(provider('deepseek', 'deepseek-chat')), ['json_object', 'prompt_json'])
})

test('uses current OpenAI and Kimi reasoning request fields without incompatible sampling', () => {
  const openAi = buildOpenAiPayload(provider('openai', 'gpt-6-astra'), defaultConfig, messages, {
    structured,
    outputMode: 'json_schema',
    maxOutputTokens: 1_500,
  })
  assert.equal(openAi.reasoning_effort, 'low')
  assert.equal(openAi.max_completion_tokens, 1_500)
  assert.equal('temperature' in openAi, false)
  assert.equal((openAi.response_format as { type: string }).type, 'json_schema')

  const kimi = buildOpenAiPayload(provider('kimi', 'kimi-k3'), defaultConfig, messages, {
    structured,
    outputMode: 'json_schema',
    maxOutputTokens: 1_500,
  })
  assert.equal(kimi.reasoning_effort, 'low')
  assert.equal(kimi.max_completion_tokens, 1_500)
  assert.equal('temperature' in kimi, false)
  assert.deepEqual(structuredOutputModes(provider('kimi', 'kimi-k3')), ['json_schema', 'prompt_json'])
})

test('builds Gemini and Anthropic structured requests with provider-native fields', () => {
  const gemini = buildGeminiBody(provider('gemini', 'gemini-3-pro'), defaultConfig, messages, {
    structured,
    outputMode: 'json_schema',
    maxOutputTokens: 1_600,
  })
  assert.deepEqual(gemini.generationConfig.thinkingConfig, { thinkingLevel: 'low' })
  assert.equal(gemini.generationConfig.responseMimeType, 'application/json')
  assert.deepEqual(gemini.generationConfig.responseJsonSchema, structured.schema)
  assert.equal(gemini.generationConfig.maxOutputTokens, 1_600)

  const anthropic = buildAnthropicBody(provider('anthropic', 'claude-sonnet-5-5'), defaultConfig, messages, {
    structured,
    outputMode: 'json_schema',
    maxOutputTokens: 1_700,
  })
  assert.equal(anthropic.max_tokens, 1_700)
  assert.deepEqual(anthropic.output_config, {
    effort: 'low',
    format: { type: 'json_schema', schema: structured.schema },
  })
  assert.deepEqual(structuredOutputModes(provider('anthropic', 'claude-sonnet-5-5')), ['json_schema', 'prompt_json'])
})
