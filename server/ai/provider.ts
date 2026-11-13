import { createHash, randomUUID } from 'node:crypto'
import type { AppConfig, ProviderCapability, ProviderConfig, StructuredOutputMode } from '../types.js'
import { getConfig, getSecrets } from '../services/config.js'
import { parseModelJson } from '../utils/json.js'
import { coachTurnSchema, providerCertificationSchema, responseJsonSchema } from './schemas.js'
import { probeProviderLookup } from '../lookup/provider-tools.js'
import { hasQuestion, isQuestionOnly } from './dialogue-policy.js'

export interface ModelMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface GenerateOptions {
  json?: boolean
  structured?: {
    name: string
    schema: Record<string, unknown>
  }
  outputMode?: StructuredOutputMode
  maxOutputTokens?: number
  temperature?: number
  timeoutMs?: number
  retries?: number
}

export interface ModelClient {
  id: string
  outputMode: StructuredOutputMode
  generate(messages: ModelMessage[], options?: GenerateOptions): Promise<string>
}

export interface ProviderTestOverrides {
  apiKey?: string
  model?: string
}

export interface ProviderModelOption {
  id: string
  displayName: string
  contextWindowTokens?: number
  maxOutputTokens?: number
}

export const STRUCTURED_CONTRACT_VERSION = 7

const pendingCertifications = new Map<string, {
  providerId: string
  capability: ProviderCapability
  keyHash: string
  expiresAt: number
}>()

const pendingModelDiscoveries = new Map<string, {
  providerId: string
  modelIds: Set<string>
  keyHash: string
  expiresAt: number
}>()

function secretHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export async function consumeProviderCertification(providerId: string, token: string, capability: ProviderCapability, enteredKey = '') {
  const pending = pendingCertifications.get(token)
  pendingCertifications.delete(token)
  if (!pending || pending.expiresAt < Date.now() || pending.providerId !== providerId) return false
  if (JSON.stringify(pending.capability) !== JSON.stringify(capability)) return false
  const config = await getConfig()
  const provider = config.providers.find((item) => item.id === providerId)
  if (!provider) return false
  const secrets = await getSecrets()
  const key = enteredKey.trim() || (provider.apiKeySecret ? secrets[provider.apiKeySecret] || '' : '')
  return Boolean(key && secretHash(key) === pending.keyHash)
}

export async function consumeProviderModelDiscovery(providerId: string, token: string, model: string, enteredKey = '') {
  const pending = pendingModelDiscoveries.get(token)
  pendingModelDiscoveries.delete(token)
  if (!pending || pending.expiresAt < Date.now() || pending.providerId !== providerId || !pending.modelIds.has(model)) return false
  const config = await getConfig()
  const provider = config.providers.find((item) => item.id === providerId)
  if (!provider) return false
  const secrets = await getSecrets()
  const key = enteredKey.trim() || (provider.apiKeySecret ? secrets[provider.apiKeySecret] || '' : '')
  return Boolean(key && secretHash(key) === pending.keyHash)
}

export function structuredOutputModes(provider: Pick<ProviderConfig, 'id' | 'kind'>): StructuredOutputMode[] {
  if (provider.id === 'deepseek') return ['json_object', 'prompt_json']
  return ['json_schema', 'prompt_json']
}

export class ModelConfigurationError extends Error {
  statusCode = 409
  code = 'MODEL_CONFIGURATION_REQUIRED'

  constructor(message = 'Configure a model provider before starting a conversation') {
    super(message)
    this.name = 'ModelConfigurationError'
  }
}

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public providerStatus?: number,
  ) {
    super(message)
    this.name = 'ProviderRequestError'
  }
}

const retryableStatuses = new Set([429, 500, 502, 503, 504])

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryDelay(response: Response | undefined, attempt: number) {
  const retryAfter = Number(response?.headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 8_000)
  return Math.min(650 * 2 ** attempt + Math.floor(Math.random() * 250), 5_000)
}

