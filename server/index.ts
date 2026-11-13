import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { nanoid } from 'nanoid'
import { getConfig, getSecrets, resetConfig, saveConfig, setSecret } from './services/config.js'
import { db, row, rows } from './services/database.js'
import { readAiResponseCache, writeAiResponseCache } from './services/ai-response-cache.js'
import { getRemoteStatus, isRemoteRequestAllowed, readRemoteState } from './services/remote.js'
import { safeJson } from './utils/json.js'
import { lookupCacheKey } from './utils/ai-cache-key.js'
import { translationCacheKey } from './utils/translation-cache.js'
import { coachTurn, localizeConversationSetup, localizeInterfaceValues, localizeMemoryValues, lookupTerm, suggestSetups, summarizeEpisode, translateMessage } from './ai/engine.js'
import { assertModelConfigured, consumeProviderCertification, consumeProviderModelDiscovery, listProviderModels, STRUCTURED_CONTRACT_VERSION, testProvider } from './ai/provider.js'
import type { AppConfig, ConversationEpisode, ConversationSetup, ProviderCapability, ProviderModelProfile } from './types.js'
import type { ProviderTestOverrides } from './ai/provider.js'
import { emptyConversationState, extractiveEpisodeFallback, mergeConversationState, normalizeConversationSetup, normalizeConversationState, type StoredConversationMessage } from './ai/context.js'
import { supportsProviderLookup } from './lookup/provider-tools.js'
import { normalizeUiLocale } from '../shared/locales.js'

const config = await getConfig()
const logLevel = process.env.LLC_LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : process.env.NODE_ENV === 'production' ? 'warn' : 'info')
const app = Fastify({ logger: { level: logLevel, redact: ['req.headers.authorization', 'req.headers.x-api-key', '*.apiKey'] }, bodyLimit: 2_000_000 })
const runtimeFile = process.env.LLC_RUNTIME_FILE
async function clearRuntimeFile() {
  if (!runtimeFile) return
  try {
    const current = JSON.parse(await readFile(runtimeFile, 'utf8')) as { pid?: number }
    if (current.pid === process.pid) await unlink(runtimeFile)
  } catch {}
}
function clearRuntimeFileSync() {
  if (!runtimeFile) return
  try {
    const current = JSON.parse(readFileSync(runtimeFile, 'utf8')) as { pid?: number }
    if (current.pid === process.pid) unlinkSync(runtimeFile)
  } catch {}
}
if (runtimeFile) app.addHook('onClose', clearRuntimeFile)
const inFlightTurns = new Map<string, Promise<unknown>>()
const inFlightTranslations = new Map<string, Promise<string>>()
const inFlightLookups = new Map<string, Promise<Awaited<ReturnType<typeof lookupTerm>>>>()

const localHosts = new Set(['127.0.0.1', 'localhost', '::1'])
function headerHostname(value?: string) {
  if (!value) return undefined
  try { return new URL(`http://${value}`).hostname.replace(/^\[|\]$/g, '').toLowerCase() }
  catch { return undefined }
}

app.addHook('onRequest', async (request, reply) => {
  const hostname = headerHostname(request.headers.host)
  if (request.headers.host && !hostname) return reply.code(403).send({ error: 'Invalid host' })
  const origin = request.headers.origin
  const remoteState = await readRemoteState()
  const remoteAllowed = isRemoteRequestAllowed(remoteState, { hostname, origin, remoteAddress: request.socket.remoteAddress })
  if (hostname && !localHosts.has(hostname) && !remoteAllowed) return reply.code(403).send({ error: 'Host not allowed' })
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.replace(/^\[|\]$/g, '').toLowerCase()
      if (!localHosts.has(originHost) && !remoteAllowed) return reply.code(403).send({ error: 'Origin not allowed' })
    } catch { return reply.code(403).send({ error: 'Invalid origin' }) }
  }
})

app.setErrorHandler((error, _request, reply) => {
  const issue = error as Error & { statusCode?: number; code?: string }
  app.log.error(issue)
  const statusCode = issue.statusCode && issue.statusCode >= 400 && issue.statusCode <= 599 ? issue.statusCode : 500
  reply.code(statusCode).send({ error: issue.message || 'Unexpected error', ...(issue.code ? { code: issue.code } : {}) })
})

app.get('/api/health', async () => ({ app: 'local-language-coach', ok: true, version: '0.1.0', pid: process.pid, localOnly: !(await getRemoteStatus()).active, time: new Date().toISOString() }))

app.get('/api/remote/status', async () => {
  const status = await getRemoteStatus()
  return status.active
    ? { active: true, url: status.url, allowedEmails: status.allowedEmails, startedAt: status.startedAt }
    : { active: false }
})

async function settingsPayload(input?: AppConfig) {
  const current = input || await getConfig()
  const secrets = await getSecrets()
  const providers = current.providers.map((provider) => {
    const { baseUrl: _baseUrl, ...publicProvider } = provider
    return {
    ...publicProvider,
    hasApiKey: Boolean(secrets[provider.apiKeySecret]),
    capabilityReady: Boolean(provider.capability?.conversationReady &&
      provider.capability.lookupReady &&
      provider.capability.contractVersion === STRUCTURED_CONTRACT_VERSION &&
      provider.capability.model === provider.model &&
      provider.capability.baseUrl.replace(/\/$/, '') === provider.baseUrl.replace(/\/$/, '')),
  }})
  const selected = providers.find((provider) => provider.id === current.llm.defaultProvider)
  const modelReady = Boolean(selected?.model && selected.capabilityReady && selected.hasApiKey)
  const webLookupReady = Boolean(selected?.hasApiKey && selected.capabilityReady && selected.capability?.lookupReady && supportsProviderLookup(selected.id))
  return { ...current, providers, modelReady, webLookupReady }
}

app.get('/api/settings', async () => settingsPayload())

