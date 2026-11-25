import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { CUSTOM_PROVIDER_ID, customProvider, getConfig, getSecrets, isHttpUrl, resetConfig, saveConfig, saveConfigAndSecrets } from './services/config.js'
import { db, perDatabase, row, rows } from './services/database.js'
import { readAiResponseCache, writeAiResponseCache } from './services/ai-response-cache.js'
import { getRemoteStatus } from './services/remote.js'
import { safeJson } from './utils/json.js'
import { lookupCacheKey } from './utils/ai-cache-key.js'
import { translationCacheKey } from './utils/translation-cache.js'
import { coachTurn, type ReplyWriter, localizeConversationSetup, localizeInterfaceValues, lookupTerm, suggestSetups, summarizeEpisode, translateMessage } from './ai/engine.js'
import { assertModelConfigured, capabilityCurrent, listProviderModels, STRUCTURED_CONTRACT_VERSION, testProvider } from './ai/provider.js'
import type { AppConfig, ConversationEpisode, ConversationMaterial, ConversationSetup, LearningLanguage, MemoryCandidate, ProviderModelProfile } from './types.js'
import type { ProviderTestOverrides } from './ai/provider.js'
import { resetProviderSetupSigningKey, verifyProviderSetupReceipt } from './services/provider-setup-receipt.js'
import { emptyConversationState, extractiveEpisodeFallback, mergeConversationState, normalizeConversationSetup, normalizeConversationState, type StoredConversationMessage } from './ai/context.js'
import { supportsProviderLookup } from './lookup/provider-tools.js'
import { normalizeUiLocale } from '../shared/locales.js'
import { filterConfirmedMemoryCandidates, memorySemanticSlot, normalizeMemorySemanticSlot } from './memory-candidates.js'
import { asksToRemember, layerOf, memoriesInScope, memoryDestination, memoryFrame, memoryKindOf, memoryValidTo, scopedSemanticSlot, settleMemoryKind, tierForExtractedFact } from './memory-policy.js'
import { MEMORY_KIND_RULES } from '../shared/memory.js'
import { activeMemories, keepInConversation, learningFocus, listConversationMemories, memoryForInterface, recordLearningEvents, saveLongTermMemory, storedMemories as allStoredMemories, transaction } from './services/memory-store.js'
import { ensureMemoryLocalizations, registerMemoryRoutes } from './memory-routes.js'
import { visibleConversationMessages } from './conversation-messages.js'
import { CONVERSATION_PRESETS, conversationPreset } from '../shared/conversation-presets.js'
import { persistSceneRun, prepareSceneConversation, sceneOriginForConversation, setConversationBackgroundSaved, type PreparedSceneConversation } from './services/conversation-scenes.js'
import { conversationLevel, registerProficiencyRoutes } from './proficiency-routes.js'
import { registerPlacementRoutes } from './placement-routes.js'
import { registerConversationHelpRoutes } from './conversation-help-routes.js'
import { registerRecapRoutes } from './recap-routes.js'
import { registerSpeechRoutes } from './speech-routes.js'
import { registerUsageMeter, registerUsageRoutes } from './usage-routes.js'
import { openActiveProfile, registerProfileRoutes } from './profiles.js'
import { registerProgressRoutes } from './progress-routes.js'
import { registerLanRoutes } from './lan.js'
import { tagUsage } from './ai/usage-meter.js'
import { countsAsError, normalizeRegister, normalizeVariant } from '../shared/variants.js'
import { randomScene } from './random-scene.js'
import { setupSteering } from './setup-steering.js'
import { registerWordbookRoutes, type ConversationStart } from './wordbook-routes.js'
import { chooseLevel, conversationDifficulty, getProfile, helpForLine, lineAnswered, saveAnswer, skipSeeding, startConversationDifficulty, workingStepFor } from './proficiency-store.js'
import { difficultyProfile, parseLevel, replyStep } from '../shared/proficiency.js'
import { ARRANGED_AT_ONCE, type ReviewRating } from '../shared/wordbook.js'
import { replyParts, spokenIn, toldInParts, type ReplyBeat } from '../shared/reply.js'
import { arrangeChosenWords, arrangeDueWords, recordWordUses, reviewPreview, reviewWord, waitingWords, type WordRow } from './word-store.js'

// Two learners can ask for the same thing at the same moment; neither is handed the other's.
const inFlightTurns = perDatabase(() => new Map<string, Promise<unknown>>())
const inFlightTranslations = perDatabase(() => new Map<string, Promise<string>>())
const inFlightLookups = perDatabase(() => new Map<string, Promise<Awaited<ReturnType<typeof lookupTerm>>>>())

async function settingsPayload(input?: AppConfig) {
  const current = input || await getConfig()
  const secrets = await getSecrets()
  const providers = current.providers.map((provider) => {
    const { baseUrl, ...publicProvider } = provider
    return {
    ...publicProvider,
    // Only the address the learner typed in themselves is theirs to see and change.
    ...(provider.id === CUSTOM_PROVIDER_ID ? { baseUrl } : {}),
    hasApiKey: Boolean(secrets[provider.apiKeySecret]),
    capabilityReady: capabilityCurrent(provider),
  }})
  const selected = providers.find((provider) => provider.id === current.llm.defaultProvider)
  const modelReady = Boolean(selected?.model && selected.capabilityReady && selected.hasApiKey)
  const webLookupReady = Boolean(selected?.hasApiKey && selected.capabilityReady && selected.capability?.lookupReady && supportsProviderLookup(selected.id))
  return { ...current, providers, modelReady, webLookupReady }
}

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

/**
 * A reply records the ids of the memories it was written with. Their wording is looked up when a
 * message is read, so an edited memory shows as it is now and a deleted one is no longer shown.
 */