async function fetchWithRetry(url: string, init: RequestInit, options: { timeoutMs?: number; retries?: number } = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000
  const retries = options.retries ?? 0
  let lastNetworkError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      if (!retryableStatuses.has(response.status) || attempt === retries) return response
      await response.body?.cancel().catch(() => undefined)
      await wait(retryDelay(response, attempt))
    } catch (error) {
      lastNetworkError = error
      if (attempt === retries) break
      await wait(retryDelay(undefined, attempt))
    }
  }

  const timedOut = lastNetworkError instanceof Error && (lastNetworkError.name === 'TimeoutError' || lastNetworkError.name === 'AbortError')
  throw new ProviderRequestError(
    timedOut ? '模型服务响应超时，请稍后重试或切换其他模型。' : '无法连接模型厂商的官方服务，请检查网络。',
    timedOut ? 504 : 502,
    timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_ERROR',
  )
}

export function providerErrorMessage(status: number, detail: string) {
  if (status === 401 || status === 403) return ['API Key 无效、权限不足，或该密钥无法访问当前模型。', 422, 'PROVIDER_AUTH_FAILED'] as const
  if (status === 402) return ['模型账户余额不足，请充值后重试。', 422, 'PROVIDER_BALANCE_REQUIRED'] as const
  if (status === 429) return ['模型服务请求过于频繁，请稍后重试。', 503, 'PROVIDER_RATE_LIMITED'] as const
  if (status === 500 || status === 502 || status === 503 || status === 504) return ['模型厂商服务暂时不可用，请稍后重试或切换其他模型。', 503, 'PROVIDER_UNAVAILABLE'] as const
  if (status === 404) return ['模型名称不存在或当前账号无法访问，请重新选择模型。', 422, 'PROVIDER_NOT_FOUND'] as const
  if (status === 413) {
    return ['本次发送的内容超过当前模型接口允许的输入大小。应用会尝试使用更紧凑的近期上下文；如果仍然失败，请调小上下文预算或换用上下文更长的模型。', 422, 'PROVIDER_CONTEXT_LIMIT'] as const
  }
  if ((status === 400 || status === 422) && /context.{0,20}(length|window)|too many (input )?tokens|maximum context/i.test(detail)) {
    return ['这段对话超过当前模型能读取的上下文长度。应用会尝试使用更紧凑的近期上下文；如果仍然失败，请调小上下文预算或换用上下文更长的模型。', 422, 'PROVIDER_CONTEXT_LIMIT'] as const
  }
  if (status === 400 || status === 422) return [`请求参数与当前模型不兼容。${detail ? ` ${detail}` : ''}`, 422, 'PROVIDER_INVALID_REQUEST'] as const
  return [`模型服务返回错误（${status}）。${detail ? ` ${detail}` : ''}`, 502, 'PROVIDER_ERROR'] as const
}

async function checkedJson(response: Response) {
  const text = await response.text()
  if (!response.ok) {
    let detail = ''
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
      detail = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message || parsed.message || ''
    } catch {
      detail = text.slice(0, 240)
    }
    const [message, statusCode, code] = providerErrorMessage(response.status, detail.slice(0, 240))
    throw new ProviderRequestError(message, statusCode, code, response.status)
  }
  try { return JSON.parse(text) as Record<string, any> }
  catch { throw new ProviderRequestError('模型服务返回了无法解析的数据。', 502, 'PROVIDER_INVALID_RESPONSE') }
}

function keyFor(provider: ProviderConfig, secrets: Record<string, string>) {
  return provider.apiKeySecret ? secrets[provider.apiKeySecret] || '' : ''
}

function modelUsesFixedSampling(provider: ProviderConfig) {
  return provider.id === 'kimi' && /^kimi-k(?:2\.[67]|3)/i.test(provider.model)
}

function isOpenAiReasoningModel(provider: ProviderConfig) {
  return provider.id === 'openai' && /^gpt-6/i.test(provider.model)
}