app.put<{ Body: AppConfig }>('/api/settings', async (request) => {
  const current = await getConfig()
  const secrets = await getSecrets()
  const requestedDefault = request.body.llm?.defaultProvider
  if (requestedDefault && requestedDefault !== current.llm.defaultProvider) {
    const provider = current.providers.find((item) => item.id === requestedDefault)
    const qualified = provider?.capability?.conversationReady === true &&
      provider.capability.lookupReady === true &&
      provider.capability.contractVersion === STRUCTURED_CONTRACT_VERSION &&
      provider.capability.model === provider.model &&
      provider.capability.baseUrl.replace(/\/$/, '') === provider.baseUrl.replace(/\/$/, '') &&
      Boolean(secrets[provider.apiKeySecret])
    if (!qualified) throw Object.assign(new Error('Only a model that passed the natural-dialogue test can be selected.'), { statusCode: 409, code: 'MODEL_NOT_QUALIFIED' })
  }
  const selectedProviderId = requestedDefault || current.llm.defaultProvider
  const selectedProvider = current.providers.find((item) => item.id === selectedProviderId)
  const selectedLookupReady = Boolean(
    selectedProvider &&
    supportsProviderLookup(selectedProvider.id) &&
    secrets[selectedProvider.apiKeySecret] &&
    selectedProvider.capability?.lookupReady &&
    selectedProvider.capability.contractVersion === STRUCTURED_CONTRACT_VERSION &&
    selectedProvider.capability.model === selectedProvider.model &&
    selectedProvider.capability.baseUrl.replace(/\/$/, '') === selectedProvider.baseUrl.replace(/\/$/, ''),
  )
  if (request.body.webLookup?.enabled && !current.webLookup.enabled && !selectedLookupReady) {
    throw Object.assign(new Error('The selected model does not provide a compatible same-key lookup service.'), { statusCode: 409, code: 'WEB_LOOKUP_NOT_CONFIGURED' })
  }
  const next: AppConfig = {
    ...current,
    setupComplete: typeof request.body.setupComplete === 'boolean' ? request.body.setupComplete : current.setupComplete,
    ui: { ...current.ui, ...request.body.ui },
    learning: { ...current.learning, ...request.body.learning },
    llm: { ...current.llm, ...request.body.llm },
    webLookup: {
      ...current.webLookup,
      ...request.body.webLookup,
      enabled: selectedLookupReady ? Boolean(request.body.webLookup?.enabled) : false,
      provider: 'selected',
    },
    server: current.server,
    providers: current.providers,
  }
  await saveConfig(next)
  return settingsPayload(next)
})

app.post('/api/settings/reset', async () => {
  const next = await resetConfig({ clearSecrets: true })
  return { ok: true, config: next }
})

function parseModelProfiles(value: unknown) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Model profiles must be an object'), { statusCode: 400 })
  }
  const entries = Object.entries(value)
  if (entries.length > 500) throw Object.assign(new Error('Too many model profiles'), { statusCode: 400 })
  const profiles: Record<string, ProviderModelProfile> = Object.create(null)
  for (const [rawModel, rawProfile] of entries) {
    const model = rawModel.trim()
    if (!model || model.length > 200 || ['__proto__', 'prototype', 'constructor'].includes(model) ||
      !rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
      throw Object.assign(new Error('A model profile is invalid'), { statusCode: 400 })
    }
    const profile = rawProfile as Record<string, unknown>
    const contextWindowTokens = Number(profile.contextWindowTokens)
    const maxOutputTokens = Number(profile.maxOutputTokens)
    if (!Number.isInteger(contextWindowTokens) || contextWindowTokens < 4_096 ||
      !Number.isInteger(maxOutputTokens) || maxOutputTokens < 256) {
      throw Object.assign(new Error('A model profile budget is invalid'), { statusCode: 400 })
    }
    profiles[model] = { contextWindowTokens, maxOutputTokens }
  }
  return profiles
}

app.put<{ Params: { id: string }; Body: { apiKey?: string; model?: string; enabled?: boolean; contextWindowTokens?: number; maxOutputTokens?: number; modelProfiles?: Record<string, ProviderModelProfile>; capability?: ProviderCapability; certificationToken?: string; modelDiscoveryToken?: string } }>('/api/providers/:id', async (request) => {
  const current = await getConfig()
  const provider = current.providers.find((item) => item.id === request.params.id)
  if (!provider) throw Object.assign(new Error('Provider not found'), { statusCode: 404 })
  const previousModel = provider.model
  const enteredKey = typeof request.body.apiKey === 'string' ? request.body.apiKey.trim() : ''
  const requestedModel = typeof request.body.model === 'string' ? request.body.model.trim() : previousModel
  if (!requestedModel || requestedModel.length > 200 || ['__proto__', 'prototype', 'constructor'].includes(requestedModel)) {
    throw Object.assign(new Error('Choose a valid model before saving'), { statusCode: 400 })
  }
  if (requestedModel !== previousModel) {
    const discovered = Boolean(request.body.modelDiscoveryToken) && await consumeProviderModelDiscovery(
      provider.id,
      request.body.modelDiscoveryToken!,
      requestedModel,
      enteredKey,
    )
    if (!discovered) {
      throw Object.assign(new Error('Refresh the official model list and choose a model again'), {
        statusCode: 409,
        code: 'MODEL_NOT_DISCOVERED',
      })
    }
  }
  const submittedProfiles = parseModelProfiles(request.body.modelProfiles)
  provider.modelProfiles = { ...(provider.modelProfiles || {}), ...(submittedProfiles || {}) }
  if (previousModel && !provider.modelProfiles[previousModel]) {
    provider.modelProfiles[previousModel] = {
      contextWindowTokens: provider.contextWindowTokens,
      maxOutputTokens: provider.maxOutputTokens,
    }
  }
  provider.model = requestedModel
  const selectedProfile = provider.modelProfiles[provider.model]
  if (provider.model !== previousModel && selectedProfile) {
    provider.contextWindowTokens = selectedProfile.contextWindowTokens
    provider.maxOutputTokens = selectedProfile.maxOutputTokens
  }
  if (Number.isFinite(request.body.contextWindowTokens) && request.body.contextWindowTokens! >= 4_096) provider.contextWindowTokens = Math.round(request.body.contextWindowTokens!)
  if (Number.isFinite(request.body.maxOutputTokens) && request.body.maxOutputTokens! >= 256) provider.maxOutputTokens = Math.round(request.body.maxOutputTokens!)
  provider.modelProfiles[provider.model] = {
    contextWindowTokens: provider.contextWindowTokens,
    maxOutputTokens: provider.maxOutputTokens,
  }
  if (typeof request.body.enabled === 'boolean') provider.enabled = request.body.enabled
  else provider.enabled = true
  // An empty field means "keep the saved key". Key removal is deliberately
  // restricted to DELETE /api/providers/:id/secret.
  if (enteredKey && provider.apiKeySecret) await setSecret(provider.apiKeySecret, enteredKey)
  const capability = request.body.capability
  const capabilityMatches = capability?.conversationReady === true &&
    capability.lookupReady === true &&
    capability.contractVersion === STRUCTURED_CONTRACT_VERSION &&
    capability.model === provider.model &&
    capability.baseUrl.replace(/\/$/, '') === provider.baseUrl.replace(/\/$/, '')
  const keepsExistingCertification = previousModel === provider.model && provider.capability &&
    capabilityMatches && JSON.stringify(provider.capability) === JSON.stringify(capability)
  const hasFreshCertification = capabilityMatches && request.body.certificationToken &&
    await consumeProviderCertification(provider.id, request.body.certificationToken, capability, enteredKey)
  provider.capability = keepsExistingCertification || hasFreshCertification ? capability : undefined
  if (!current.llm.defaultProvider && provider.capability) current.llm.defaultProvider = provider.id
  await saveConfig(current)
  return { ok: true }
})

