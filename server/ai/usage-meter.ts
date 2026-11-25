/**
 * What each model request used. The provider clients report it here and whoever keeps the books
 * listens; nothing in this file touches storage, so the clients load without a database.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

/** What a request was for, as the learner would name it. */
export const USAGE_TASKS = ['chat', 'review', 'placement', 'help', 'material', 'speech', 'setup', 'other'] as const
export type UsageTask = typeof USAGE_TASKS[number]

export interface UsageScope {
  task: UsageTask
  conversationId?: string
  /** A placement test. */
  sessionId?: string
}

export interface UsageEntry {
  providerId: string
  model: string
  inputTokens: number
  outputTokens: number
  /** Length of a recording sent to a speech-to-text model, which is billed by the minute. */
  audioSeconds?: number
  /** False when the provider stated no usage and the counts were worked out from the length of the text. */
  counted: boolean
  /** The learner's own price for this provider, in US dollars per million tokens. */
  price?: { input: number; output: number }
}

type Sink = (entry: UsageEntry, scope: UsageScope) => void

const scopes = new AsyncLocalStorage<UsageScope>()
let sink: Sink | undefined

export function setUsageSink(next?: Sink) {
  sink = next
}

type Gate = (scope: UsageScope) => void | Promise<void>
let gate: Gate | undefined

/** Lets whoever keeps the books turn a request away before it is sent, by throwing what the learner is to be told. */
export function setUsageGate(next?: Gate) {
  gate = next
}

/** Asked before each request to a model service. */
export async function admitUsage() {
  await gate?.(currentUsageScope())
}

/** Everything started inside `run`, including work that outlives it, is booked to `scope`. */
export function withUsageScope<T>(scope: UsageScope, run: () => T): T {
  return scopes.run(scope, run)
}

export function currentUsageScope(): UsageScope {
  return scopes.getStore() || { task: 'other' }
}

/** Adds what a request only learns part-way through, such as the conversation it has just created. */
export function tagUsage(patch: Partial<UsageScope>) {
  const scope = scopes.getStore()
  if (scope) Object.assign(scope, patch)
}

/** Book-keeping never gets to fail the request it is counting. */
export function reportUsage(entry: UsageEntry) {
  if (!sink) return
  try { sink(entry, currentUsageScope()) } catch { /* the reply matters more than its record */ }
}

/** Which task a request to this route belongs to. `route` is the route pattern, not the address asked for. */
export function usageScopeFor(route: string, params: Record<string, unknown> = {}): UsageScope {
  const id = typeof params.id === 'string' ? params.id : undefined
  if (route.startsWith('/api/placement')) return { task: 'placement', ...(id ? { sessionId: id } : {}) }
  if (route.startsWith('/api/speech')) return { task: 'speech' }
  if (route.startsWith('/api/providers') || route.startsWith('/api/settings')) return { task: 'setup' }
  if (route.startsWith('/api/practice')) return { task: 'review' }
  if (route.startsWith('/api/conversations/:id')) {
    const rest = route.slice('/api/conversations/:id'.length)
    const task: UsageTask = /^\/(recap|practice|assess|consolidate)/u.test(rest) ? 'review'
      : /\/(simpler|hint|translation)$/u.test(rest) ? 'help'
        : 'chat'
    return { task, ...(id ? { conversationId: id } : {}) }
  }
  if (/^\/api\/(words|lookup|translate|translations|reviews)/u.test(route)) return { task: 'help' }
  if (/^\/api\/(stories|imports|path|conversation-setups|conversation-presets|scenes)/u.test(route)) return { task: 'material' }
  if (route === '/api/conversations') return { task: 'chat' }
  return { task: 'other' }
}

const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0

/** The token counts a provider's reply states, whichever of the three reply shapes it has. */
export function statedUsage(json: any): { inputTokens: number; outputTokens: number } | undefined {
  const usage = json?.usage
  if (usage && typeof usage === 'object') {
    if ('prompt_tokens' in usage || 'completion_tokens' in usage) {
      return { inputTokens: count(usage.prompt_tokens), outputTokens: count(usage.completion_tokens) }
    }
    if ('input_tokens' in usage || 'output_tokens' in usage) {
      return {
        inputTokens: count(usage.input_tokens) + count(usage.cache_creation_input_tokens) + count(usage.cache_read_input_tokens),
        outputTokens: count(usage.output_tokens),
      }
    }
  }
  const meta = json?.usageMetadata
  if (meta && typeof meta === 'object' && ('promptTokenCount' in meta || 'candidatesTokenCount' in meta)) {
    return { inputTokens: count(meta.promptTokenCount), outputTokens: count(meta.candidatesTokenCount) + count(meta.thoughtsTokenCount) }
  }
  return undefined
}

/** A stand-in for a tokenizer: about one token per Chinese, Japanese or Korean character and one per four of anything else. */
export function roughTokens(text: string) {
  let wide = 0
  for (const char of text) if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(char)) wide += 1
  return wide + Math.ceil((text.length - wide) / 4)
}

/** Reports one answered request: the provider's own counts when it gives them, an estimate from the text otherwise. */
export function meterReply(
  provider: { id: string; model: string; price?: { input: number; output: number } },
  json: unknown,
  sent: string,
  received: string,
  model = provider.model,
) {
  const stated = statedUsage(json)
  reportUsage({
    providerId: provider.id,
    model,
    inputTokens: stated ? stated.inputTokens : roughTokens(sent),
    outputTokens: stated ? stated.outputTokens : roughTokens(received),
    counted: Boolean(stated),
    ...(provider.price ? { price: provider.price } : {}),
  })
}