function openAiReasoningEffort(provider: ProviderConfig): 'none' | 'low' | undefined {
  if (!isOpenAiReasoningModel(provider)) return undefined
  // Astra and 6.1 Sol reject `none`. Unknown GPT-6 variants take the safer
  // common denominator (`low`); only models whose current specs explicitly
  // support non-reasoning mode get `none` and custom sampling parameters.
  if (/^gpt-6(?:\.1)?-(?:terra|luna)$/i.test(provider.model) || /^gpt-6-sol$/i.test(provider.model)) return 'none'
  return 'low'
}

function isKimiK3(provider: ProviderConfig) {
  return provider.id === 'kimi' && /^kimi-k3(?:\.|$|-)/i.test(provider.model)
}

function isCurrentClaude(provider: ProviderConfig) {
  return provider.id === 'anthropic' && /^claude-(?:fable|mythos|opus|sonnet|haiku)-5/i.test(provider.model)
}

export function buildOpenAiPayload(provider: ProviderConfig, config: AppConfig, messages: ModelMessage[], options: GenerateOptions = {}) {
  const payload: Record<string, unknown> = { model: provider.model, messages, stream: false }
  const temperature = options.temperature ?? config.llm.temperature
  const wantsJson = Boolean(options.json || options.structured)
  const outputMode = options.outputMode || provider.capability?.outputMode || (provider.id === 'deepseek' ? 'json_object' : 'json_schema')

  if (provider.id === 'deepseek') {
    payload.thinking = { type: 'disabled' }
    payload.temperature = temperature
  } else if (isKimiK3(provider)) {
    payload.reasoning_effort = 'low'
  } else if (provider.id === 'kimi' && /^kimi-k2\.6/i.test(provider.model)) {
    payload.thinking = { type: 'disabled' }
  } else if (isOpenAiReasoningModel(provider)) {
    const effort = openAiReasoningEffort(provider)!
    payload.reasoning_effort = effort
    if (effort === 'none') payload.temperature = temperature
  } else if (!modelUsesFixedSampling(provider)) {
    payload.temperature = temperature
  }

  if (options.maxOutputTokens) {
    if (isOpenAiReasoningModel(provider) || isKimiK3(provider)) payload.max_completion_tokens = options.maxOutputTokens
    else payload.max_tokens = options.maxOutputTokens
  }
  if (options.structured && outputMode === 'json_schema') {
    payload.response_format = {
      type: 'json_schema',
      json_schema: { name: options.structured.name, strict: true, schema: options.structured.schema },
    }
  } else if (wantsJson && outputMode === 'json_object') {
    payload.response_format = { type: 'json_object' }
  }
  return payload
}

export function buildGeminiBody(provider: ProviderConfig, config: AppConfig, messages: ModelMessage[], options: GenerateOptions = {}) {
  const systemInstruction = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n')
  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }))
  const generationConfig: Record<string, unknown> = {}
  const outputMode = options.outputMode || provider.capability?.outputMode || 'json_schema'
  if (/^gemini-3/i.test(provider.model)) generationConfig.thinkingConfig = { thinkingLevel: 'low' }
  else generationConfig.temperature = options.temperature ?? config.llm.temperature
  if ((options.json || options.structured) && outputMode !== 'prompt_json') generationConfig.responseMimeType = 'application/json'
  if (options.structured && outputMode === 'json_schema') generationConfig.responseJsonSchema = options.structured.schema
  if (options.maxOutputTokens) generationConfig.maxOutputTokens = options.maxOutputTokens
  return { systemInstruction: { parts: [{ text: systemInstruction }] }, contents, generationConfig }
}

export function buildAnthropicBody(provider: ProviderConfig, config: AppConfig, messages: ModelMessage[], options: GenerateOptions = {}, outputMode: StructuredOutputMode = 'json_schema') {
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n')
  const rest = messages.filter((message) => message.role !== 'system')
  const body: Record<string, unknown> = {
    model: provider.model,
    system,
    messages: rest,
    max_tokens: options.maxOutputTokens || provider.maxOutputTokens,
  }
  const outputConfig: Record<string, unknown> = {}
  if (isCurrentClaude(provider)) outputConfig.effort = 'low'
  // API version 2026-10-21 removed temperature/top_p/top_k for every model.
  // Older model IDs must not inherit the OpenAI-style sampling branch either.
  if (options.structured && (options.outputMode || outputMode) === 'json_schema') {
    outputConfig.format = { type: 'json_schema', schema: options.structured.schema }
  }
  if (Object.keys(outputConfig).length) body.output_config = outputConfig
  return body
}