app.delete<{ Params: { id: string } }>('/api/providers/:id/secret', async (request) => {
  const current = await getConfig()
  const provider = current.providers.find((item) => item.id === request.params.id)
  if (!provider) throw Object.assign(new Error('Provider not found'), { statusCode: 404 })
  if (!provider.apiKeySecret) throw Object.assign(new Error('This provider does not use an API key'), { statusCode: 400 })
  await setSecret(provider.apiKeySecret, '')
  if (current.llm.defaultProvider === provider.id && current.webLookup.enabled) {
    current.webLookup.enabled = false
    await saveConfig(current)
  }
  return { ok: true }
})

app.post<{ Params: { id: string }; Body: ProviderTestOverrides }>('/api/providers/:id/test', async (request) => testProvider(request.params.id, request.body || {}))

app.post<{ Params: { id: string }; Body: ProviderTestOverrides }>('/api/providers/:id/models', async (request) => listProviderModels(request.params.id, request.body || {}))

app.post<{ Body: { domain?: string; place?: string; detail?: string; interfaceLocale?: string } }>('/api/conversation-setups/suggest', async (request) => ({ setups: await suggestSetups(request.body || {}) }))

function setupForConversation(conversation: Record<string, any>) {
  return normalizeConversationSetup(safeJson(conversation.setup_json, null))
}

function feedbackLocalizationSnapshot(meta: Record<string, any>, messageId: string, translations: Map<string, string>) {
  const translated = (id: string, fallback: unknown) => translations.get(`${messageId}:${id}`) || String(fallback || '')
  const reconstruction = meta.reconstruction && typeof meta.reconstruction === 'object'
    ? { ...meta.reconstruction, explanation: translated('reconstruction', meta.reconstruction.explanation) }
    : null
  const corrections = (Array.isArray(meta.corrections) ? meta.corrections : []).map((item, index) => ({
    ...item,
    explanation: translated(`correction:${index}`, item?.explanation),
  }))
  const memoryCandidates = (Array.isArray(meta.memoryCandidates) ? meta.memoryCandidates : []).map((item, index) => ({
    ...item,
    value: translated(`memory:${index}`, item?.value),
    ...(item?.previousValue ? { previousValue: translated(`memory-previous:${index}`, item.previousValue) } : {}),
  }))
  return { reconstruction, corrections, memoryCandidates }
}

function feedbackLocalizationItems(meta: Record<string, any>, messageId: string) {
  const items: Array<{ id: string; value: string }> = []
  const add = (id: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) items.push({ id: `${messageId}:${id}`, value: value.trim() })
  }
  add('reconstruction', meta.reconstruction?.explanation)
  for (const [index, item] of (Array.isArray(meta.corrections) ? meta.corrections : []).entries()) add(`correction:${index}`, item?.explanation)
  for (const [index, item] of (Array.isArray(meta.memoryCandidates) ? meta.memoryCandidates : []).entries()) {
    add(`memory:${index}`, item?.value)
    add(`memory-previous:${index}`, item?.previousValue)
  }
  return items
}

async function messagesForInterface(conversationId: string, interfaceLocale: string) {
  const messages: Array<Record<string, any>> = rows<Record<string, any>>('SELECT id, role, content, status, client_message_id AS clientMessageId, meta_json AS metaJson, created_at AS createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at', conversationId)
    .map((message) => ({ ...message, meta: safeJson<Record<string, any>>(message.metaJson, {}) }) as Record<string, any>)
  const missing: Array<{ message: Record<string, any>; items: Array<{ id: string; value: string }> }> = []

  for (const message of messages) {
    if (message.role !== 'assistant' || message.meta.interfaceLocale === interfaceLocale) continue
    const cached = message.meta.feedbackLocalizations?.[interfaceLocale]
    if (cached && typeof cached === 'object') {
      message.meta = { ...message.meta, ...cached, interfaceLocale }
      continue
    }
    missing.push({ message, items: feedbackLocalizationItems(message.meta, message.id) })
  }
  if (!missing.length) return messages

  try {
    const localized = await localizeInterfaceValues(missing.flatMap((entry) => entry.items), interfaceLocale)
    const translations = new Map(localized.map((item) => [item.id, item.value]))
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const entry of missing) {
        const snapshot = feedbackLocalizationSnapshot(entry.message.meta, entry.message.id, translations)
        entry.message.meta.feedbackLocalizations = {
          ...(entry.message.meta.feedbackLocalizations || {}),
          [interfaceLocale]: snapshot,
        }
        db.prepare('UPDATE messages SET meta_json = ? WHERE id = ?').run(JSON.stringify(entry.message.meta), entry.message.id)
        entry.message.meta = { ...entry.message.meta, ...snapshot, interfaceLocale }
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  } catch {
    // The frontend treats mismatched provenance as unavailable, so a failed
    // localization never exposes the earlier interface language.
  }
  return messages
}

function readEpisodes(conversationId: string): ConversationEpisode[] {
  return rows<Record<string, any>>(`SELECT id, conversation_id AS conversationId, start_message_id AS startMessageId,
    end_message_id AS endMessageId, thread, summary, facts_json AS factsJson, open_loops_json AS openLoopsJson,
    keywords_json AS keywordsJson, topic_arcs_json AS topicArcsJson,
    interaction_signals_json AS interactionSignalsJson, created_at AS createdAt, updated_at AS updatedAt
    FROM conversation_episodes WHERE conversation_id = ? ORDER BY created_at`, conversationId).map((episode) => ({
    id: episode.id,
    conversationId: episode.conversationId,
    startMessageId: episode.startMessageId,
    endMessageId: episode.endMessageId,
    thread: episode.thread,
    summary: episode.summary,
    facts: safeJson(episode.factsJson, []),
    openLoops: safeJson(episode.openLoopsJson, []),
    keywords: safeJson(episode.keywordsJson, []),
    topicArcs: safeJson(episode.topicArcsJson, []),
    interactionSignals: safeJson(episode.interactionSignalsJson, []),
    createdAt: episode.createdAt,
    updatedAt: episode.updatedAt,
  }))
}

