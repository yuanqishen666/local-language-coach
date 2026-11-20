/**
 * The record of what model requests used, and an estimate of what they cost.
 *
 * Kept in a file of its own beside the learner databases: the key that gets billed is shared by every
 * learner on this computer, so the month's total has to count all of them. A cost is worked out
 * from list prices when the request is recorded and never recomputed, so a later price change
 * leaves what was already spent as it was. It is an estimate, not a bill.
 */
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { dataRoot, getConfig, saveConfig } from './services/config.js'
import { MODEL_PRICES, PRICES_UPDATED, SPEECH_PRICES } from './pricing-table.js'
import { USAGE_TASKS, setUsageSink, usageScopeFor, withUsageScope, type UsageEntry, type UsageScope, type UsageTask } from './ai/usage-meter.js'
import { activeProfileId } from './profiles.js'

mkdirSync(dataRoot, { recursive: true, mode: 0o700 })
const usageDb = new DatabaseSync(path.join(dataRoot, 'usage.db'))
usageDb.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS model_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    profile_id TEXT NOT NULL DEFAULT '',
    provider_id TEXT NOT NULL,
    model TEXT NOT NULL,
    task TEXT NOT NULL,
    conversation_id TEXT,
    session_id TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    audio_seconds REAL NOT NULL DEFAULT 0,
    cost REAL,
    counted INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS model_usage_time_index ON model_usage(created_at);
  CREATE INDEX IF NOT EXISTS model_usage_conversation_index ON model_usage(profile_id, conversation_id);
  CREATE INDEX IF NOT EXISTS model_usage_session_index ON model_usage(profile_id, session_id);
`)

export interface Price { input: number; output: number }

/**
 * The list price of a model, in US dollars per million tokens. A dated or suffixed release is
 * priced as the model it is a release of, and a short name as its first listed release.
 */
export function priceFor(providerId: string, model: string, own?: Price): Price | undefined {
  if (own) return own
  const table = MODEL_PRICES[providerId]
  if (!table || !model) return undefined
  const names = Object.keys(table)
  const found = table[model] ? model
    : names.filter((name) => model.startsWith(name) && /[-:@_]/u.test(model[name.length])).sort((a, b) => b.length - a.length)[0]
      || names.filter((name) => name.startsWith(model) && /[-:@_]/u.test(name[model.length])).sort((a, b) => a.length - b.length)[0]
  return found ? { input: table[found][0], output: table[found][1] } : undefined
}

/** What a request is estimated to have cost in US dollars, or null when nothing is known about the model's price. */
export function estimateCost(entry: UsageEntry): number | null {
  if (entry.audioSeconds && entry.providerId === 'openai' && SPEECH_PRICES[entry.model] !== undefined) {
    return entry.audioSeconds / 60 * SPEECH_PRICES[entry.model]
  }
  const price = priceFor(entry.providerId, entry.model, entry.price)
  if (!price) return null
  return (entry.inputTokens * price.input + entry.outputTokens * price.output) / 1_000_000
}

/**
 * What one exchange in a conversation costs in tokens, for saying roughly what a model will cost
 * before it has been used. Sized on 2026-11-20, at four characters a token, from the three requests an exchange makes
 * (what to remember, the corrections, the reply): their instructions and answer formats come to
 * about 7,000 tokens, and a few lines of history, memories and conversation state to the rest.
 * No allowance is made for a provider's discount on repeated input, which makes the real figure lower.
 */
export const TYPICAL_EXCHANGE = { inputTokens: 9000, outputTokens: 600 }
export const TYPICAL_EXCHANGES = 20

/** What a conversation of twenty exchanges would cost on a model, or null when the model has no known price. */
export function typicalConversationCost(providerId: string, model: string, own?: Price) {
  return estimateCost({
    providerId, model, counted: false, price: own,
    inputTokens: TYPICAL_EXCHANGE.inputTokens * TYPICAL_EXCHANGES,
    outputTokens: TYPICAL_EXCHANGE.outputTokens * TYPICAL_EXCHANGES,
  })
}

export function recordUsage(entry: UsageEntry, scope: UsageScope, profileId: string, at = new Date().toISOString()) {
  usageDb.prepare(`INSERT INTO model_usage
    (created_at, profile_id, provider_id, model, task, conversation_id, session_id, input_tokens, output_tokens, audio_seconds, cost, counted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    at, profileId, entry.providerId, entry.model, scope.task, scope.conversationId || null, scope.sessionId || null,
    Math.round(entry.inputTokens), Math.round(entry.outputTokens), entry.audioSeconds || 0, estimateCost(entry), entry.counted ? 1 : 0,
  )
}

export interface Spend {
  /** US dollars. Requests whose model has no known price add nothing here and are counted in `unpriced`. */
  cost: number
  requests: number
  inputTokens: number
  outputTokens: number
  unpriced: number
  /** Requests whose token counts were worked out from the text because the provider stated none. */
  estimated: number
}

const SPEND = `COALESCE(SUM(cost), 0) AS cost, COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS inputTokens,
  COALESCE(SUM(output_tokens), 0) AS outputTokens, COALESCE(SUM(cost IS NULL), 0) AS unpriced, COALESCE(SUM(counted = 0), 0) AS estimated`

function spend(where: string, ...params: Array<string | number>): Spend {
  const found = usageDb.prepare(`SELECT ${SPEND} FROM model_usage WHERE ${where}`).get(...params) as unknown as Spend
  return { cost: Number(found.cost), requests: Number(found.requests), inputTokens: Number(found.inputTokens), outputTokens: Number(found.outputTokens), unpriced: Number(found.unpriced), estimated: Number(found.estimated) }
}