function assertOpenAiCompletion(choice: any) {
  if (choice?.finish_reason === 'length') {
    throw new ProviderRequestError('模型接口报告本次生成触发了长度上限，返回内容不完整。', 422, 'PROVIDER_TRUNCATED_RESPONSE')
  }
  if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal) {
    throw new ProviderRequestError('模型拒绝或中止了这次内容生成，请调整输入后重试。', 422, 'PROVIDER_REFUSAL')
  }
}

function openAiClient(provider: ProviderConfig, key: string, config: AppConfig, outputMode: StructuredOutputMode): ModelClient {
  return {
    id: provider.id,
    outputMode,
    async generate(messages, options = {}) {
      const endpoint = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`
      const headers = { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }
      const payload = buildOpenAiPayload(provider, config, messages, options)
      const response = await fetchWithRetry(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }, options)

      const json = await checkedJson(response)
      const choice = json.choices?.[0]
      assertOpenAiCompletion(choice)
      const content = choice?.message?.content
      if (typeof content !== 'string' || !content.trim()) throw new ProviderRequestError('模型返回了空内容，请重试。', 502, 'PROVIDER_EMPTY_RESPONSE')
      return content
    },
  }
}

function anthropicClient(provider: ProviderConfig, key: string, config: AppConfig, outputMode: StructuredOutputMode): ModelClient {
  return {
    id: provider.id,
    outputMode,
    async generate(messages, options = {}) {
      const response = await fetchWithRetry(`${provider.baseUrl.replace(/\/$/, '')}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'anthropic-version': '2026-10-21' },
        body: JSON.stringify(buildAnthropicBody(provider, config, messages, options, outputMode)),
      }, options)
      const json = await checkedJson(response)
      if (json.stop_reason === 'max_tokens') throw new ProviderRequestError('模型接口报告本次生成触发了长度上限，返回内容不完整。', 422, 'PROVIDER_TRUNCATED_RESPONSE')
      if (json.stop_reason === 'refusal') throw new ProviderRequestError('模型拒绝了这次内容生成，请调整输入后重试。', 422, 'PROVIDER_REFUSAL')
      const content = json.content?.filter((item: any) => item.type === 'text').map((item: any) => item.text).join('\n') || ''
      if (!content.trim()) throw new ProviderRequestError('模型返回了空内容，请重试。', 502, 'PROVIDER_EMPTY_RESPONSE')
      return content
    },
  }
}

function geminiClient(provider: ProviderConfig, key: string, config: AppConfig, outputMode: StructuredOutputMode): ModelClient {
  return {
    id: provider.id,
    outputMode,
    async generate(messages, options = {}) {
      const url = `${provider.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(provider.model)}:generateContent`
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(buildGeminiBody(provider, config, messages, options)),
      }, options)
      const json = await checkedJson(response)
      const candidate = json.candidates?.[0]
      if (candidate?.finishReason === 'MAX_TOKENS') throw new ProviderRequestError('模型接口报告本次生成触发了长度上限，返回内容不完整。', 422, 'PROVIDER_TRUNCATED_RESPONSE')
      if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'BLOCKLIST' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
        throw new ProviderRequestError('模型拒绝或中止了这次内容生成，请调整输入后重试。', 422, 'PROVIDER_REFUSAL')
      }
      const content = candidate?.content?.parts?.map((part: any) => part.text).join('\n') || ''
      if (!content.trim()) throw new ProviderRequestError('模型返回了空内容，请重试。', 502, 'PROVIDER_EMPTY_RESPONSE')
      return content
    },
  }
}