async function compactOlderMessages(conversationId: string, messages: StoredConversationMessage[], state: ReturnType<typeof normalizeConversationState>, interfaceLocale?: string) {
  const start = state.lastCompactedMessageId
    ? Math.max(0, messages.findIndex((message) => message.id === state.lastCompactedMessageId) + 1)
    : 0
  const compactableEnd = Math.max(start, messages.length - 10)
  if (compactableEnd - start < 12) return { state, episodes: readEpisodes(conversationId) }

  const segment = messages.slice(start, Math.min(start + 12, compactableEnd))
  let summary
  try {
    summary = await summarizeEpisode(segment, interfaceLocale)
  } catch {
    summary = extractiveEpisodeFallback(segment)
  }
  const id = nanoid()
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO conversation_episodes
    (id, conversation_id, start_message_id, end_message_id, thread, summary, facts_json, open_loops_json, keywords_json,
      topic_arcs_json, interaction_signals_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    conversationId,
    segment[0].id,
    segment.at(-1)!.id,
    summary.thread,
    summary.summary,
    JSON.stringify(summary.facts),
    JSON.stringify(summary.openLoops),
    JSON.stringify(summary.keywords),
    JSON.stringify(summary.topicArcs),
    JSON.stringify(summary.interactionSignals),
    now,
    now,
  )
  const nextState = { ...state, lastCompactedMessageId: segment.at(-1)!.id }
  db.prepare('UPDATE conversations SET state_json = ? WHERE id = ?').run(JSON.stringify(nextState), conversationId)
  return { state: nextState, episodes: readEpisodes(conversationId) }
}

app.get<{ Querystring: { interfaceLocale?: string } }>('/api/conversations', async (request) => {
  const current = await getConfig()
  const interfaceLocale = normalizeUiLocale(request.query.interfaceLocale, current.ui.locale)
  return rows<Record<string, any>>(`SELECT c.id, c.mode, c.title, c.status,
  CASE WHEN c.setup_json IS NULL OR TRIM(c.setup_json) = '' THEN 'direct' ELSE 'scene' END AS kind,
  COALESCE((
    SELECT SUBSTR(m.content, 1, 240)
    FROM messages m
    WHERE m.conversation_id = c.id AND m.role = 'user'
    ORDER BY m.created_at, m.rowid
    LIMIT 1
  ), '') AS firstMessage,
  c.interface_locale AS interfaceLocale, c.localized_setups_json AS localizedSetupsJson,
  c.created_at AS createdAt, c.updated_at AS updatedAt
  FROM conversations c
  ORDER BY c.updated_at DESC`).map((item) => {
    if (item.kind !== 'scene' || item.interfaceLocale === interfaceLocale) {
      const { localizedSetupsJson: _localized, ...publicItem } = item
      return publicItem
    }
    const localized = normalizeConversationSetup(safeJson<Record<string, unknown>>(item.localizedSetupsJson, {})[interfaceLocale])
    const { localizedSetupsJson: _localized, ...publicItem } = item
    return localized ? { ...publicItem, title: localized.title, interfaceLocale } : publicItem
  })
})

app.post<{ Body: { title?: string; setup?: ConversationSetup | null; interfaceLocale?: string } }>('/api/conversations', async (request) => {
  await assertModelConfigured()
  const id = nanoid()
  const now = new Date().toISOString()
  const setup = normalizeConversationSetup(request.body.setup)
  const current = await getConfig()
  const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
  const title = request.body.title?.trim() || setup?.title || 'Open conversation'
  const state = emptyConversationState(setup)
  db.prepare(`INSERT INTO conversations
    (id, mode, title, setup_json, interface_locale, state_json, status, created_at, updated_at)
    VALUES (?, 'conversation', ?, ?, ?, ?, 'active', ?, ?)`).run(id, title, setup ? JSON.stringify(setup) : null, interfaceLocale, JSON.stringify(state), now, now)
  if (setup?.openingLine) {
    db.prepare('INSERT INTO messages (id, conversation_id, role, content, meta_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(nanoid(), id, 'assistant', setup.openingLine, JSON.stringify({ opening: true }), 'complete', now)
  }
  return { id }
})

app.get<{ Params: { id: string }; Querystring: { interfaceLocale?: string } }>('/api/conversations/:id', async (request) => {
  const conversation = row<Record<string, any>>('SELECT * FROM conversations WHERE id = ?', request.params.id)
  if (!conversation) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 })
  const current = await getConfig()
  const requestedLocale = normalizeUiLocale(request.query.interfaceLocale, current.ui.locale)
  let responseLocale = conversation.interface_locale
  let setup = setupForConversation(conversation)
  if (setup && responseLocale !== requestedLocale) {
    const localizations = safeJson<Record<string, unknown>>(conversation.localized_setups_json, {})
    let localized = normalizeConversationSetup(localizations[requestedLocale])
    if (!localized) {
      try {
        localized = await localizeConversationSetup(setup, requestedLocale)
        localizations[requestedLocale] = localized
        db.prepare('UPDATE conversations SET localized_setups_json = ? WHERE id = ?')
          .run(JSON.stringify(localizations), conversation.id)
      } catch {
        localized = null
      }
    }
    if (localized) {
      setup = localized
      responseLocale = requestedLocale
    }
  }
  const messages = await messagesForInterface(conversation.id, requestedLocale)
  return {
    id: conversation.id,
    mode: 'conversation',
    title: setup?.title || conversation.title,
    status: conversation.status === 'archived' ? 'archived' : 'active',
    interfaceLocale: responseLocale,
    setup,
    createdAt: conversation.created_at,
    messages,
  }
})

app.delete<{ Params: { id: string } }>('/api/conversations/:id', async (request) => {
  const conversation = row<{ id: string }>('SELECT id FROM conversations WHERE id = ?', request.params.id)
  if (!conversation) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 })
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('UPDATE word_entries SET conversation_id = NULL WHERE conversation_id = ?').run(request.params.id)
    db.prepare('UPDATE memories SET source_conversation_id = NULL WHERE source_conversation_id = ?').run(request.params.id)
    db.prepare('DELETE FROM conversations WHERE id = ?').run(request.params.id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { ok: true }
})

app.patch<{ Params: { id: string }; Body: { archived: boolean } }>('/api/conversations/:id/archive', async (request) => {
  const conversation = row<{ id: string }>('SELECT id FROM conversations WHERE id = ?', request.params.id)
  if (!conversation) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 })
  const now = new Date().toISOString()
  db.prepare('UPDATE conversations SET status = ?, archived_at = ?, updated_at = ? WHERE id = ?')
    .run(request.body.archived ? 'archived' : 'active', request.body.archived ? now : null, now, request.params.id)
  return { ok: true, status: request.body.archived ? 'archived' : 'active' }
})