export function conversationSpend(profileId: string, conversationId: string) {
  return spend('profile_id = ? AND conversation_id = ?', profileId, conversationId)
}

export function sessionSpend(profileId: string, sessionId: string) {
  return spend('profile_id = ? AND session_id = ?', profileId, sessionId)
}

/**
 * Where the calendar month containing `now` starts and ends for someone whose clock is `offsetMinutes`
 * behind UTC (what `Date.prototype.getTimezoneOffset` reports), and the same for the month before.
 */
export function monthBounds(now: Date, offsetMinutes: number) {
  const offset = Number.isFinite(offsetMinutes) ? Math.max(-840, Math.min(840, Math.round(offsetMinutes))) : 0
  const local = new Date(now.getTime() - offset * 60_000)
  const at = (monthsOn: number) => new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + monthsOn, 1) + offset * 60_000).toISOString()
  return { previous: at(-1), from: at(0), to: at(1) }
}

export function monthUsage(now: Date, offsetMinutes: number) {
  const bounds = monthBounds(now, offsetMinutes)
  const within = 'created_at >= ? AND created_at < ?'
  const tasks = usageDb.prepare(`SELECT task, ${SPEND} FROM model_usage WHERE ${within} GROUP BY task`).all(bounds.from, bounds.to) as unknown as Array<Spend & { task: string }>
  const models = usageDb.prepare(`SELECT provider_id AS providerId, model, ${SPEND} FROM model_usage WHERE ${within} GROUP BY provider_id, model ORDER BY cost DESC, requests DESC`).all(bounds.from, bounds.to) as unknown as Array<Spend & { providerId: string; model: string }>
  return {
    from: bounds.from,
    to: bounds.to,
    month: spend(within, bounds.from, bounds.to),
    previous: spend(within, bounds.previous, bounds.from),
    tasks: USAGE_TASKS
      .map((task) => ({ task: task as UsageTask, found: tasks.find((item) => item.task === task) }))
      .filter((item) => item.found)
      .map(({ task, found }) => ({ task, cost: Number(found!.cost), requests: Number(found!.requests) })),
    models: models.map((item) => ({
      providerId: item.providerId,
      model: item.model,
      cost: Number(item.cost),
      requests: Number(item.requests),
      inputTokens: Number(item.inputTokens),
      outputTokens: Number(item.outputTokens),
      priced: Number(item.unpriced) < Number(item.requests),
    })),
  }
}

/** Books every request to the task its route belongs to. Has to be added before the routes it is to cover. */
export function registerUsageMeter(app: FastifyInstance) {
  setUsageSink((entry, scope) => recordUsage(entry, scope, activeProfileId()))
  app.addHook('preHandler', (request, _reply, done) => {
    withUsageScope(usageScopeFor(request.routeOptions?.url || '', request.params as Record<string, unknown>), done)
  })
}

export function registerUsageRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { offset?: string } }>('/api/usage', async (request) => {
    const config = await getConfig()
    const usage = monthUsage(new Date(), Number(request.query.offset))
    const limit = config.usage?.monthlyLimit ?? null
    return {
      currency: 'USD',
      pricesUpdated: PRICES_UPDATED,
      limit,
      overLimit: limit !== null && limit > 0 && usage.month.cost >= limit,
      ...usage,
    }
  })

  app.put<{ Body: { limit?: number | null } }>('/api/usage/limit', async (request) => {
    const limit = request.body?.limit
    if (limit !== null && limit !== undefined && (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0 || limit > 100_000)) {
      throw Object.assign(new Error('The reminder amount is invalid.'), { statusCode: 400, code: 'USAGE_LIMIT_INVALID' })
    }
    const config = await getConfig()
    const { monthlyLimit: _previous, ...rest } = config.usage || {}
    await saveConfig({ ...config, usage: limit ? { ...rest, monthlyLimit: Math.round(limit * 100) / 100 } : rest })
    return { limit: limit ? Math.round(limit * 100) / 100 : null }
  })

  /** The learner's own price for a provider, for a model the list does not know or a rate that differs from it. */
  app.put<{ Params: { id: string }; Body: { input?: number | null; output?: number | null } }>('/api/usage/prices/:id', async (request) => {
    const config = await getConfig()
    const provider = config.providers.find((item) => item.id === request.params.id)
    if (!provider) throw Object.assign(new Error('Provider not found'), { statusCode: 404 })
    const { input, output } = request.body || {}
    const valid = (amount: unknown): amount is number => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 && amount <= 10_000
    if (input === null || input === undefined || output === null || output === undefined) delete provider.price
    else if (valid(input) && valid(output)) provider.price = { input, output }
    else throw Object.assign(new Error('The price is invalid.'), { statusCode: 400, code: 'USAGE_PRICE_INVALID' })
    await saveConfig(config)
    return { id: provider.id, price: provider.price || null, listPrice: priceFor(provider.id, provider.model) || null }
  })

  app.get<{ Params: { id: string } }>('/api/usage/conversations/:id', async (request) => conversationSpend(activeProfileId(), request.params.id))

  app.get<{ Params: { id: string } }>('/api/usage/placement/:id', async (request) => sessionSpend(activeProfileId(), request.params.id))

  app.get<{ Querystring: { provider?: string; model?: string } }>('/api/usage/estimate', async (request) => {
    const provider = (await getConfig()).providers.find((item) => item.id === request.query.provider)
    const model = String(request.query.model || provider?.model || '').slice(0, 200)
    return {
      currency: 'USD',
      pricesUpdated: PRICES_UPDATED,
      exchanges: TYPICAL_EXCHANGES,
      cost: provider && model ? typicalConversationCost(provider.id, model, provider.price) : null,
    }
  })
}