async function resolveProvider(providerId?: string, overrides: ProviderTestOverrides = {}) {
  const config = await getConfig()
  const storedProvider = config.providers.find((item) => item.id === (providerId || config.llm.defaultProvider))
  const provider = storedProvider ? {
    ...storedProvider,
    ...(overrides.model !== undefined ? { model: overrides.model.trim() } : {}),
  } : undefined
  if (!provider) {
    if (providerId) throw Object.assign(new Error('Provider not found'), { statusCode: 404 })
    throw new ModelConfigurationError('Choose a default model provider before starting a conversation')
  }
  const secrets = await getSecrets()
  const enteredKey = overrides.apiKey?.trim()
  const key = enteredKey || keyFor(provider, secrets)
  if (provider.apiKeySecret && !key) throw new ModelConfigurationError(`Missing API key for ${provider.name}`)
  return { config, provider, key }
}

export async function getModelClient(providerId?: string, overrides: ProviderTestOverrides = {}): Promise<ModelClient> {
  const { config, provider, key } = await resolveProvider(providerId, overrides)
  if (!provider.model) throw new ModelConfigurationError('Complete the model name before starting a conversation')
  const capabilityMatches = provider.capability &&
    provider.capability.conversationReady === true &&
    provider.capability.lookupReady === true &&
    provider.capability.contractVersion === STRUCTURED_CONTRACT_VERSION &&
    provider.capability.model === provider.model &&
    provider.capability.baseUrl.replace(/\/$/, '') === provider.baseUrl.replace(/\/$/, '')
  if (!providerId && !capabilityMatches) throw new ModelConfigurationError('请先在设置中重新测试并保存当前模型，确认它适合自然对话。')
  const outputMode = capabilityMatches ? provider.capability!.outputMode : provider.id === 'deepseek' ? 'json_object' : 'json_schema'
  if (provider.kind === 'anthropic') return anthropicClient(provider, key, config, outputMode)
  if (provider.kind === 'gemini') return geminiClient(provider, key, config, outputMode)
  return openAiClient(provider, key, config, outputMode)
}

