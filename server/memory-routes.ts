import type { FastifyInstance } from 'fastify'
import { getConfig } from './services/config.js'
import { db, perDatabase, row, rows } from './services/database.js'
import { safeJson } from './utils/json.js'
import { normalizeUiLocale } from '../shared/locales.js'
import { MEMORY_KIND_RULES, isMemoryKind, type MemoryDurability, type MemoryFrame, type MemoryKind } from '../shared/memory.js'
import { consolidateMemories, localizeMemoryValues } from './ai/engine.js'
import { normalizeConversationSetup } from './ai/context.js'
import { memorySemanticSlot, normalizeMemorySemanticSlot } from './memory-candidates.js'
import { layerOf, memoryKindOf, settleMemoryKind } from './memory-policy.js'
import {
  activeMemories, addMemoryRevision, addMemorySource, addSuggestion, assertCoreMemoryAvailable, deleteConversationMemory,
  forgetLearning, forgetLearningEvent, keepInConversation, learningStatus, listConversationMemories, memoriesForPage,
  memoryForInterface, openSuggestions, resolveSuggestion, saveLongTermMemory, storedMemories, suggestionById, transaction,
} from './services/memory-store.js'

const DAY = 24 * 60 * 60 * 1000
const MAX_IMPORTED_MEMORIES = 2000

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 })
}

function conversationRow(id: string) {
  const conversation = row<Record<string, any>>('SELECT * FROM conversations WHERE id = ?', id)
  if (!conversation) throw notFound('Conversation not found')
  return conversation
}

/** Fills in the wording of memories for an interface language they were not written in. One model call per batch. */
export async function ensureMemoryLocalizations(stored: Array<Record<string, any>>, interfaceLocale: string) {
  const missing = stored.filter((item) => item.status === 'confirmed' && item.interfaceLocale !== interfaceLocale &&
    !safeJson<Record<string, string>>(item.localizedValuesJson, {})[interfaceLocale])
  if (!missing.length) return
  const localized = await localizeMemoryValues(missing.map((item) => ({ id: item.id, value: item.value })), interfaceLocale)
  transaction(() => {
    for (const item of localized) {
      const source = stored.find((memory) => memory.id === item.id)
      if (!source) continue
      const translations = safeJson<Record<string, string>>(source.localizedValuesJson, {})
      translations[interfaceLocale] = item.value
      source.localizedValuesJson = JSON.stringify(translations)
      db.prepare('UPDATE memories SET localized_values_json = ? WHERE id = ?').run(source.localizedValuesJson, item.id)
    }
  })
}

const consolidating = perDatabase(() => new Map<string, Promise<{ ran: boolean; reason?: string; suggestions?: number }>>())

async function consolidateConversation(conversationId: string, requestedLocale?: string) {
  const current = await getConfig()
  if (!current.memory?.consolidate) return { ran: false, reason: 'off' }
  const conversation = conversationRow(conversationId)
  const last = row<{ id: string }>("SELECT id FROM messages WHERE conversation_id = ? AND status = 'complete' ORDER BY created_at DESC LIMIT 1", conversationId)
  if (!last || last.id === conversation.consolidated_message_id) return { ran: false, reason: 'unchanged' }
  const mark = () => db.prepare('UPDATE conversations SET consolidated_message_id = ? WHERE id = ?').run(last.id, conversationId)
  const kept = listConversationMemories(conversationId).filter((memory) => !memory.promotedMemoryId)
  // Nothing was kept from this conversation, so there is nothing to weigh and no reason to spend a model call.
  if (!kept.length) {
    mark()
    return { ran: false, reason: 'nothing' }
  }
  const interfaceLocale = normalizeUiLocale(requestedLocale, current.ui.locale)
  const setup = normalizeConversationSetup(safeJson(conversation.setup_json, null))
  const now = new Date()
  const memories = activeMemories(now.toISOString()).slice(0, 80)
  const result = await consolidateMemories({
    scene: setup ? [setup.title, setup.setting, setup.partnerRole].filter(Boolean).join(' · ') : '',
    conversationMemories: kept.slice(0, 30).map((memory) => ({ id: memory.id, value: memory.value, quote: memory.quote, about: memory.about, durability: memory.durability })),
    saidElsewhere: rows<{ conversation: string; value: string; about: string }>(`SELECT c.title AS conversation, k.value AS value, k.about AS about
      FROM conversation_memories k JOIN conversations c ON c.id = k.conversation_id
      WHERE k.conversation_id <> ? ORDER BY k.updated_at DESC LIMIT 30`, conversationId),
    memories: memories.map((memory) => ({ id: memory.id, layer: layerOf(memory.memoryType), value: memory.value, validTo: memory.validTo || '' })),
    interfaceLocale,
  })
  let suggestions = 0
  transaction(() => {
    for (const item of result.promotions) {
      if (addSuggestion({
        kind: 'promote', conversationMemoryId: item.conversationMemoryId, conversationId, value: item.value, note: item.note,
        payload: { memoryType: item.memoryType, durability: item.durability, validDays: item.validDays }, interfaceLocale,
      })) suggestions += 1
    }
    for (const item of result.conflicts) {
      if (addSuggestion({
        kind: 'conflict', memoryId: item.memoryId, conversationMemoryId: item.conversationMemoryId, conversationId,
        value: item.value, note: item.note, interfaceLocale,
      })) suggestions += 1
    }
    for (const item of result.stale) {
      if (addSuggestion({ kind: 'stale', memoryId: item.memoryId, conversationId, note: item.note, interfaceLocale })) suggestions += 1
    }
    mark()
  })
  return { ran: true, suggestions }
}