app.post<{ Params: { id: string }; Body: { content: string; clientMessageId?: string; interfaceLocale?: string } }>('/api/conversations/:id/messages', async (request) => {
  const content = request.body.content?.trim()
  if (!content) throw Object.assign(new Error('Message cannot be empty'), { statusCode: 400 })
  const conversation = row<Record<string, any>>('SELECT * FROM conversations WHERE id = ?', request.params.id)
  if (!conversation) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 })
  const current = await getConfig()
  const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
  const clientMessageId = request.body.clientMessageId?.trim() || nanoid()
  const inFlightKey = request.params.id + ':' + clientMessageId
  const running = inFlightTurns.get(inFlightKey)
  if (running) return running
  const task = (async () => {
    const existing = row<Record<string, any>>('SELECT * FROM messages WHERE conversation_id = ? AND client_message_id = ?', request.params.id, clientMessageId)
    if (existing?.status === 'complete') {
      const assistant = row<Record<string, any>>('SELECT * FROM messages WHERE reply_to_message_id = ?', existing.id)
      if (assistant) {
        const meta = safeJson(assistant.meta_json, {})
        return {
          userMessage: { id: existing.id, role: 'user', content: existing.content, clientMessageId, status: 'complete', createdAt: existing.created_at },
          assistantMessage: { id: assistant.id, role: 'assistant', content: assistant.content, status: 'complete', meta, createdAt: assistant.created_at },
          status: conversation.status,
        }
      }
    }
    const now = new Date().toISOString()
    const userId = existing?.id || nanoid()
    if (existing) {
      db.prepare('UPDATE messages SET content = ?, status = ?, created_at = ? WHERE id = ?').run(content, 'pending', now, userId)
    } else {
      db.prepare('INSERT INTO messages (id, conversation_id, role, content, client_message_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, request.params.id, 'user', content, clientMessageId, 'pending', now)
    }
    const messageRows = rows<StoredConversationMessage>("SELECT id, role, content, created_at AS createdAt FROM messages WHERE conversation_id = ? AND (status = 'complete' OR id = ?) ORDER BY created_at", request.params.id, userId)
    const setup = setupForConversation(conversation)
    const initialState = normalizeConversationState(safeJson(conversation.state_json, null), setup)
    const compacted = await compactOlderMessages(request.params.id, messageRows, initialState, interfaceLocale)
    const storedMemories = rows<Record<string, any>>(`SELECT id, category, key, value, tier,
      interface_locale AS interfaceLocale, localized_values_json AS localizedValuesJson,
      memory_type AS memoryType, topic, importance, pinned, confidence, sensitive, status,
      source_conversation_id AS sourceConversationId, source_message_id AS sourceMessageId,
      last_used_at AS lastUsedAt, use_count AS useCount, last_mentioned_at AS lastMentionedAt,
      mention_count AS mentionCount, created_at AS createdAt, updated_at AS updatedAt
      FROM memories
      WHERE status = ? AND (valid_to IS NULL OR valid_to > ?)
      ORDER BY CASE WHEN tier = 'core' THEN 0 ELSE 1 END, pinned DESC, importance DESC, updated_at DESC`, 'confirmed', now)
    await ensureMemoryLocalizations(storedMemories, interfaceLocale).catch(() => undefined)
    const memories = storedMemories
      .map((memory) => memoryForInterface(memory, interfaceLocale))
      .filter((memory): memory is Record<string, any> => Boolean(memory))
    let turn
    try {
      turn = await coachTurn({
        setup,
        messages: messageRows,
        memories,
        episodes: compacted.episodes,
        state: compacted.state,
        interfaceLocale,
      })
    } catch (error) {
      db.prepare('UPDATE messages SET status = ? WHERE id = ?').run('failed', userId)
      throw error
    }
    const result = turn.coaching
    const assistantId = nanoid()
    const replyAt = new Date().toISOString()
    const merged = mergeConversationState({
      previous: compacted.state,
      patch: result.statePatch,
      userMessage: { id: userId, role: 'user', content, createdAt: now },
      assistantMessageId: assistantId,
      assistantCreatedAt: replyAt,
      dialogue: {
        plan: turn.context.dialoguePlan,
        policy: turn.context.dialoguePolicy,
        roleReply: result.roleReply,
        memoryIds: turn.context.memoryIds,
      },
    })
    result.memoryCandidates = merged.userFacts.map((fact) => {
      const existingMemory = memories.find((memory) => memory.key === fact.key)
      const memoryType = fact.memoryType || 'profile'
      const category = existingMemory?.category === 'learning' || existingMemory?.category === 'scene' || existingMemory?.category === 'personal'
        ? existingMemory.category
        : memoryType === 'learning' ? 'learning' : memoryType === 'episodic' ? 'scene' : 'personal'
      const suggestedTier = fact.suggestedTier || 'long_term'
      return {
        category: category as 'personal' | 'learning' | 'scene',
        key: fact.key,
        value: fact.value,
        confidence: 1,
        sensitive: fact.sensitive,
        action: existingMemory ? 'update' as const : 'create' as const,
        tier: existingMemory?.tier === 'core' ? 'core' as const : suggestedTier,
        memoryType,
        topic: fact.topic || 'general',
        importance: Math.max(0, Math.min(1, fact.importance ?? 0.5)),
        sourceMessageId: userId,
        ...(existingMemory ? { previousValue: String(existingMemory.value || '') } : {}),
      }
    })
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('INSERT INTO messages (id, conversation_id, role, content, meta_json, reply_to_message_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(assistantId, request.params.id, 'assistant', result.roleReply, JSON.stringify(result), userId, 'complete', replyAt)
      db.prepare('UPDATE messages SET status = ? WHERE id = ?').run('complete', userId)
      db.prepare("UPDATE conversations SET status = 'active', archived_at = NULL, state_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(merged.state), replyAt, request.params.id)
      for (const memoryId of new Set(turn.context.memoryIds)) {
        db.prepare('UPDATE memories SET use_count = use_count + 1, last_used_at = ? WHERE id = ?').run(replyAt, memoryId)
      }
      const mentionedMemory = memories.find((memory) => memory.key === turn.context.dialoguePlan.callbackMemoryKey)
      if (mentionedMemory && turn.context.memoryIds.includes(String(mentionedMemory.id))) {
        db.prepare('UPDATE memories SET mention_count = mention_count + 1, last_mentioned_at = ? WHERE id = ?')
          .run(replyAt, mentionedMemory.id)
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      db.prepare('UPDATE messages SET status = ? WHERE id = ?').run('failed', userId)
      throw error
    }
    return {
      userMessage: { id: userId, role: 'user', content, clientMessageId, status: 'complete', createdAt: now },
      assistantMessage: { id: assistantId, role: 'assistant', content: result.roleReply, status: 'complete', meta: result, createdAt: replyAt },
      status: 'active',
    }
  })()
  inFlightTurns.set(inFlightKey, task)
  try { return await task }
  finally { if (inFlightTurns.get(inFlightKey) === task) inFlightTurns.delete(inFlightKey) }
})

app.post<{ Params: { id: string; messageId: string }; Body: { interfaceLocale?: string } }>('/api/conversations/:id/messages/:messageId/translation', async (request) => {
  const conversation = row<Record<string, any>>('SELECT * FROM conversations WHERE id = ?', request.params.id)
  if (!conversation) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 })
  const message = row<Record<string, any>>('SELECT * FROM messages WHERE id = ? AND conversation_id = ? AND role = ?', request.params.messageId, request.params.id, 'assistant')
  if (!message) throw Object.assign(new Error('Assistant message not found'), { statusCode: 404 })
  const current = await getConfig()
  const interfaceLocale = normalizeUiLocale(request.body?.interfaceLocale, current.ui.locale)
  const meta = safeJson<Record<string, any>>(message.meta_json, {})
  const translations: Record<string, string> = meta.roleReplyTranslations && typeof meta.roleReplyTranslations === 'object'
    ? meta.roleReplyTranslations
    : {}
  if (typeof translations[interfaceLocale] === 'string' && translations[interfaceLocale]) {
    return { translation: translations[interfaceLocale], interfaceLocale, cached: true, cacheSource: 'message' }
  }
  const setup = setupForConversation(conversation)
  const cacheKey = translationCacheKey({
    content: message.content,
    targetLanguageCode: current.learning.targetLanguageCode,
    interfaceLocale,
    setup,
  })
  const cached = row<{ translation: string }>('SELECT translation FROM translation_cache WHERE cache_key = ?', cacheKey)
  if (cached) {
    const now = new Date().toISOString()
    db.prepare('UPDATE translation_cache SET hit_count = hit_count + 1, last_accessed = ? WHERE cache_key = ?').run(now, cacheKey)
    meta.roleReplyTranslations = { ...translations, [interfaceLocale]: cached.translation }
    db.prepare('UPDATE messages SET meta_json = ? WHERE id = ?').run(JSON.stringify(meta), message.id)
    return { translation: cached.translation, interfaceLocale, cached: true, cacheSource: 'shared' }
  }
  const running = inFlightTranslations.get(cacheKey)
  let translation: string
  if (running) {
    translation = await running
  } else {
    const task = (async () => {
      const generated = await translateMessage(message.content, setup, interfaceLocale)
      const now = new Date().toISOString()
      db.prepare(`INSERT INTO translation_cache (cache_key, translation, created_at, last_accessed)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET translation = excluded.translation, last_accessed = excluded.last_accessed`).run(cacheKey, generated, now, now)
      db.prepare(`DELETE FROM translation_cache WHERE cache_key IN (
        SELECT cache_key FROM translation_cache ORDER BY last_accessed DESC LIMIT -1 OFFSET 2000
      )`).run()
      return generated
    })()
    inFlightTranslations.set(cacheKey, task)
    try { translation = await task }
    finally { if (inFlightTranslations.get(cacheKey) === task) inFlightTranslations.delete(cacheKey) }
  }
  meta.roleReplyTranslations = { ...translations, [interfaceLocale]: translation }
  db.prepare('UPDATE messages SET meta_json = ? WHERE id = ?').run(JSON.stringify(meta), message.id)
  return { translation, interfaceLocale, cached: Boolean(running), cacheSource: running ? 'inflight' : 'generated' }
})