export async function testProvider(providerId: string, overrides: ProviderTestOverrides = {}) {
  const { provider, key } = await resolveProvider(providerId, overrides)
  if (!provider.model) throw new ModelConfigurationError('Complete the model name before testing')
  const client = await getModelClient(providerId, overrides)
  const schema = responseJsonSchema(coachTurnSchema)
  const modes = structuredOutputModes(provider)
  let lastError: unknown
  for (const outputMode of modes) {
    try {
      const output = await client.generate([
        { role: 'system', content: 'Return exactly one compact JSON object: {"roleReply":"OK","reconstruction":null,"corrections":[],"lookup":{"action":"reply","parts":[],"query":"","locator":null},"statePatch":{"currentTopic":"check","openedLoops":[],"resolvedLoops":[],"sceneFacts":[],"userFacts":[]}}.' },
        { role: 'user', content: 'Run the connection and structured-output check.' },
      ], { structured: { name: 'connection_check', schema }, outputMode, temperature: 0, maxOutputTokens: 800, timeoutMs: 20_000, retries: 0 })
      const parsed = parseModelJson<Record<string, unknown>>(output)
      if (
        typeof parsed.roleReply !== 'string' ||
        !/\bok\b/i.test(parsed.roleReply) ||
        !Array.isArray(parsed.corrections) ||
        !parsed.lookup ||
        !parsed.statePatch ||
        typeof parsed.statePatch !== 'object' ||
        parsed.reconstruction !== null
      ) {
        throw new Error('Structured reply did not satisfy the conversation contract')
      }
      const certificationSchema = responseJsonSchema(providerCertificationSchema)
      const certificationOutput = await client.generate([
        {
          role: 'system',
          content: [
            'Return one JSON object with a cases array. For every case write one compact natural English conversation reply, decide lookupAction as reply/clarify/lookup, and give locatorDomain only when the user specified a location.',
            'A reply must not be a questionnaire. Answer clear questions before any follow-up. Hold a plausible opinion. Never replace Boracay with Bohol.',
            'Use lookup for facts that may have changed, current availability, explicit lookup requests, and user-specified locations. Use reply for stable advice and ordinary conversation. Use clarify only when a missing identity or missing subject makes lookup impossible.',
            'When a case contains a short transcript, reply only to its final User turn. After two recent assistant questions, contribute without asking another question. Respect an explicit refusal to discuss a branch. Respond to emotion before changing subject.',
            'Required case ids: share, opinion, stable, dynamic, locator, entity, question_streak, boundary, support.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            '[share] I finally played basketball again after a stressful week.',
            '[opinion] Do you think playing half court is more fun than full court?',
            '[stable] I am going downstairs to play basketball. How should I warm up?',
            '[dynamic] Who is on the Houston Rockets roster right now?',
            '[locator] I saw a Reddit post saying the Rockets traded Alperen Sengun today. Can you look there?',
            '[entity] Can you still do sunset sailing in Boracay now?',
            '[question_streak] Assistant: What do you do? User: I am a software developer. Assistant: Do you mostly build web apps? User: Mostly backend services. User: AI has changed my work a lot lately.',
            '[boundary] Assistant: Do you often work overtime? User: I would rather not talk about my work hours.',
            '[support] User: I shipped the project, but I am too exhausted to feel happy.',
          ].join('\n'),
        },
      ], { structured: { name: 'conversation_readiness', schema: certificationSchema }, outputMode, temperature: 0.2, maxOutputTokens: 1_200, timeoutMs: 25_000, retries: 0 })
      const certificationRaw = parseModelJson<Record<string, unknown>>(certificationOutput)
      const certification = providerCertificationSchema.parse({
        ...certificationRaw,
        cases: Array.isArray(certificationRaw.cases)
          ? certificationRaw.cases.map((item) => item && typeof item === 'object'
            ? { ...item, locatorDomain: typeof (item as Record<string, unknown>).locatorDomain === 'string' ? (item as Record<string, unknown>).locatorDomain : null }
            : item)
          : [],
      })
      const cases = new Map(certification.cases.map((item) => [item.id, item]))
      const required = ['share', 'opinion', 'stable', 'dynamic', 'locator', 'entity', 'question_streak', 'boundary', 'support']
      const failures: string[] = []
      for (const id of required) if (!cases.has(id)) failures.push(`missing ${id}`)
      if (!failures.length) {
        if (isQuestionOnly(cases.get('share')!.reply)) failures.push('share was question-only')
        if (isQuestionOnly(cases.get('opinion')!.reply)) failures.push('opinion was question-only')
        if (hasQuestion(cases.get('question_streak')!.reply)) failures.push('question_streak asked another question')
        if (hasQuestion(cases.get('boundary')!.reply)) failures.push('boundary asked another question')
        if (isQuestionOnly(cases.get('support')!.reply)) failures.push('support was question-only')
        if (cases.get('stable')!.lookupAction !== 'reply') failures.push(`stable routed as ${cases.get('stable')!.lookupAction}`)
        if (cases.get('dynamic')!.lookupAction !== 'lookup') failures.push(`dynamic routed as ${cases.get('dynamic')!.lookupAction}`)
        if (cases.get('locator')!.lookupAction !== 'lookup') failures.push(`locator routed as ${cases.get('locator')!.lookupAction}`)
        if (!/reddit\.com$/iu.test(cases.get('locator')!.locatorDomain || '')) failures.push('locator did not preserve reddit.com')
        if (cases.get('entity')!.lookupAction !== 'lookup') failures.push(`entity routed as ${cases.get('entity')!.lookupAction}`)
        if (/bohol/iu.test(cases.get('entity')!.reply)) failures.push('entity drifted from Boracay to Bohol')
      }
      if (failures.length) throw new Error('Model did not pass: ' + failures.join('; '))
      try {
        await probeProviderLookup(provider, key, 20_000)
      } catch {
        throw new ProviderRequestError(
          '当前模型能对话，但不能用同一把 API Key 完成官方联网搜索。请换用当前厂商中支持联网的模型。',
          422,
          'PROVIDER_LOOKUP_UNSUPPORTED',
        )
      }
      const capability = {
        outputMode,
        conversationReady: true as const,
        lookupReady: true as const,
        baseUrl: provider.baseUrl.replace(/\/$/, ''),
        model: provider.model,
        contractVersion: STRUCTURED_CONTRACT_VERSION,
        testedAt: new Date().toISOString(),
      }
      const certificationToken = randomUUID()
      pendingCertifications.set(certificationToken, {
        providerId,
        capability,
        keyHash: secretHash(key),
        expiresAt: Date.now() + 10 * 60_000,
      })
      return { ok: true, message: provider.name + ' · ' + provider.model + ' 已通过自然对话测试', model: provider.model, capability, certificationToken }
    } catch (error) {
      if (error instanceof ProviderRequestError && !['PROVIDER_INVALID_REQUEST', 'PROVIDER_INVALID_RESPONSE', 'PROVIDER_EMPTY_RESPONSE'].includes(error.code)) throw error
      lastError = error
    }
  }
  throw new ProviderRequestError(lastError instanceof Error ? '模型已经连上了，但测试回复不完整：' + lastError.message : '模型已经连上了，但测试回复不完整。', 422, 'PROVIDER_TEST_FAILED')
}