function withUsedMemories<T extends Record<string, any>>(meta: T, interfaceLocale?: string): T {
  const ids = Array.isArray(meta?.usedMemoryIds) ? meta.usedMemoryIds as string[] : []
  if (!ids.length) return meta
  const known = new Map(allStoredMemories().map((memory) => [String(memory.id), memory]))
  const usedMemories = ids.flatMap((id) => {
    const memory = known.get(id)
    if (!memory) return []
    const shown = interfaceLocale ? memoryForInterface(memory, interfaceLocale) : memory
    return [{ id, value: String(shown.value || ''), layer: layerOf(memory.memoryType) }]
  })
  return { ...meta, usedMemories }
}

function setupForConversation(conversation: Record<string, any>) {
  return normalizeConversationSetup(safeJson(conversation.setup_json, null))
}

/**
 * The learning language a conversation was started in. Conversations from before it was
 * recorded have none, and follow whatever the learning language is set to now.
 */
function recordedLearningLanguage(conversation: Record<string, any> | undefined): LearningLanguage | undefined {
  const targetLanguage = typeof conversation?.target_language === 'string' ? conversation.target_language.trim() : ''
  const targetLanguageCode = typeof conversation?.target_language_code === 'string' ? conversation.target_language_code.trim() : ''
  return targetLanguage && targetLanguageCode ? { targetLanguage, targetLanguageCode } : undefined
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
  const messages: Array<Record<string, any>> = visibleConversationMessages(rows<Record<string, any>>('SELECT id, role, content, status, client_message_id AS clientMessageId, meta_json AS metaJson, created_at AS createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at', conversationId)
    .map((message) => ({ ...message, meta: safeJson<Record<string, any>>(message.metaJson, {}) }) as Record<string, any>)
  )
  const confirmedMemories = rows<Record<string, any>>(`SELECT category, key, semantic_slot AS semanticSlot, value, status,
    localized_values_json AS localizedValuesJson, memory_type AS memoryType, topic,
    source_message_id AS sourceMessageId
    FROM memories WHERE status = 'confirmed' AND (valid_to IS NULL OR valid_to > ?)`, new Date().toISOString())
  for (const message of messages) {
    const candidates = Array.isArray(message.meta.memoryCandidates) ? message.meta.memoryCandidates : []
    const filtered = filterConfirmedMemoryCandidates(candidates, confirmedMemories)
    if (filtered.length === candidates.length) continue
    message.meta.memoryCandidates = filtered
    delete message.meta.feedbackLocalizations
    db.prepare('UPDATE messages SET meta_json = ? WHERE id = ?').run(JSON.stringify(message.meta), message.id)
  }
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

function createConversationRecord(setup: ConversationSetup | null, interfaceLocale: string, learning: AppConfig['learning'], title?: string, preparedScene?: PreparedSceneConversation, start: ConversationStart = {}) {
  const id = nanoid()
  tagUsage({ conversationId: id })
  const now = new Date().toISOString()
  const conversationTitle = title?.trim() || setup?.title || 'Open conversation'
  const state = emptyConversationState(setup)
  const openingLine = setup?.openingLine || start.openingLine?.trim() || ''
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(`INSERT INTO conversations
      (id, mode, title, setup_json, interface_locale, target_language, target_language_code, state_json, material_json, status, created_at, updated_at)
      VALUES (?, 'conversation', ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`).run(id, conversationTitle, setup ? JSON.stringify(setup) : null, interfaceLocale, learning.targetLanguage, learning.targetLanguageCode, JSON.stringify(state), start.material ? JSON.stringify(start.material) : '', now, now)
    if (openingLine) {
      db.prepare('INSERT INTO messages (id, conversation_id, role, content, meta_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(nanoid(), id, 'assistant', openingLine, JSON.stringify({ opening: true }), 'complete', now)
    }
    if (preparedScene) persistSceneRun(id, preparedScene)
    startConversationDifficulty(id, learning.targetLanguageCode, learning.proficiency)
    if (start.words?.ids.length) arrangeChosenWords(id, start.words.ids, start.words.source, new Date(now))
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { id }
}

function conversationTurnMessage(message: Record<string, any>) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    clientMessageId: message.client_message_id || undefined,
    status: message.status,
    meta: withUsedMemories(safeJson<Record<string, any>>(message.meta_json, {})),
    createdAt: message.created_at,
  }
}

function assertMatchingTurnContent(existing: Record<string, any> | undefined, content: string) {
  if (!existing || existing.content === content) return
  throw Object.assign(new Error('This send identifier is already bound to different message content.'), {
    statusCode: 409,
    code: 'CLIENT_MESSAGE_ID_CONFLICT',
  })
}

function wordPayload(item: Record<string, any>) {
  return { ...item, interfaceLocale: item.interface_locale, details: safeJson(item.details_json, {}) }
}

export interface RouteOptions {
  /** The port this program answers on, for the address other devices on the network are given. */
  port: () => number
  /** Writes the partner's reply to each turn, in place of the way it is written here. */
  writeReply?: ReplyWriter
  /**
   * Told of each conversation set in a scene as it starts, before the learner sees it. The parts it gives back are
   * how the opening is told: the same line, with what is narrated around it.
   */
  openScene?: (opening: SceneOpening) => Promise<ReplyBeat[] | void>
}

export interface SceneOpening {
  conversationId: string
  setup: ConversationSetup
  /** The line the scene opens with. Empty when it opens with nothing said. */
  openingLine: string
}

/**
 * Registers every route of the app on a server created elsewhere, so that a program other than the
 * one in ./index.ts can host the same routes and add its own beside them.
 */