app.post<{ Body: { term: string; sentence: string; previous?: string; setup?: unknown; interfaceLocale?: string } }>('/api/lookup', async (request) => {
  const current = await getConfig()
  const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
  const cacheKey = lookupCacheKey({
    ...request.body,
    targetLanguage: current.learning.targetLanguage,
    targetLanguageCode: current.learning.targetLanguageCode,
    interfaceLocale,
  })
  const cached = readAiResponseCache<Awaited<ReturnType<typeof lookupTerm>>>('lookup', cacheKey)
  if (cached) return { lookup: cached, cached: true, cacheSource: 'persistent' }
  const running = inFlightLookups.get(cacheKey)
  if (running) return { lookup: await running, cached: true, cacheSource: 'inflight' }
  const task = lookupTerm({ ...request.body, interfaceLocale })
  inFlightLookups.set(cacheKey, task)
  try {
    const lookup = await task
    writeAiResponseCache('lookup', cacheKey, lookup)
    return { lookup, cached: false, cacheSource: 'generated' }
  } finally {
    if (inFlightLookups.get(cacheKey) === task) inFlightLookups.delete(cacheKey)
  }
})

function wordPayload(item: Record<string, any>) {
  return { ...item, interfaceLocale: item.interface_locale, details: safeJson(item.details_json, {}) }
}

app.get('/api/words', async () => rows<Record<string, any>>('SELECT * FROM word_entries ORDER BY updated_at DESC').map(wordPayload))