export async function listProviderModels(providerId: string, overrides: ProviderTestOverrides = {}) {
  const { provider, key } = await resolveProvider(providerId, overrides)
  const baseUrl = provider.baseUrl.replace(/\/$/, '')
  let response: Response

  if (provider.kind === 'anthropic') {
    response = await fetchWithRetry(`${baseUrl}/models?limit=1000`, {
      headers: { authorization: `Bearer ${key}`, 'anthropic-version': '2026-10-21' },
    }, { timeoutMs: 15_000, retries: 0 })
  } else if (provider.kind === 'gemini') {
    response = await fetchWithRetry(`${baseUrl}/models?pageSize=1000`, {
      headers: { 'x-goog-api-key': key },
    }, { timeoutMs: 15_000, retries: 0 })
  } else {
    response = await fetchWithRetry(`${baseUrl}/models`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
    }, { timeoutMs: 15_000, retries: 0 })
  }

  const json = await checkedJson(response)
  const models = normalizeProviderModelOptions(provider, json)
  const discoveryToken = randomUUID()
  pendingModelDiscoveries.set(discoveryToken, {
    providerId,
    modelIds: new Set(models.map((model) => model.id)),
    keyHash: secretHash(key),
    expiresAt: Date.now() + 10 * 60_000,
  })
  return { models, discoveryToken }
}

function positiveInteger(value: unknown) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

export function normalizeProviderModelOptions(
  provider: Pick<ProviderConfig, 'kind'>,
  response: Record<string, any>,
): ProviderModelOption[] {
  const source = provider.kind === 'gemini' ? response.models : response.data || response.models
  if (!Array.isArray(source)) return []
  const seen = new Set<string>()
  const models: ProviderModelOption[] = []
  for (const item of source) {
    const record = typeof item === 'string' ? { id: item } : item
    if (!record || typeof record !== 'object') continue
    if (provider.kind === 'gemini' && Array.isArray(record.supportedGenerationMethods) &&
      !record.supportedGenerationMethods.includes('generateContent')) continue
    if (provider.kind === 'anthropic' && record.lifecycle && record.lifecycle !== 'active') continue
    const id = String(record.id || record.name || '').replace(/^models\//, '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const contextWindowTokens = positiveInteger(
      record.context_window ?? record.context_length ?? record.inputTokenLimit ?? record.max_input_tokens,
    )
    const maxOutputTokens = positiveInteger(
      record.max_output_tokens ?? record.outputTokenLimit ?? record.max_tokens,
    )
    models.push({
      id,
      displayName: String(record.display_name || record.displayName || record.name || id).replace(/^models\//, '').trim() || id,
      ...(contextWindowTokens ? { contextWindowTokens } : {}),
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
    })
    if (models.length >= 500) break
  }
  return models
}

export async function assertModelConfigured() {
  await getModelClient()
}