export function registerRoutes(app: FastifyInstance, options: RouteOptions) {
  registerUsageMeter(app)

  /**
   * Hands the opening of a scene to whoever hosts the routes. The line stays what it is, so that reading aloud and
   * translating work from it; a host that fails, or tells it as some other line, leaves the opening as it was.
   */
  const opened = async (created: { id: string }, setup: ConversationSetup | null) => {
    if (!options.openScene || !setup) return created
    const opening = row<{ id: string; content: string }>("SELECT id, content FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at LIMIT 1", created.id)
    try {
      const beats = await options.openScene({ conversationId: created.id, setup, openingLine: opening?.content || '' })
      if (opening && toldInParts(beats) && spokenIn(beats) === opening.content) {
        db.prepare('UPDATE messages SET meta_json = ? WHERE id = ?').run(JSON.stringify({ opening: true, beats: replyParts(opening.content, beats) }), opening.id)
      }
    } catch (error) {
      app.log.warn(error, 'the opening of a scene stays one line')
    }
    return created
  }

  app.setErrorHandler((error, _request, reply) => {
    const issue = error as Error & { statusCode?: number; code?: string; details?: Record<string, number | string> }
    app.log.error(issue)
    const statusCode = issue.statusCode && issue.statusCode >= 400 && issue.statusCode <= 599 ? issue.statusCode : 500
    reply.code(statusCode).send({
      error: issue.message || 'Unexpected error',
      ...(issue.code ? { code: issue.code } : {}),
      ...(issue.details ? { details: issue.details } : {}),
    })
  })

  app.get('/api/health', async () => ({ app: 'local-language-coach', ok: true, version: '0.1.0', pid: process.pid, localOnly: !(await getRemoteStatus()).active, time: new Date().toISOString() }))

  app.get('/api/remote/status', async () => {
    const status = await getRemoteStatus()
    return status.active
      ? { active: true, url: status.url, allowedEmails: status.allowedEmails, startedAt: status.startedAt }
      : { active: false }
  })

  app.get('/api/settings', async () => settingsPayload())

  app.put<{ Body: AppConfig }>('/api/settings', async (request) => {
    const current = await getConfig()
    const secrets = await getSecrets()
    const requestedDefault = request.body.llm?.defaultProvider
    if (requestedDefault && requestedDefault !== current.llm.defaultProvider) {
      const provider = current.providers.find((item) => item.id === requestedDefault)
      const qualified = Boolean(provider && capabilityCurrent(provider) && secrets[provider.apiKeySecret])
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
      learning: { ...current.learning, ...request.body.learning, difficultyStep: undefined },
      llm: { ...current.llm, ...request.body.llm },
      webLookup: {
        ...current.webLookup,
        ...request.body.webLookup,
        enabled: selectedLookupReady ? Boolean(request.body.webLookup?.enabled) : false,
        provider: 'selected',
      },
      server: current.server,
      providers: current.providers,
      memory: { consolidate: typeof request.body.memory?.consolidate === 'boolean' ? request.body.memory.consolidate : Boolean(current.memory?.consolidate) },
    }
    delete next.learning.difficultyStep
    const variant = normalizeVariant(next.learning.targetLanguageCode, next.learning.variant)
    if (variant) next.learning.variant = variant
    else delete next.learning.variant
    if (next.learning.register !== undefined) next.learning.register = normalizeRegister(next.learning.register)
    if (next.llm.reviewProvider && !next.providers.some((item) => item.id === next.llm.reviewProvider)) next.llm.reviewProvider = ''
    await saveConfig(next)
    if (!current.setupComplete && next.setupComplete) skipSeeding()
    // A level picked in settings is the learner's own choice for the language in use.
    const pickedStep = next.learning.proficiency !== current.learning.proficiency ? parseLevel(next.learning.proficiency) : undefined
    if (pickedStep !== undefined) {
      chooseLevel(next.learning.targetLanguageCode, pickedStep, getProfile(next.learning.targetLanguageCode) ? 'manual' : 'self')
    }
    return settingsPayload(next)
  })

  app.post('/api/settings/reset', async () => {
    const before = await getConfig()
    let next = await resetConfig({ clearSecrets: true })
    // Resetting settings takes nobody's conversations away: the list of learners survives it.
    if (before.profiles?.length) next = await saveConfig({ ...next, profiles: before.profiles, activeProfile: before.activeProfile })
    await openActiveProfile()
    await resetProviderSetupSigningKey()
    return { ok: true, config: next }
  })

  /** Sets the address and name of the one provider that is the learner's own: any service that speaks the OpenAI chat interface. */
  app.put<{ Body: { name?: string; baseUrl?: string } }>('/api/providers/custom/endpoint', async (request) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim().slice(0, 60) : ''
    const baseUrl = typeof request.body?.baseUrl === 'string' ? request.body.baseUrl.trim().replace(/\/+$/u, '') : ''
    if (!name || !isHttpUrl(baseUrl)) throw Object.assign(new Error('Enter a name and an http or https address.'), { statusCode: 400, code: 'CUSTOM_ENDPOINT_INVALID' })
    const current = await getConfig()
    const secrets = await getSecrets()
    const existing = current.providers.find((item) => item.id === CUSTOM_PROVIDER_ID)
    if (!existing) {
      current.providers.push(customProvider(name, baseUrl))
    } else {
      if (existing.baseUrl !== baseUrl) {
        // Another address is another service: nothing tested against the old one holds, and the old key is not sent to it.
        delete existing.capability
        existing.model = ''
        existing.enabled = false
        existing.modelProfiles = {}
        delete secrets[existing.apiKeySecret]
        if (current.llm.defaultProvider === CUSTOM_PROVIDER_ID) current.llm.defaultProvider = ''
        if (current.llm.reviewProvider === CUSTOM_PROVIDER_ID) current.llm.reviewProvider = ''
      }
      existing.name = name
      existing.baseUrl = baseUrl
    }
    return settingsPayload(await saveConfigAndSecrets(current, secrets))
  })

  app.delete('/api/providers/custom/endpoint', async () => {
    const current = await getConfig()
    const secrets = await getSecrets()
    const existing = current.providers.find((item) => item.id === CUSTOM_PROVIDER_ID)
    if (!existing) return settingsPayload(current)
    current.providers = current.providers.filter((item) => item.id !== CUSTOM_PROVIDER_ID)
    delete secrets[existing.apiKeySecret]
    if (current.llm.defaultProvider === CUSTOM_PROVIDER_ID) current.llm.defaultProvider = ''
    if (current.llm.reviewProvider === CUSTOM_PROVIDER_ID) current.llm.reviewProvider = ''
    return settingsPayload(await saveConfigAndSecrets(current, secrets))
  })

  app.put<{ Params: { id: string }; Body: { apiKey?: string; model?: string; enabled?: boolean; contextWindowTokens?: number; maxOutputTokens?: number; modelProfiles?: Record<string, ProviderModelProfile>; setupReceipt?: string } }>('/api/providers/:id', async (request) => {
    const current = await getConfig()
    const secrets = await getSecrets()
    const provider = current.providers.find((item) => item.id === request.params.id)
    if (!provider) throw Object.assign(new Error('Provider not found'), { statusCode: 404 })
    const previousModel = provider.model
    const enteredKey = typeof request.body.apiKey === 'string' ? request.body.apiKey.trim() : ''
    const requestedModel = typeof request.body.model === 'string' ? request.body.model.trim() : previousModel
    if (!requestedModel || requestedModel.length > 200 || ['__proto__', 'prototype', 'constructor'].includes(requestedModel)) {
      throw Object.assign(new Error('Choose a valid model before saving'), { statusCode: 400 })
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
    const apiKey = enteredKey || secrets[provider.apiKeySecret] || ''
    const existingCapabilityMatches = previousModel === provider.model && capabilityCurrent(provider)
    const requiresReceipt = Boolean(request.body.setupReceipt) || Boolean(enteredKey) ||
      previousModel !== provider.model || !existingCapabilityMatches || !apiKey
    if (requiresReceipt) {
      const claims = await verifyProviderSetupReceipt(request.body.setupReceipt, {
        providerId: provider.id,
        model: provider.model,
        apiKey,
      })
      const capability = claims.capability
      if (capability.conversationReady !== true || (capability.lookupReady !== true && provider.id !== CUSTOM_PROVIDER_ID) ||
        capability.contractVersion !== STRUCTURED_CONTRACT_VERSION ||
        capability.model !== provider.model ||
        capability.baseUrl.replace(/\/$/, '') !== provider.baseUrl.replace(/\/$/, '') ||
        !['json_schema', 'json_object', 'prompt_json'].includes(capability.outputMode)) {
        throw Object.assign(new Error('The provider setup receipt is stale or incompatible. Test the model again.'), {
          statusCode: 409,
          code: 'SETUP_RECEIPT_INVALID',
        })
      }
      provider.capability = capability
    }
    if (!current.llm.defaultProvider && provider.capability) current.llm.defaultProvider = provider.id
    const nextSecrets = { ...secrets }
    if (enteredKey && provider.apiKeySecret) nextSecrets[provider.apiKeySecret] = enteredKey
    await saveConfigAndSecrets(current, nextSecrets)
    return settingsPayload(current)
  })

  app.delete<{ Params: { id: string } }>('/api/providers/:id/secret', async (request) => {
    const current = await getConfig()
    const secrets = await getSecrets()
    const provider = current.providers.find((item) => item.id === request.params.id)
    if (!provider) throw Object.assign(new Error('Provider not found'), { statusCode: 404 })
    if (!provider.apiKeySecret) throw Object.assign(new Error('This provider does not use an API key'), { statusCode: 400 })
    const nextSecrets = { ...secrets }
    delete nextSecrets[provider.apiKeySecret]
    if (current.llm.defaultProvider === provider.id && current.webLookup.enabled) {
      current.webLookup.enabled = false
    }
    await saveConfigAndSecrets(current, nextSecrets)
    return { ok: true }
  })

  app.post<{ Params: { id: string }; Body: ProviderTestOverrides }>('/api/providers/:id/test', async (request) => testProvider(request.params.id, request.body || {}))

  app.post<{ Params: { id: string }; Body: ProviderTestOverrides }>('/api/providers/:id/models', async (request) => listProviderModels(request.params.id, request.body || {}))

  app.post<{ Body: { domain?: string; place?: string; detail?: string; interfaceLocale?: string } }>('/api/conversation-setups/suggest', async (request) => {
    const current = await getConfig()
    const code = current.learning.targetLanguageCode
    return { setups: await suggestSetups({ ...(request.body || {}), ...setupSteering(code), difficultyStep: workingStepFor(code, current.learning.proficiency) }) }
  })

  /** Surprise me: a kind of conversation, a place and a person drawn at random, and straight into the conversation. */
  app.post<{ Body: { interfaceLocale?: string } }>('/api/conversation-setups/random', async (request) => {
    await assertModelConfigured()
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(request.body?.interfaceLocale, current.ui.locale)
    const code = current.learning.targetLanguageCode
    const [suggested] = await suggestSetups({
      ...randomScene(), interfaceLocale, count: 1,
      avoidRecent: setupSteering(code).avoidRecent,
      difficultyStep: workingStepFor(code, current.learning.proficiency),
    })
    const setup = normalizeConversationSetup(suggested)
    if (!setup) throw Object.assign(new Error('The model returned no usable scene.'), { statusCode: 502, code: 'PROVIDER_INVALID_RESPONSE' })
    return opened(createConversationRecord(setup, interfaceLocale, current.learning), setup)
  })

  app.get('/api/conversation-presets', async () => ({
    presets: CONVERSATION_PRESETS.map(({ promptBrief: _promptBrief, ...preset }) => preset),
  }))

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
    WHERE EXISTS (
      SELECT 1
      FROM messages recorded
      WHERE recorded.conversation_id = c.id
        AND recorded.role = 'user'
        AND TRIM(recorded.content) <> ''
    )
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
    const setup = normalizeConversationSetup(request.body.setup)
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
    return opened(createConversationRecord(setup, interfaceLocale, current.learning, request.body.title), setup)
  })

  app.post<{ Params: { id: string }; Body: { anchor?: string; interfaceLocale?: string } }>('/api/conversation-presets/:id/start', async (request) => {
    const preset = conversationPreset(request.params.id)
    if (!preset) throw Object.assign(new Error('Scene preset not found.'), { statusCode: 404 })
    const anchor = typeof request.body.anchor === 'string' ? request.body.anchor.trim() : ''
    if (preset.kind === 'anchor' && !anchor) throw Object.assign(new Error('Add one detail before starting this scene.'), { statusCode: 400, code: 'SCENE_ANCHOR_REQUIRED' })
    if ('anchor' in preset && preset.anchor && anchor.length > preset.anchor.maxLength) throw Object.assign(new Error('That scene detail is too long.'), { statusCode: 400, code: 'SCENE_ANCHOR_TOO_LONG' })
    await assertModelConfigured()
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
    const prepared = await prepareSceneConversation({
      presetId: preset.id, anchorValue: anchor, interfaceLocale,
      difficultyStep: workingStepFor(current.learning.targetLanguageCode, current.learning.proficiency),
    })
    return opened(createConversationRecord(prepared.setup, interfaceLocale, current.learning, undefined, prepared), prepared.setup)
  })

  app.post<{ Params: { id: string }; Body: { mode?: 'same_background' | 'new_encounter'; interfaceLocale?: string } }>('/api/conversations/:id/replay', async (request) => {
    const origin = sceneOriginForConversation(request.params.id)
    if (!origin) throw Object.assign(new Error('This conversation did not start from a reusable scene.'), { statusCode: 404 })
    await assertModelConfigured()
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
    const mode = request.body.mode === 'same_background' ? 'same_background' : 'new_encounter'
    const prepared = await prepareSceneConversation({
      presetId: origin.presetId,
      anchorValue: origin.anchorValue,
      interfaceLocale,
      backgroundId: mode === 'same_background' ? origin.backgroundId : undefined,
      excludeBackgroundId: mode === 'new_encounter' ? origin.backgroundId : undefined,
      runMode: mode,
      difficultyStep: workingStepFor(current.learning.targetLanguageCode, current.learning.proficiency),
    })
    return opened(createConversationRecord(prepared.setup, interfaceLocale, current.learning, undefined, prepared), prepared.setup)
  })

  app.patch<{ Params: { id: string }; Body: { saved?: boolean } }>('/api/conversations/:id/background', async (request) => {
    setConversationBackgroundSaved(request.params.id, request.body.saved === true)
    return { ok: true, saved: request.body.saved === true }
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
    const messages = (await messagesForInterface(conversation.id, requestedLocale))
      .map((message) => message.role === 'assistant' ? { ...message, meta: withUsedMemories(message.meta, requestedLocale) } : message)
    const origin = sceneOriginForConversation(conversation.id)
    const learning = recordedLearningLanguage(conversation)
    return {
      id: conversation.id,
      mode: 'conversation',
      title: setup?.title || conversation.title,
      status: conversation.status === 'archived' ? 'archived' : 'active',
      interfaceLocale: responseLocale,
      // Absent on conversations from before it was recorded; the page then uses the current learning language.
      ...(learning ? { targetLanguageCode: learning.targetLanguageCode } : {}),
      setup,
      scene: origin ? { origin } : null,
      level: conversationLevel(conversation.id, learning?.targetLanguageCode || current.learning.targetLanguageCode, current.learning.proficiency),
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

  app.get<{ Params: { id: string; clientMessageId: string } }>('/api/conversations/:id/turns/:clientMessageId', async (request) => {
    const userMessage = row<Record<string, any>>(
      'SELECT * FROM messages WHERE conversation_id = ? AND client_message_id = ? AND role = ?',
      request.params.id,
      request.params.clientMessageId,
      'user',
    )
    if (!userMessage) return { status: 'missing', clientMessageId: request.params.clientMessageId }
    const assistantMessage = row<Record<string, any>>('SELECT * FROM messages WHERE reply_to_message_id = ?', userMessage.id)
    const status = ['pending', 'failed', 'complete'].includes(userMessage.status) ? userMessage.status : 'failed'
    return {
      status,
      clientMessageId: request.params.clientMessageId,
      userMessage: conversationTurnMessage(userMessage),
      ...(assistantMessage ? { assistantMessage: conversationTurnMessage(assistantMessage) } : {}),
    }
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
    const submittedExisting = row<Record<string, any>>('SELECT * FROM messages WHERE conversation_id = ? AND client_message_id = ?', request.params.id, clientMessageId)
    assertMatchingTurnContent(submittedExisting, content)
    const running = inFlightTurns().get(inFlightKey)
    if (running) return running
    const task = (async () => {
      const existing = row<Record<string, any>>('SELECT * FROM messages WHERE conversation_id = ? AND client_message_id = ?', request.params.id, clientMessageId)
      assertMatchingTurnContent(existing, content)
      if (existing?.status === 'complete') {
        const assistant = row<Record<string, any>>('SELECT * FROM messages WHERE reply_to_message_id = ?', existing.id)
        if (assistant) {
          const meta = withUsedMemories(safeJson<Record<string, any>>(assistant.meta_json, {}), interfaceLocale)
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
      const frame = memoryFrame(setup)
      const learning = recordedLearningLanguage(conversation)
      const targetLanguageCode = learning?.targetLanguageCode || current.learning.targetLanguageCode
      const everyMemory = activeMemories(now)
      // Scope comes first. What this conversation may not see never reaches the model, however relevant it looks.
      const storedMemories = memoriesInScope(everyMemory, { frame, targetLanguageCode })
      await ensureMemoryLocalizations(storedMemories, interfaceLocale).catch(() => undefined)
      const memories = storedMemories.map((memory) => memoryForInterface(memory, interfaceLocale))
      const conversationMemories = listConversationMemories(request.params.id)
      // The difficulty this conversation stands at, and the help asked for on the line being answered.
      const lineId = lineAnswered(request.params.id, userId)
      const difficulty = {
        state: conversationDifficulty(request.params.id, targetLanguageCode, current.learning.proficiency),
        help: helpForLine(request.params.id, lineId),
      }
      const material = safeJson<ConversationMaterial | null>(conversation.material_json, null)
      // Saved words whose review has come get a place in the conversation, a couple at a time.
      if (current.learning.reviewInConversation !== false) {
        arrangeDueWords({ conversationId: request.params.id, languageCode: targetLanguageCode, step: replyStep(difficulty.state), now: new Date(now) })
      }
      const reviewWords = waitingWords(request.params.id).slice(0, ARRANGED_AT_ONCE).map((word) => ({ term: word.term, meaning: word.meaning }))
      let turn
      try {
        turn = await coachTurn({
          conversationId: request.params.id,
          difficulty,
          reviewWords,
          material,
          setup,
          messages: messageRows,
          memories,
          conversationMemories: conversationMemories.map((memory) => ({ key: memory.key, value: memory.value })),
          learningFocus: learningFocus(targetLanguageCode, current.learning.targetLanguageCode),
          episodes: compacted.episodes,
          state: compacted.state,
          interfaceLocale,
          learning,
        }, options.writeReply)
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
      // Every statement the learner made about themselves, or the part they play, stays with this
      // conversation. Only one about the real learner that holds beyond the moment is also offered
      // as a long-term memory, and the learner decides that. The model's reading never does.
      const explicitRequest = asksToRemember(content)
      const kept: Array<Parameters<typeof keepInConversation>[0]> = []
      const offered: MemoryCandidate[] = []
      const savedAtOnce = new Set<MemoryCandidate>()
      for (const fact of merged.userFacts) {
        const about = fact.about || (frame === 'scene' ? 'persona' : 'user')
        const durability = fact.durability || 'lasting'
        const destination = memoryDestination({ frame, about, durability, explicit: Boolean(fact.explicit) && explicitRequest })
        if (destination === 'drop') continue
        const kind = settleMemoryKind(memoryKindOf(fact.memoryType), durability)
        const semanticSlot = scopedSemanticSlot(normalizeMemorySemanticSlot(fact.semanticSlot), kind, targetLanguageCode)
        kept.push({
          conversationId: request.params.id, key: fact.key, semanticSlot, value: fact.value, quote: fact.quote, about, durability,
          memoryType: kind, topic: fact.topic, sensitive: fact.sensitive, interfaceLocale, sourceMessageId: userId,
        })
        if (destination === 'conversation') continue
        const existingMemory = everyMemory.find((memory) =>
          (semanticSlot && memorySemanticSlot(memory) === semanticSlot) || (memory.key === fact.key && layerOf(memory.memoryType) === layerOf(kind)))
        const validTo = memoryValidTo(kind, durability, fact.validDays)
        const candidate: MemoryCandidate = {
          category: layerOf(kind),
          key: fact.key,
          semanticSlot,
          value: fact.value,
          quote: fact.quote,
          confidence: 1,
          sensitive: fact.sensitive,
          action: existingMemory ? 'update' : 'create',
          tier: tierForExtractedFact({ ...fact, memoryType: kind }, existingMemory?.tier),
          memoryType: kind,
          topic: fact.topic || 'general',
          importance: Math.max(0, Math.min(1, fact.importance ?? 0.5)),
          sourceMessageId: userId,
          frame,
          durability,
          ...(validTo ? { validTo } : {}),
          ...(MEMORY_KIND_RULES[kind].perLanguage ? { targetLanguageCode } : {}),
          ...(existingMemory ? { previousValue: String(memoryForInterface(existingMemory, interfaceLocale).value || '') } : {}),
        }
        offered.push(candidate)
        // Asking to remember stores something new at once. Changing what is already remembered still asks,
        // so the learner sees what would be replaced.
        if (destination === 'save' && !existingMemory) savedAtOnce.add(candidate)
      }
      result.memoryCandidates = filterConfirmedMemoryCandidates(offered, everyMemory)
      result.usedMemoryIds = [...new Set(turn.context.memoryIds)]
      try {
        transaction(() => {
          for (const item of kept) keepInConversation(item)
          for (const candidate of result.memoryCandidates) {
            if (!savedAtOnce.has(candidate)) continue
            const save = (tier: MemoryCandidate['tier']) => saveLongTermMemory({
              ...candidate, tier, status: 'confirmed', sourceConversationId: request.params.id, interfaceLocale,
            })
            try {
              candidate.savedMemoryId = save(candidate.tier).id
            } catch (error) {
              // A full set of core memories must not cost the learner the turn; it is stored without the mark.
              if ((error as { code?: string })?.code !== 'CORE_MEMORY_LIMIT') throw error
              candidate.tier = 'long_term'
              candidate.savedMemoryId = save('long_term').id
            }
          }
          recordLearningEvents({
            targetLanguageCode, conversationId: request.params.id, messageId: userId,
            corrections: result.corrections, reconstruction: result.reconstruction, at: replyAt,
          })
          const reviewedWords = recordWordUses({
            conversationId: request.params.id, messageId: userId, content, corrections: result.corrections.filter(countsAsError),
            languageCode: targetLanguageCode, now: new Date(replyAt),
          })
          if (reviewedWords.length) result.reviewedWords = reviewedWords
          db.prepare('INSERT INTO messages (id, conversation_id, role, content, meta_json, reply_to_message_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(assistantId, request.params.id, 'assistant', result.roleReply, JSON.stringify(result), userId, 'complete', replyAt)
          db.prepare('UPDATE messages SET status = ? WHERE id = ?').run('complete', userId)
          db.prepare("UPDATE conversations SET status = 'active', archived_at = NULL, state_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(merged.state), replyAt, request.params.id)
          if (turn.level) {
            saveAnswer({
              conversationId: request.params.id, partnerMessageId: lineId, userMessageId: userId, languageCode: targetLanguageCode,
              step: turn.level.step, signal: turn.level.signal, difficulty: turn.level.difficulty, at: replyAt,
            })
          }
          for (const memoryId of new Set(turn.context.memoryIds)) {
            db.prepare('UPDATE memories SET use_count = use_count + 1, last_used_at = ? WHERE id = ?').run(replyAt, memoryId)
          }
          const mentionedMemory = memories.find((memory) => memory.key === turn.context.dialoguePlan.callbackMemoryKey)
          if (mentionedMemory && turn.context.memoryIds.includes(String(mentionedMemory.id))) {
            db.prepare('UPDATE memories SET mention_count = mention_count + 1, last_mentioned_at = ? WHERE id = ?')
              .run(replyAt, mentionedMemory.id)
          }
        })
      } catch (error) {
        db.prepare('UPDATE messages SET status = ? WHERE id = ?').run('failed', userId)
        throw error
      }
      return {
        userMessage: { id: userId, role: 'user', content, clientMessageId, status: 'complete', createdAt: now },
        assistantMessage: { id: assistantId, role: 'assistant', content: result.roleReply, status: 'complete', meta: withUsedMemories(result, interfaceLocale), createdAt: replyAt },
        status: 'active',
        ...(turn.level ? { level: { replyStep: turn.level.step, speechRateFactor: difficultyProfile(turn.level.step, targetLanguageCode).speechRateFactor } } : {}),
      }
    })()
    inFlightTurns().set(inFlightKey, task)
    try { return await task }
    finally { if (inFlightTurns().get(inFlightKey) === task) inFlightTurns().delete(inFlightKey) }
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
    const learning = recordedLearningLanguage(conversation)
    const cacheKey = translationCacheKey({
      content: message.content,
      targetLanguageCode: (learning || current.learning).targetLanguageCode,
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
    const running = inFlightTranslations().get(cacheKey)
    let translation: string
    if (running) {
      translation = await running
    } else {
      const task = (async () => {
        const generated = await translateMessage(message.content, setup, interfaceLocale, learning)
        const now = new Date().toISOString()
        db.prepare(`INSERT INTO translation_cache (cache_key, translation, created_at, last_accessed)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(cache_key) DO UPDATE SET translation = excluded.translation, last_accessed = excluded.last_accessed`).run(cacheKey, generated, now, now)
        db.prepare(`DELETE FROM translation_cache WHERE cache_key IN (
          SELECT cache_key FROM translation_cache ORDER BY last_accessed DESC LIMIT -1 OFFSET 2000
        )`).run()
        return generated
      })()
      inFlightTranslations().set(cacheKey, task)
      try { translation = await task }
      finally { if (inFlightTranslations().get(cacheKey) === task) inFlightTranslations().delete(cacheKey) }
    }
    meta.roleReplyTranslations = { ...translations, [interfaceLocale]: translation }
    db.prepare('UPDATE messages SET meta_json = ? WHERE id = ?').run(JSON.stringify(meta), message.id)
    return { translation, interfaceLocale, cached: Boolean(running), cacheSource: running ? 'inflight' : 'generated' }
  })

  app.post<{ Body: { term: string; sentence: string; previous?: string; setup?: unknown; interfaceLocale?: string; conversationId?: string } }>('/api/lookup', async (request) => {
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
    const { conversationId, ...lookupRequest } = request.body
    // A word looked up inside a conversation is in that conversation's language, not necessarily the current one.
    const learning = typeof conversationId === 'string' && conversationId
      ? recordedLearningLanguage(row<Record<string, any>>('SELECT target_language, target_language_code FROM conversations WHERE id = ?', conversationId))
      : undefined
    const cacheKey = lookupCacheKey({
      ...lookupRequest,
      targetLanguage: (learning || current.learning).targetLanguage,
      targetLanguageCode: (learning || current.learning).targetLanguageCode,
      interfaceLocale,
    })
    const cached = readAiResponseCache<Awaited<ReturnType<typeof lookupTerm>>>('lookup', cacheKey)
    if (cached) return { lookup: cached, cached: true, cacheSource: 'persistent' }
    const running = inFlightLookups().get(cacheKey)
    if (running) return { lookup: await running, cached: true, cacheSource: 'inflight' }
    const task = lookupTerm({ ...lookupRequest, interfaceLocale, learning })
    inFlightLookups().set(cacheKey, task)
    try {
      const lookup = await task
      writeAiResponseCache('lookup', cacheKey, lookup)
      return { lookup, cached: false, cacheSource: 'generated' }
    } finally {
      if (inFlightLookups().get(cacheKey) === task) inFlightLookups().delete(cacheKey)
    }
  })

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
      learning: recordedLearningLanguage(conversation),
    })
    const now = new Date().toISOString()
    db.prepare('UPDATE word_entries SET lemma = ?, meaning = ?, details_json = ?, interface_locale = ?, updated_at = ? WHERE id = ?')
      .run(lookup.lemma || word.lemma, lookup.contextMeaning, JSON.stringify(lookup), interfaceLocale, now, word.id)
    return wordPayload({ ...word, lemma: lookup.lemma || word.lemma, meaning: lookup.contextMeaning, details_json: JSON.stringify(lookup), interface_locale: interfaceLocale, updated_at: now })
  })

  app.post<{ Params: { id: string }; Body: { interfaceLocale?: string } }>('/api/words/:id/translation', async (request) => {
    const word = row<Record<string, any>>('SELECT * FROM word_entries WHERE id = ?', request.params.id)
    if (!word) throw Object.assign(new Error('Word not found'), { statusCode: 404 })
    const passage = String(word.source_sentence || '').trim()
    if (!passage) throw Object.assign(new Error('Word has no source passage'), { statusCode: 404 })
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(request.body?.interfaceLocale, current.ui.locale)
    // A saved word keeps the language it was learned in, which may no longer be the current target language.
    const passageLanguageCode = String(word.language || current.learning.targetLanguageCode).split('-')[0].toLowerCase()
    const conversation = word.conversation_id
      ? row<Record<string, any>>('SELECT * FROM conversations WHERE id = ?', word.conversation_id)
      : undefined
    const setup = conversation ? setupForConversation(conversation) : null
    const cacheKey = translationCacheKey({ content: passage, targetLanguageCode: passageLanguageCode, interfaceLocale, setup })
    const cached = row<{ translation: string }>('SELECT translation FROM translation_cache WHERE cache_key = ?', cacheKey)
    if (cached) {
      db.prepare('UPDATE translation_cache SET hit_count = hit_count + 1, last_accessed = ? WHERE cache_key = ?').run(new Date().toISOString(), cacheKey)
      return { translation: cached.translation, interfaceLocale, cached: true, cacheSource: 'shared' }
    }
    const running = inFlightTranslations().get(cacheKey)
    if (running) return { translation: await running, interfaceLocale, cached: true, cacheSource: 'inflight' }
    const task = (async () => {
      const generated = await translateMessage(passage, setup, interfaceLocale, passageLanguageCode)
      const now = new Date().toISOString()
      db.prepare(`INSERT INTO translation_cache (cache_key, translation, created_at, last_accessed)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET translation = excluded.translation, last_accessed = excluded.last_accessed`).run(cacheKey, generated, now, now)
      db.prepare(`DELETE FROM translation_cache WHERE cache_key IN (
        SELECT cache_key FROM translation_cache ORDER BY last_accessed DESC LIMIT -1 OFFSET 2000
      )`).run()
      return generated
    })()
    inFlightTranslations().set(cacheKey, task)
    try { return { translation: await task, interfaceLocale, cached: false, cacheSource: 'generated' } }
    finally { if (inFlightTranslations().get(cacheKey) === task) inFlightTranslations().delete(cacheKey) }
  })

  app.delete<{ Params: { id: string } }>('/api/words/:id', async (request) => { db.prepare('DELETE FROM word_entries WHERE id = ?').run(request.params.id); return { ok: true } })

  app.get('/api/reviews/due', async () => rows<Record<string, any>>('SELECT * FROM word_entries WHERE due_at <= ? ORDER BY due_at LIMIT 30', new Date().toISOString())
    .map((word) => ({ ...wordPayload(word), nextReview: reviewPreview(word as WordRow) })))

  app.post<{ Params: { id: string }; Body: { rating: 1 | 2 | 3 | 4 } }>('/api/reviews/:id', async (request) => {
    const rating = Math.max(1, Math.min(4, Math.round(Number(request.body?.rating)) || 3)) as ReviewRating
    const result = reviewWord(request.params.id, rating, 'card')
    if (!result) throw Object.assign(new Error('Word not found'), { statusCode: 404 })
    // A word that comes back within minutes is shown again in the same sitting, with its new intervals.
    const word = row<WordRow>('SELECT * FROM word_entries WHERE id = ?', request.params.id)
    return { ...result, nextReview: word ? reviewPreview(word) : null }
  })

  registerMemoryRoutes(app)
  registerProficiencyRoutes(app)
  registerPlacementRoutes(app)
  registerConversationHelpRoutes(app)
  registerRecapRoutes(app)
  registerSpeechRoutes(app)
  registerUsageRoutes(app)
  registerProfileRoutes(app, { busy: () => inFlightTurns().size > 0 })
  registerProgressRoutes(app)
  registerLanRoutes(app, { port: options.port })
  registerWordbookRoutes(app, {
    createConversation: (setup, interfaceLocale, learning, title, start) => opened(createConversationRecord(setup, interfaceLocale, learning, title, undefined, start), setup),
  })

  app.get('/api/export', async () => ({
    format: 'local-language-coach-backup', version: 3, exportedAt: new Date().toISOString(),
    config: await getConfig(),
    conversations: rows('SELECT * FROM conversations'), messages: rows('SELECT * FROM messages'), episodes: rows('SELECT * FROM conversation_episodes'), sceneAnchors: rows('SELECT * FROM scene_anchors'), sceneBackgrounds: rows('SELECT * FROM scene_backgrounds'), sceneRuns: rows('SELECT * FROM scene_runs'), words: rows('SELECT * FROM word_entries'), memories: rows('SELECT * FROM memories'), memoryRevisions: rows('SELECT * FROM memory_revisions'), memorySources: rows('SELECT * FROM memory_sources'), conversationMemories: rows('SELECT * FROM conversation_memories'), learningEvents: rows('SELECT * FROM learning_events'), memorySuggestions: rows('SELECT * FROM memory_suggestions'),
    // Version 3 adds the level, the tests and signals behind it, look-backs and practice, and what the wordbook keeps beyond the words.
    proficiencyProfiles: rows('SELECT * FROM proficiency_profiles'), proficiencyHistory: rows('SELECT * FROM proficiency_history'), placementSessions: rows('SELECT * FROM placement_sessions'), turnSignals: rows('SELECT * FROM turn_signals'), conversationAssessments: rows('SELECT * FROM conversation_assessments'),
    conversationRecaps: rows('SELECT * FROM conversation_recaps'), practiceSets: rows('SELECT * FROM practice_sets'),
    wordReviews: rows('SELECT * FROM word_reviews'), conversationWords: rows('SELECT * FROM conversation_words'), wordStories: rows('SELECT * FROM word_stories'), contentImports: rows('SELECT * FROM content_imports'), learningPaths: rows('SELECT * FROM learning_paths'),
  }))
}