app.post<{ Body: { term: string; lemma?: string; meaning: string; language: string; interfaceLocale?: string; details: unknown; sourceSentence?: string; conversationId?: string } }>('/api/words', async (request) => {
  const id = nanoid(); const now = new Date().toISOString()
  const current = await getConfig()
  const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
  db.prepare('INSERT INTO word_entries (id, term, lemma, language, interface_locale, meaning, details_json, source_sentence, conversation_id, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, request.body.term, request.body.lemma || request.body.term, request.body.language, interfaceLocale, request.body.meaning, JSON.stringify(request.body.details), request.body.sourceSentence || null, request.body.conversationId || null, now, now, now)
  return { id }
})

app.post<{ Params: { id: string }; Body: { interfaceLocale?: string } }>('/api/words/:id/localize', async (request) => {
  const word = row<Record<string, any>>('SELECT * FROM word_entries WHERE id = ?', request.params.id)
  if (!word) throw Object.assign(new Error('Word not found'), { statusCode: 404 })
  const current = await getConfig()
  const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
  if (word.interface_locale === interfaceLocale) return wordPayload(word)
  const conversation = word.conversation_id
    ? row<Record<string, any>>('SELECT * FROM conversations WHERE id = ?', word.conversation_id)
    : undefined
  const lookup = await lookupTerm({
    term: word.term,
    sentence: word.source_sentence || word.term,
    setup: conversation ? setupForConversation(conversation) : undefined,
    interfaceLocale,
  })
  const now = new Date().toISOString()
  db.prepare('UPDATE word_entries SET lemma = ?, meaning = ?, details_json = ?, interface_locale = ?, updated_at = ? WHERE id = ?')
    .run(lookup.lemma || word.lemma, lookup.contextMeaning, JSON.stringify(lookup), interfaceLocale, now, word.id)
  return wordPayload({ ...word, lemma: lookup.lemma || word.lemma, meaning: lookup.contextMeaning, details_json: JSON.stringify(lookup), interface_locale: interfaceLocale, updated_at: now })
})

app.delete<{ Params: { id: string } }>('/api/words/:id', async (request) => { db.prepare('DELETE FROM word_entries WHERE id = ?').run(request.params.id); return { ok: true } })

app.get('/api/reviews/due', async () => rows<Record<string, any>>('SELECT * FROM word_entries WHERE due_at <= ? ORDER BY due_at LIMIT 30', new Date().toISOString()).map(wordPayload))

app.post<{ Params: { id: string }; Body: { rating: 1 | 2 | 3 | 4 } }>('/api/reviews/:id', async (request) => {
  const word = row<Record<string, any>>('SELECT * FROM word_entries WHERE id = ?', request.params.id)
  if (!word) throw Object.assign(new Error('Word not found'), { statusCode: 404 })
  const rating = Math.max(1, Math.min(4, request.body.rating))
  const repetitions = rating === 1 ? 0 : word.repetitions + 1
  const ease = Math.max(1.3, word.ease + (rating - 3) * 0.15)
  const interval = rating === 1 ? 0 : repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.max(1, Math.round(word.interval_days * ease * (rating === 2 ? 0.7 : rating === 4 ? 1.25 : 1)))
  const due = new Date(Date.now() + (rating === 1 ? 10 * 60_000 : interval * 86_400_000)).toISOString()
  db.prepare('UPDATE word_entries SET repetitions = ?, ease = ?, interval_days = ?, due_at = ?, updated_at = ? WHERE id = ?').run(repetitions, ease, interval, due, new Date().toISOString(), request.params.id)
  return { dueAt: due, intervalDays: interval }
})

const CORE_MEMORY_LIMIT = 15
const memoryCategories = new Set(['personal', 'learning', 'scene'])
const memoryTypes = new Set(['preference', 'constraint', 'profile', 'learning', 'episodic'])

function cleanMemoryTopic(value: unknown) {
  const topic = typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
  return topic.slice(0, 40) || 'general'
}

function assertCoreMemoryAvailable(existing?: Record<string, any>) {
  if (existing?.tier === 'core') return
  const count = row<{ count: number }>("SELECT COUNT(*) AS count FROM memories WHERE tier = 'core' AND status = 'confirmed'")?.count || 0
  if (count >= CORE_MEMORY_LIMIT) {
    throw Object.assign(new Error(`Core memory is limited to ${CORE_MEMORY_LIMIT} items. Demote one first.`), { statusCode: 409, code: 'CORE_MEMORY_LIMIT' })
  }
}

function addMemoryRevision(memoryId: string, previousValue: string | null, nextValue: string | null, changeType: string, sourceConversationId?: string | null, sourceMessageId?: string | null) {
  db.prepare(`INSERT INTO memory_revisions
    (id, memory_id, previous_value, next_value, change_type, source_conversation_id, source_message_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    nanoid(), memoryId, previousValue, nextValue, changeType, sourceConversationId || null, sourceMessageId || null, new Date().toISOString(),
  )
}

function memoryForInterface(memory: Record<string, any>, interfaceLocale: string) {
  if (memory.interfaceLocale === interfaceLocale) return memory
  const localized = safeJson<Record<string, string>>(memory.localizedValuesJson, {})[interfaceLocale]
  return localized ? { ...memory, value: localized, interfaceLocale } : null
}

async function ensureMemoryLocalizations(stored: Array<Record<string, any>>, interfaceLocale: string) {
  const missing = stored.filter((item) => item.status === 'confirmed' && item.interfaceLocale !== interfaceLocale &&
    !safeJson<Record<string, string>>(item.localizedValuesJson, {})[interfaceLocale])
  if (!missing.length) return
  const localized = await localizeMemoryValues(missing.map((item) => ({ id: item.id, value: item.value })), interfaceLocale)
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const item of localized) {
      const source = stored.find((memory) => memory.id === item.id)
      if (!source) continue
      const translations = safeJson<Record<string, string>>(source.localizedValuesJson, {})
      translations[interfaceLocale] = item.value
      source.localizedValuesJson = JSON.stringify(translations)
      db.prepare('UPDATE memories SET localized_values_json = ? WHERE id = ?')
        .run(source.localizedValuesJson, item.id)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

app.get('/api/memories', async () => rows<Record<string, any>>(`SELECT id, category, key, value, tier,
  interface_locale AS interfaceLocale, localized_values_json AS localizedValuesJson, memory_type AS memoryType, topic, importance, pinned, confidence, sensitive, status,
  source_conversation_id AS sourceConversationId, source_message_id AS sourceMessageId,
  supersedes_id AS supersedesId, valid_from AS validFrom, valid_to AS validTo,
  last_used_at AS lastUsedAt, use_count AS useCount, last_mentioned_at AS lastMentionedAt,
  mention_count AS mentionCount, created_at AS createdAt, updated_at AS updatedAt
  FROM memories
  ORDER BY CASE WHEN tier = 'core' THEN 0 ELSE 1 END, pinned DESC, importance DESC, updated_at DESC`).map((memory) => ({
    ...memory,
    pinned: Boolean(memory.pinned),
    sensitive: Boolean(memory.sensitive),
  })))

app.post<{ Body: {
  category: string; key: string; value: string; confidence?: number; sensitive?: boolean; status?: string
  sourceConversationId?: string; sourceMessageId?: string; tier?: 'core' | 'long_term'; memoryType?: string; topic?: string; importance?: number; interfaceLocale?: string
} }>('/api/memories', async (request) => {
  const body = request.body
  const category = memoryCategories.has(body.category) ? body.category : 'personal'
  const key = body.key?.trim()
  const value = body.value?.trim()
  if (!key || !value) throw Object.assign(new Error('Memory key and value are required.'), { statusCode: 400 })
  const existing = row<Record<string, any>>('SELECT * FROM memories WHERE category = ? AND key = ?', category, key)
  const sensitive = body.sensitive === undefined ? Boolean(existing?.sensitive) : Boolean(body.sensitive)
  const requestedTier = body.tier || existing?.tier || 'long_term'
  const tier = requestedTier === 'core' ? 'core' : 'long_term'
  if (tier === 'core') assertCoreMemoryAvailable(existing)
  const existingMemoryType = existing?.memory_type
  const memoryType = memoryTypes.has(body.memoryType || '')
    ? body.memoryType!
    : memoryTypes.has(existingMemoryType) ? existingMemoryType : category === 'learning' ? 'learning' : category === 'scene' ? 'episodic' : 'profile'
  const importance = Math.max(0, Math.min(1, Number(body.importance ?? existing?.importance ?? 0.5)))
  const confidence = Number.isFinite(body.confidence) ? body.confidence! : existing?.confidence ?? 1
  const topic = cleanMemoryTopic(body.topic ?? existing?.topic)
  const sourceConversationId = body.sourceConversationId ?? existing?.source_conversation_id ?? null
  const sourceMessageId = body.sourceMessageId ?? existing?.source_message_id ?? null
  const status = body.status || existing?.status || 'confirmed'
  const current = await getConfig()
  const interfaceLocale = normalizeUiLocale(body.interfaceLocale, current.ui.locale)
  const now = new Date().toISOString()
  const id = existing?.id || nanoid()
  db.exec('BEGIN IMMEDIATE')
  try {
    if (existing) {
      addMemoryRevision(id, existing.value, value, existing.value === value ? 'metadata' : 'update', sourceConversationId, sourceMessageId)
      db.prepare(`UPDATE memories SET value = ?, interface_locale = ?, localized_values_json = '{}', tier = ?, memory_type = ?, topic = ?, importance = ?, pinned = ?, confidence = ?, sensitive = ?,
        status = ?, source_conversation_id = ?, source_message_id = ?, valid_to = NULL, updated_at = ? WHERE id = ?`).run(
        value, interfaceLocale, tier, memoryType, topic, importance, tier === 'core' ? existing.pinned : 0, confidence, sensitive ? 1 : 0,
        status, sourceConversationId, sourceMessageId, now, id,
      )
    } else {
      db.prepare(`INSERT INTO memories
        (id, category, key, value, interface_locale, localized_values_json, tier, memory_type, topic, importance, pinned, confidence, sensitive, status,
          source_conversation_id, source_message_id, valid_from, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, category, key, value, interfaceLocale, tier, memoryType, topic, importance, confidence,
        sensitive ? 1 : 0, status, sourceConversationId, sourceMessageId, now, now, now,
      )
      addMemoryRevision(id, null, value, 'create', sourceConversationId, sourceMessageId)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { id, action: existing ? 'update' : 'create' }
})

app.post<{ Body: { interfaceLocale?: string } }>('/api/memories/localize', async (request) => {
  const current = await getConfig()
  const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
  const stored = rows<Record<string, any>>(`SELECT id, category, key, value, tier,
    interface_locale AS interfaceLocale, localized_values_json AS localizedValuesJson, memory_type AS memoryType, topic, importance, pinned, confidence, sensitive, status,
    source_conversation_id AS sourceConversationId, source_message_id AS sourceMessageId,
    last_used_at AS lastUsedAt, use_count AS useCount, last_mentioned_at AS lastMentionedAt,
    mention_count AS mentionCount, created_at AS createdAt, updated_at AS updatedAt
    FROM memories ORDER BY CASE WHEN tier = 'core' THEN 0 ELSE 1 END, pinned DESC, importance DESC, updated_at DESC`)
  await ensureMemoryLocalizations(stored, interfaceLocale)
  return stored.map((memory) => {
    if (memory.interfaceLocale === interfaceLocale) return memory
    const localized = safeJson<Record<string, string>>(memory.localizedValuesJson, {})[interfaceLocale]
    return localized ? { ...memory, value: localized, interfaceLocale } : memory
  })
})

app.put<{ Params: { id: string }; Body: { value: string; status?: string; interfaceLocale?: string } }>('/api/memories/:id', async (request) => {
  const existing = row<Record<string, any>>('SELECT * FROM memories WHERE id = ?', request.params.id)
  if (!existing) throw Object.assign(new Error('Memory not found'), { statusCode: 404 })
  const value = request.body.value?.trim()
  if (!value) throw Object.assign(new Error('Memory value is required.'), { statusCode: 400 })
  const current = await getConfig()
  const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
  const now = new Date().toISOString()
  db.exec('BEGIN IMMEDIATE')
  try {
    addMemoryRevision(existing.id, existing.value, value, 'edit', existing.source_conversation_id, existing.source_message_id)
    db.prepare("UPDATE memories SET value = ?, interface_locale = ?, localized_values_json = '{}', status = COALESCE(?, status), updated_at = ? WHERE id = ?").run(value, interfaceLocale, request.body.status || null, now, request.params.id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { ok: true }
})

app.patch<{ Params: { id: string }; Body: { tier: 'core' | 'long_term' } }>('/api/memories/:id/tier', async (request) => {
  const existing = row<Record<string, any>>('SELECT * FROM memories WHERE id = ?', request.params.id)
  if (!existing) throw Object.assign(new Error('Memory not found'), { statusCode: 404 })
  if (!['core', 'long_term'].includes(request.body.tier)) throw Object.assign(new Error('Invalid memory tier'), { statusCode: 400 })
  if (request.body.tier === 'core') assertCoreMemoryAvailable(existing)
  if (existing.tier === request.body.tier) return { ok: true }
  const now = new Date().toISOString()
  db.exec('BEGIN IMMEDIATE')
  try {
    addMemoryRevision(existing.id, existing.value, existing.value, request.body.tier === 'core' ? 'promote' : 'demote', existing.source_conversation_id, existing.source_message_id)
    db.prepare('UPDATE memories SET tier = ?, pinned = ?, updated_at = ? WHERE id = ?').run(request.body.tier, request.body.tier === 'core' ? 1 : 0, now, request.params.id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { ok: true }
})

app.delete<{ Params: { id: string } }>('/api/memories/:id', async (request) => {
  const result = db.prepare('DELETE FROM memories WHERE id = ?').run(request.params.id)
  if (!result.changes) throw Object.assign(new Error('Memory not found'), { statusCode: 404 })
  return { ok: true }
})

app.get('/api/export', async () => ({
  format: 'local-language-coach-backup', version: 2, exportedAt: new Date().toISOString(),
  config: await getConfig(),
  conversations: rows('SELECT * FROM conversations'), messages: rows('SELECT * FROM messages'), episodes: rows('SELECT * FROM conversation_episodes'), words: rows('SELECT * FROM word_entries'), memories: rows('SELECT * FROM memories'), memoryRevisions: rows('SELECT * FROM memory_revisions'),
}))

const webRoot = path.resolve(process.cwd(), 'dist/web')
if (existsSync(webRoot)) {
  await app.register(fastifyStatic, { root: webRoot, wildcard: false })
  app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'))
}

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || config.server.port)
  await app.listen({ host: '127.0.0.1', port })
  if (runtimeFile) {
    const runtime = { version: 1, pid: process.pid, url: `http://127.0.0.1:${port}`, port, mode: 'start', startedAt: new Date().toISOString() }
    const temporary = `${runtimeFile}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(runtime, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, runtimeFile)
    let closing = false
    const shutdown = async () => {
      if (closing) return
      closing = true
      clearRuntimeFileSync()
      try { await app.close() } finally { process.exit(0) }
    }
    process.once('SIGINT', () => void shutdown())
    process.once('SIGTERM', () => void shutdown())
  }
}

export { app }