export function registerMemoryRoutes(app: FastifyInstance) {
  app.get('/api/memories', async () => memoriesForPage(storedMemories()))

  app.post<{ Body: {
    category?: string; key: string; value: string; confidence?: number; sensitive?: boolean; status?: string
    sourceConversationId?: string; sourceMessageId?: string; tier?: 'core' | 'long_term'; memoryType?: string; topic?: string; importance?: number
    interfaceLocale?: string; semanticSlot?: string; validTo?: string | null; durability?: MemoryDurability; validDays?: number
    targetLanguageCode?: string; quote?: string; frame?: MemoryFrame
  } }>('/api/memories', async (request) => {
    const body = request.body
    const current = await getConfig()
    const saved = saveLongTermMemory({
      ...body,
      validTo: typeof body.validTo === 'string' && body.validTo ? body.validTo : body.validTo === null ? null : undefined,
      frame: body.frame === 'scene' || body.frame === 'direct' ? body.frame : undefined,
      interfaceLocale: normalizeUiLocale(body.interfaceLocale, current.ui.locale),
    })
    return { id: saved.id, action: saved.action, category: saved.category }
  })

  app.post<{ Body: { interfaceLocale?: string } }>('/api/memories/localize', async (request) => {
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
    const stored = storedMemories()
    await ensureMemoryLocalizations(stored, interfaceLocale)
    return memoriesForPage(stored.map((memory) => memoryForInterface(memory, interfaceLocale)))
  })

  app.get('/api/memories/export', async () => {
    const current = await getConfig()
    return {
      format: 'yujian-memories',
      version: 1,
      exportedAt: new Date().toISOString(),
      memories: memoriesForPage(storedMemories()).map((memory) => ({
        layer: memory.category, kind: memory.memoryType, key: memory.key, value: memory.value, core: memory.tier === 'core',
        sensitive: memory.sensitive, validTo: memory.validTo, expired: memory.expired, language: memory.targetLanguageCode,
        topic: memory.topic, interfaceLocale: memory.interfaceLocale,
        createdAt: memory.createdAt, updatedAt: memory.updatedAt, sources: memory.sources,
      })),
      conversationMemories: rows(`SELECT c.id AS conversationId, c.title AS conversation, k.key AS key, k.value AS value, k.quote AS quote,
        k.about AS about, k.created_at AS createdAt FROM conversation_memories k JOIN conversations c ON c.id = k.conversation_id
        ORDER BY c.updated_at DESC, k.created_at`),
      learning: learningStatus({ code: current.learning.targetLanguageCode, name: current.learning.targetLanguage }),
    }
  })

  // Memories written out by the export above, taken into this learner's memory. Notes kept inside
  // one conversation and the learning record stay behind: they belong to conversations and
  // corrections that are not here.
  app.post<{ Body: { format?: string; memories?: unknown; interfaceLocale?: string } }>('/api/memories/import', async (request) => {
    const body = request.body || {}
    if (body.format !== 'yujian-memories' || !Array.isArray(body.memories) || body.memories.length > MAX_IMPORTED_MEMORIES) {
      throw Object.assign(new Error('This is not a memory export from this app.'), { statusCode: 400, code: 'MEMORY_IMPORT_INVALID' })
    }
    const current = await getConfig()
    const fallbackLocale = normalizeUiLocale(body.interfaceLocale, current.ui.locale)
    const result = { added: 0, updated: 0, skipped: 0 }
    for (const item of body.memories) {
      const memory = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const key = typeof memory.key === 'string' ? memory.key.trim().slice(0, 200) : ''
      const value = typeof memory.value === 'string' ? memory.value.trim().slice(0, 2000) : ''
      if (!key || !value || !isMemoryKind(memory.kind)) { result.skipped += 1; continue }
      const input = {
        key, value,
        memoryType: memory.kind,
        sensitive: memory.sensitive === true,
        // Null keeps a memory for good, which is what the export writes for one without an end.
        validTo: typeof memory.validTo === 'string' && !Number.isNaN(Date.parse(memory.validTo)) ? memory.validTo : null,
        targetLanguageCode: typeof memory.language === 'string' ? memory.language.slice(0, 12) : '',
        topic: typeof memory.topic === 'string' ? memory.topic : undefined,
        interfaceLocale: normalizeUiLocale(memory.interfaceLocale, fallbackLocale),
        status: 'confirmed',
      }
      let saved
      try {
        saved = saveLongTermMemory({ ...input, tier: memory.core === true ? 'core' : 'long_term' })
      } catch (error) {
        // Core memory is full here: the memory comes in all the same, one layer down.
        if ((error as { code?: string })?.code !== 'CORE_MEMORY_LIMIT') throw error
        saved = saveLongTermMemory({ ...input, tier: 'long_term' })
      }
      if (saved.action === 'create') result.added += 1
      else result.updated += 1
    }
    return result
  })

  app.put<{ Params: { id: string }; Body: { value: string; status?: string; interfaceLocale?: string } }>('/api/memories/:id', async (request) => {
    const existing = row<Record<string, any>>('SELECT * FROM memories WHERE id = ?', request.params.id)
    if (!existing) throw notFound('Memory not found')
    const value = request.body.value?.trim()
    if (!value) throw Object.assign(new Error('Memory value is required.'), { statusCode: 400 })
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(request.body.interfaceLocale, current.ui.locale)
    transaction(() => {
      addMemoryRevision(existing.id, existing.value, value, 'edit', existing.source_conversation_id, existing.source_message_id)
      db.prepare("UPDATE memories SET value = ?, interface_locale = ?, localized_values_json = '{}', status = COALESCE(?, status), updated_at = ? WHERE id = ?")
        .run(value, interfaceLocale, request.body.status || null, new Date().toISOString(), request.params.id)
    })
    return { ok: true }
  })

  app.patch<{ Params: { id: string }; Body: { tier: 'core' | 'long_term' } }>('/api/memories/:id/tier', async (request) => {
    const existing = row<Record<string, any>>('SELECT * FROM memories WHERE id = ?', request.params.id)
    if (!existing) throw notFound('Memory not found')
    if (!['core', 'long_term'].includes(request.body.tier)) throw Object.assign(new Error('Invalid memory tier'), { statusCode: 400 })
    if (request.body.tier === 'core') {
      if (!MEMORY_KIND_RULES[memoryKindOf(existing.memory_type)].core) {
        throw Object.assign(new Error('This kind of memory cannot be core.'), { statusCode: 409, code: 'MEMORY_CANNOT_BE_CORE' })
      }
      assertCoreMemoryAvailable(existing)
    }
    if (existing.tier === request.body.tier) return { ok: true }
    transaction(() => {
      addMemoryRevision(existing.id, existing.value, existing.value, request.body.tier === 'core' ? 'promote' : 'demote', existing.source_conversation_id, existing.source_message_id)
      db.prepare('UPDATE memories SET tier = ?, pinned = ?, updated_at = ? WHERE id = ?')
        .run(request.body.tier, request.body.tier === 'core' ? 1 : 0, new Date().toISOString(), request.params.id)
    })
    return { ok: true }
  })

  /** Keeps a memory that has run out, or is about to, for a while longer. */
  app.post<{ Params: { id: string }; Body: { days?: number } }>('/api/memories/:id/renew', async (request) => {
    const existing = row<Record<string, any>>('SELECT * FROM memories WHERE id = ?', request.params.id)
    if (!existing) throw notFound('Memory not found')
    const requested = Number(request.body?.days)
    const days = Number.isFinite(requested) && requested > 0
      ? Math.min(730, Math.round(requested))
      : MEMORY_KIND_RULES[memoryKindOf(existing.memory_type)].defaultDays || 30
    const validTo = new Date(Date.now() + days * DAY).toISOString()
    transaction(() => {
      addMemoryRevision(existing.id, existing.value, existing.value, 'renew', existing.source_conversation_id, existing.source_message_id)
      db.prepare('UPDATE memories SET valid_to = ?, updated_at = ? WHERE id = ?').run(validTo, new Date().toISOString(), existing.id)
    })
    return { ok: true, validTo }
  })

  app.delete<{ Params: { id: string } }>('/api/memories/:id', async (request) => {
    const result = db.prepare('DELETE FROM memories WHERE id = ?').run(request.params.id)
    if (!result.changes) throw notFound('Memory not found')
    return { ok: true }
  })

  // --- what only the learner can settle

  app.get('/api/memory-suggestions', async () => openSuggestions())

  app.post<{ Params: { id: string }; Body: { action: 'accept' | 'dismiss' | 'toConversation' | 'delete'; interfaceLocale?: string } }>('/api/memory-suggestions/:id/resolve', async (request) => {
    const suggestion = suggestionById(request.params.id)
    if (!suggestion || suggestion.status !== 'open') throw notFound('Suggestion not found')
    const action = request.body?.action
    if (!['accept', 'dismiss', 'toConversation', 'delete'].includes(action)) throw Object.assign(new Error('Invalid action'), { statusCode: 400 })
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(suggestion.interfaceLocale || request.body.interfaceLocale, current.ui.locale)
    const memory = suggestion.memoryId ? row<Record<string, any>>('SELECT * FROM memories WHERE id = ?', suggestion.memoryId) : undefined
    const said = suggestion.conversationMemoryId
      ? row<Record<string, any>>('SELECT * FROM conversation_memories WHERE id = ?', suggestion.conversationMemoryId)
      : undefined
    transaction(() => {
      if (action === 'delete' || (action === 'accept' && suggestion.kind === 'stale')) {
        if (memory) db.prepare('DELETE FROM memories WHERE id = ?').run(memory.id)
      } else if (action === 'toConversation' && memory) {
        // A memory that came out of a scene goes back to that scene's conversation, if it still exists.
        const home = suggestion.conversationId ? row<{ id: string }>('SELECT id FROM conversations WHERE id = ?', suggestion.conversationId) : undefined
        if (home) {
          keepInConversation({
            conversationId: home.id, key: memory.key, semanticSlot: memorySemanticSlot(memory), value: memory.value, quote: '',
            about: 'persona', durability: 'momentary', memoryType: memoryKindOf(memory.memory_type), topic: memory.topic,
            sensitive: Boolean(memory.sensitive), interfaceLocale: memory.interface_locale || interfaceLocale, sourceMessageId: memory.source_message_id,
          })
        }
        db.prepare('DELETE FROM memories WHERE id = ?').run(memory.id)
      } else if (action === 'accept' && suggestion.kind === 'promote' && said) {
        const payload = safeJson<Record<string, any>>(suggestion.payloadJson, {})
        const conversation = row<Record<string, any>>('SELECT target_language_code FROM conversations WHERE id = ?', said.conversation_id)
        const durability: MemoryDurability = payload.durability === 'temporary' ? 'temporary' : 'lasting'
        saveLongTermMemory({
          key: said.key,
          value: suggestion.value || said.value,
          memoryType: settleMemoryKind(isMemoryKind(payload.memoryType) ? payload.memoryType : memoryKindOf(said.memory_type), durability),
          semanticSlot: said.semantic_slot,
          durability,
          validDays: Number(payload.validDays) || undefined,
          sensitive: Boolean(said.sensitive),
          topic: said.topic,
          sourceConversationId: said.conversation_id,
          sourceMessageId: said.source_message_id,
          quote: said.quote,
          targetLanguageCode: conversation?.target_language_code || current.learning.targetLanguageCode,
          interfaceLocale,
        })
      } else if (action === 'accept' && suggestion.kind === 'conflict' && memory && suggestion.value) {
        addMemoryRevision(memory.id, memory.value, suggestion.value, 'update', suggestion.conversationId, said?.source_message_id)
        db.prepare("UPDATE memories SET value = ?, interface_locale = ?, localized_values_json = '{}', updated_at = ? WHERE id = ?")
          .run(suggestion.value, interfaceLocale, new Date().toISOString(), memory.id)
        addMemorySource(memory.id, { conversationId: suggestion.conversationId, messageId: said?.source_message_id, quote: said?.quote })
      }
      resolveSuggestion(suggestion.id, action === 'dismiss' ? 'dismissed' : 'accepted')
    })
    return { ok: true }
  })

  // --- the learning record

  app.get('/api/learning-status', async () => {
    const current = await getConfig()
    return learningStatus({ code: current.learning.targetLanguageCode, name: current.learning.targetLanguage })
  })

  app.delete<{ Params: { language: string; category: string } }>('/api/learning-status/:language/errors/:category', async (request) => {
    forgetLearning(request.params.language, 'error', request.params.category)
    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/api/learning-events/:id', async (request) => {
    if (!forgetLearningEvent(request.params.id)) throw notFound('Record not found')
    return { ok: true }
  })

  // --- what one conversation remembers

  app.get<{ Params: { id: string } }>('/api/conversations/:id/memories', async (request) => {
    conversationRow(request.params.id)
    return listConversationMemories(request.params.id)
  })

  app.delete<{ Params: { id: string; memoryId: string } }>('/api/conversations/:id/memories/:memoryId', async (request) => {
    if (!deleteConversationMemory(request.params.id, request.params.memoryId)) throw notFound('Memory not found')
    return { ok: true }
  })

  /** The learner asks for something this conversation remembers to be kept for good. */
  app.post<{ Params: { id: string; memoryId: string }; Body: { interfaceLocale?: string } }>('/api/conversations/:id/memories/:memoryId/promote', async (request) => {
    const conversation = conversationRow(request.params.id)
    const said = listConversationMemories(request.params.id).find((memory) => memory.id === request.params.memoryId)
    if (!said) throw notFound('Memory not found')
    const current = await getConfig()
    const durability: MemoryDurability = said.durability === 'temporary' || said.memoryType === 'plan' ? 'temporary' : 'lasting'
    const kind: MemoryKind = settleMemoryKind(said.memoryType, durability)
    const saved = saveLongTermMemory({
      key: said.key,
      value: said.value,
      memoryType: kind,
      semanticSlot: said.semanticSlot,
      durability,
      sensitive: said.sensitive,
      topic: said.topic,
      sourceConversationId: said.conversationId,
      sourceMessageId: said.sourceMessageId,
      quote: said.quote,
      targetLanguageCode: conversation.target_language_code || current.learning.targetLanguageCode,
      interfaceLocale: said.interfaceLocale || normalizeUiLocale(request.body?.interfaceLocale, current.ui.locale),
    })
    return { id: saved.id, action: saved.action, category: saved.category }
  })

  /** "Only in this conversation": the offer to keep something for good is withdrawn; the conversation still has it. */
  app.post<{ Params: { id: string }; Body: { semanticSlot?: string; key?: string } }>('/api/conversations/:id/memory-candidates/dismiss', async (request) => {
    conversationRow(request.params.id)
    const slot = normalizeMemorySemanticSlot(request.body?.semanticSlot)
    const key = typeof request.body?.key === 'string' ? request.body.key : ''
    if (!slot && !key) throw Object.assign(new Error('A candidate is required.'), { statusCode: 400 })
    const messages = rows<{ id: string; metaJson: string | null }>("SELECT id, meta_json AS metaJson FROM messages WHERE conversation_id = ? AND role = 'assistant'", request.params.id)
    transaction(() => {
      for (const message of messages) {
        const meta = safeJson<Record<string, any>>(message.metaJson, {})
        const candidates = Array.isArray(meta.memoryCandidates) ? meta.memoryCandidates : []
        const kept = candidates.filter((candidate: Record<string, any>) => slot
          ? normalizeMemorySemanticSlot(candidate?.semanticSlot) !== slot
          : candidate?.key !== key)
        if (kept.length === candidates.length) continue
        meta.memoryCandidates = kept
        delete meta.feedbackLocalizations
        db.prepare('UPDATE messages SET meta_json = ? WHERE id = ?').run(JSON.stringify(meta), message.id)
      }
    })
    return { ok: true }
  })

  /** Tidies up after a conversation. Does nothing unless the learner has switched it on. */
  app.post<{ Params: { id: string }; Body: { interfaceLocale?: string } }>('/api/conversations/:id/consolidate', async (request) => {
    const id = request.params.id
    const running = consolidating().get(id)
    if (running) return running
    const task = consolidateConversation(id, request.body?.interfaceLocale)
    consolidating().set(id, task)
    try { return await task }
    finally { if (consolidating().get(id) === task) consolidating().delete(id) }
  })
}
