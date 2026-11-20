import { nanoid } from 'nanoid'
import { db, row, rows } from './database.js'
import { memorySemanticSlot, normalizeMemorySemanticSlot } from '../memory-candidates.js'
import { localizedMemoryForInterface } from '../memory-localization.js'
import { layerOf, memoryExpired, memoryKindOf, memoryValidTo, scopedSemanticSlot } from '../memory-policy.js'
import {
  CONVERSATION_MEMORY_LIMIT, CORE_MEMORY_LIMIT, MEMORY_KIND_RULES, isErrorCategory, isMemoryKind,
  type MemoryAbout, type MemoryDurability, type MemoryFrame, type MemoryKind, type MemoryLayer,
} from '../../shared/memory.js'
import type { CoachingResponse } from '../types.js'
import { countsAsError } from '../../shared/variants.js'

/** A scene is known by the title of its setup; the conversation's own title is the fallback. */
const SCENE_TITLE = "COALESCE(NULLIF(CASE WHEN json_valid(setup_json) THEN json_extract(setup_json, '$.title') END, ''), title)"

let transactionDepth = 0

/** Runs `work` as one transaction. Calls made while one is already open join it. */
export function transaction<T>(work: () => T): T {
  if (transactionDepth > 0) return work()
  db.exec('BEGIN IMMEDIATE')
  transactionDepth += 1
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    transactionDepth -= 1
  }
}

function cleanTopic(value: unknown) {
  const topic = typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
  return topic.slice(0, 40) || 'general'
}

// ---------------------------------------------------------------------------
// Long-term memories

const MEMORY_COLUMNS = `id, category, key, semantic_slot AS semanticSlot, value, tier,
  interface_locale AS interfaceLocale, localized_values_json AS localizedValuesJson, memory_type AS memoryType, topic, importance, pinned, confidence, sensitive, status,
  source_conversation_id AS sourceConversationId, source_message_id AS sourceMessageId,
  supersedes_id AS supersedesId, valid_from AS validFrom, valid_to AS validTo, target_language_code AS targetLanguageCode,
  last_used_at AS lastUsedAt, use_count AS useCount, last_mentioned_at AS lastMentionedAt,
  mention_count AS mentionCount, created_at AS createdAt, updated_at AS updatedAt`

const MEMORY_ORDER = "ORDER BY CASE WHEN tier = 'core' THEN 0 ELSE 1 END, pinned DESC, importance DESC, updated_at DESC"

/** Every stored memory, expired ones included. */
export function storedMemories() {
  return rows<Record<string, any>>(`SELECT ${MEMORY_COLUMNS} FROM memories ${MEMORY_ORDER}`)
}

/** The confirmed memories that still hold. Scope is applied by the caller. */
export function activeMemories(now: string) {
  return rows<Record<string, any>>(`SELECT ${MEMORY_COLUMNS} FROM memories
    WHERE status = 'confirmed' AND (valid_to IS NULL OR valid_to > ?) ${MEMORY_ORDER}`, now)
}

export function memoryForInterface(memory: Record<string, any>, interfaceLocale: string): Record<string, any> {
  const localized = localizedMemoryForInterface(memory, interfaceLocale)
  return { ...localized, semanticSlot: memorySemanticSlot(localized) }
}

export interface MemorySource {
  conversationId: string | null
  messageId: string | null
  frame: string
  sceneTitle: string
  quote: string
  createdAt: string
  /** False once the conversation it came from has been deleted. */
  conversationExists: boolean
}

function sourcesByMemory() {
  const grouped = new Map<string, MemorySource[]>()
  const all = rows<Record<string, any>>(`SELECT s.memory_id AS memoryId, s.conversation_id AS conversationId, s.message_id AS messageId,
    s.frame AS frame, s.scene_title AS sceneTitle, s.quote AS quote, s.created_at AS createdAt, c.id AS liveConversationId
    FROM memory_sources s LEFT JOIN conversations c ON c.id = s.conversation_id ORDER BY s.created_at`)
  for (const source of all) {
    const list = grouped.get(source.memoryId) || []
    list.push({
      conversationId: source.conversationId,
      messageId: source.messageId,
      frame: source.frame,
      sceneTitle: source.sceneTitle,
      quote: source.quote,
      createdAt: source.createdAt,
      conversationExists: Boolean(source.liveConversationId),
    })
    grouped.set(source.memoryId, list)
  }
  return grouped
}

/** What the memory page shows: each memory with its layer, whether it has run out, and where it came from. */
export function memoriesForPage(memories: Array<Record<string, any>>, now = new Date()): Array<Record<string, any>> {
  const sources = sourcesByMemory()
  return memories.map((memory) => ({
    ...memory,
    category: layerOf(memory.memoryType),
    semanticSlot: memorySemanticSlot(memory),
    pinned: Boolean(memory.pinned),
    sensitive: Boolean(memory.sensitive),
    expired: memoryExpired(memory.validTo, now),
    canBeCore: MEMORY_KIND_RULES[memoryKindOf(memory.memoryType)].core,
    sources: sources.get(memory.id) || [],
  }))
}

export function assertCoreMemoryAvailable(existing?: Record<string, any>) {
  if (existing?.tier === 'core') return
  const count = row<{ count: number }>("SELECT COUNT(*) AS count FROM memories WHERE tier = 'core' AND status = 'confirmed'")?.count || 0
  if (count >= CORE_MEMORY_LIMIT) {
    throw Object.assign(new Error(`Core memory is limited to ${CORE_MEMORY_LIMIT} items. Demote one first.`), { statusCode: 409, code: 'CORE_MEMORY_LIMIT' })
  }
}

export function addMemoryRevision(memoryId: string, previousValue: string | null, nextValue: string | null, changeType: string, sourceConversationId?: string | null, sourceMessageId?: string | null) {
  db.prepare(`INSERT INTO memory_revisions
    (id, memory_id, previous_value, next_value, change_type, source_conversation_id, source_message_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    nanoid(), memoryId, previousValue, nextValue, changeType, sourceConversationId || null, sourceMessageId || null, new Date().toISOString(),
  )
}

/** Records one more place a memory came from. A memory confirmed again from another message keeps both. */
export function addMemorySource(memoryId: string, source: { conversationId?: string | null; messageId?: string | null; frame?: string; quote?: string }) {
  if (!source.conversationId && !source.messageId) return
  if (source.messageId && row('SELECT 1 FROM memory_sources WHERE memory_id = ? AND message_id = ?', memoryId, source.messageId)) return
  const conversation = source.conversationId
    ? row<{ title: string; setupJson: string | null }>(`SELECT ${SCENE_TITLE} AS title, setup_json AS setupJson FROM conversations WHERE id = ?`, source.conversationId)
    : undefined
  const scene = Boolean(conversation?.setupJson && conversation.setupJson.trim() && conversation.setupJson.trim() !== 'null')
  const frame = source.frame || (conversation ? (scene ? 'scene' : 'direct') : '')
  db.prepare(`INSERT INTO memory_sources (id, memory_id, conversation_id, message_id, frame, scene_title, quote, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    nanoid(), memoryId, source.conversationId || null, source.messageId || null, frame,
    frame === 'scene' ? conversation?.title || '' : '', (source.quote || '').slice(0, 300), new Date().toISOString(),
  )
}

export interface SaveMemoryInput {
  key: string
  value: string
  /** The kind decides the layer. `category` is only read when no kind is given. */
  memoryType?: string
  category?: string
  semanticSlot?: string
  confidence?: number
  sensitive?: boolean
  status?: string
  sourceConversationId?: string | null
  sourceMessageId?: string | null
  tier?: 'core' | 'long_term'
  topic?: string
  importance?: number
  interfaceLocale: string
  /** When it stops being used. Null keeps it for good; left out, the kind's own rule applies. */
  validTo?: string | null
  durability?: MemoryDurability
  validDays?: number
  targetLanguageCode?: string
  quote?: string
  frame?: MemoryFrame
}

function kindForSave(input: SaveMemoryInput, existing?: Record<string, any>): MemoryKind {
  if (isMemoryKind(input.memoryType)) return input.memoryType
  if (existing?.memory_type) return memoryKindOf(existing.memory_type)
  if (input.category === 'learning') return 'learning'
  if (input.category === 'plan') return 'plan'
  return 'profile'
}

/** Stores a long-term memory, or updates the one that already says the same kind of thing. */
export function saveLongTermMemory(input: SaveMemoryInput) {
  const key = input.key?.trim()
  const value = input.value?.trim()
  if (!key || !value) throw Object.assign(new Error('Memory key and value are required.'), { statusCode: 400 })
  const requestedSlot = normalizeMemorySemanticSlot(input.semanticSlot)
  const everything = rows<Record<string, any>>('SELECT * FROM memories')
  const hintedKind = kindForSave(input)
  const languageHint = input.targetLanguageCode || ''
  const scopedRequest = scopedSemanticSlot(requestedSlot, hintedKind, languageHint)
  let existing = scopedRequest ? everything.find((memory) => memorySemanticSlot(memory) === scopedRequest) : undefined
  if (!existing) existing = everything.find((memory) => memory.key === key && layerOf(memory.memory_type) === layerOf(hintedKind))
  const kind = kindForSave(input, existing)
  const rule = MEMORY_KIND_RULES[kind]
  const category = layerOf(kind)
  const targetLanguageCode = rule.perLanguage ? (input.targetLanguageCode || existing?.target_language_code || '') : ''
  const semanticSlot = scopedSemanticSlot(requestedSlot, kind, targetLanguageCode) ||
    normalizeMemorySemanticSlot(existing?.semantic_slot) ||
    scopedSemanticSlot(memorySemanticSlot({ category, key }), kind, targetLanguageCode)
  const sensitive = input.sensitive === undefined ? Boolean(existing?.sensitive) : Boolean(input.sensitive)
  const requestedTier = input.tier || existing?.tier || 'long_term'
  const tier = requestedTier === 'core' && rule.core ? 'core' : 'long_term'
  if (tier === 'core') assertCoreMemoryAvailable(existing)
  const importance = Math.max(0, Math.min(1, Number(input.importance ?? existing?.importance ?? 0.5)))
  const confidence = Number.isFinite(input.confidence) ? input.confidence! : existing?.confidence ?? 1
  const topic = cleanTopic(input.topic ?? existing?.topic)
  const sourceConversationId = input.sourceConversationId ?? existing?.source_conversation_id ?? null
  const sourceMessageId = input.sourceMessageId ?? existing?.source_message_id ?? null
  const status = input.status || existing?.status || 'confirmed'
  const now = new Date()
  const stamp = now.toISOString()
  const validTo = input.validTo !== undefined
    ? input.validTo
    : memoryValidTo(kind, input.durability || (rule.defaultDays ? 'temporary' : 'lasting'), input.validDays, now) ?? null
  const id = existing?.id || nanoid()
  transaction(() => {
    if (existing) {
      addMemoryRevision(id, existing.value, value, existing.value === value ? 'metadata' : 'update', sourceConversationId, sourceMessageId)
      db.prepare(`UPDATE OR IGNORE memories SET category = ? WHERE id = ?`).run(category, id)
      db.prepare(`UPDATE memories SET value = ?, semantic_slot = ?, interface_locale = ?, localized_values_json = '{}', tier = ?, memory_type = ?, topic = ?, importance = ?, pinned = ?, confidence = ?, sensitive = ?,
        status = ?, source_conversation_id = ?, source_message_id = ?, valid_to = ?, target_language_code = ?, updated_at = ? WHERE id = ?`).run(
        value, semanticSlot, input.interfaceLocale, tier, kind, topic, importance, tier === 'core' ? existing.pinned : 0, confidence, sensitive ? 1 : 0,
        status, sourceConversationId, sourceMessageId, validTo, targetLanguageCode, stamp, id,
      )
    } else {
      db.prepare(`INSERT INTO memories
        (id, category, key, semantic_slot, value, interface_locale, localized_values_json, tier, memory_type, topic, importance, pinned, confidence, sensitive, status,
          source_conversation_id, source_message_id, valid_from, valid_to, target_language_code, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, category, key, semanticSlot, value, input.interfaceLocale, tier, kind, topic, importance, confidence,
        sensitive ? 1 : 0, status, sourceConversationId, sourceMessageId, stamp, validTo, targetLanguageCode, stamp, stamp,
      )
      addMemoryRevision(id, null, value, 'create', sourceConversationId, sourceMessageId)
    }
    addMemorySource(id, { conversationId: input.sourceConversationId, messageId: input.sourceMessageId, frame: input.frame, quote: input.quote })
    if (input.sourceConversationId) {
      db.prepare('UPDATE conversation_memories SET promoted_memory_id = ? WHERE conversation_id = ? AND semantic_slot = ?')
        .run(id, input.sourceConversationId, requestedSlot || semanticSlot)
    }
  })
  return { id, action: existing ? 'update' as const : 'create' as const, category, validTo }
}

// ---------------------------------------------------------------------------
// Conversation memories: what was said in one conversation and stays with it

export interface ConversationMemory {
  id: string
  conversationId: string
  key: string
  semanticSlot: string
  value: string
  quote: string
  about: MemoryAbout
  durability: MemoryDurability
  memoryType: MemoryKind
  topic: string
  sensitive: boolean
  interfaceLocale: string
  sourceMessageId: string | null
  promotedMemoryId: string | null
  createdAt: string
  updatedAt: string
}

export function listConversationMemories(conversationId: string): ConversationMemory[] {
  return rows<Record<string, any>>(`SELECT id, conversation_id AS conversationId, key, semantic_slot AS semanticSlot, value, quote, about, durability,
    memory_type AS memoryType, topic, sensitive, interface_locale AS interfaceLocale, source_message_id AS sourceMessageId,
    (SELECT m.id FROM memories m WHERE m.id = conversation_memories.promoted_memory_id) AS promotedMemoryId,
    created_at AS createdAt, updated_at AS updatedAt
    FROM conversation_memories WHERE conversation_id = ? ORDER BY updated_at DESC, created_at DESC`, conversationId).map((memory) => ({
    ...memory,
    about: memory.about === 'user' ? 'user' : 'persona',
    durability: ['lasting', 'temporary', 'momentary'].includes(memory.durability) ? memory.durability : 'momentary',
    memoryType: memoryKindOf(memory.memoryType),
    sensitive: Boolean(memory.sensitive),
  })) as ConversationMemory[]
}

/** Keeps a statement with its conversation. Saying the same kind of thing again replaces the earlier one. */
export function keepInConversation(input: {
  conversationId: string
  key: string
  semanticSlot: string
  value: string
  quote: string
  about: MemoryAbout
  durability: MemoryDurability
  memoryType: MemoryKind
  topic?: string
  sensitive?: boolean
  interfaceLocale: string
  sourceMessageId?: string | null
}) {
  const now = new Date().toISOString()
  const slot = normalizeMemorySemanticSlot(input.semanticSlot) || normalizeMemorySemanticSlot(`said:${input.key}`)
  const existing = row<{ id: string }>('SELECT id FROM conversation_memories WHERE conversation_id = ? AND semantic_slot = ?', input.conversationId, slot)
  const id = existing?.id || nanoid()
  if (existing) {
    db.prepare(`UPDATE conversation_memories SET key = ?, value = ?, quote = ?, about = ?, durability = ?, memory_type = ?, topic = ?, sensitive = ?,
      interface_locale = ?, source_message_id = ?, updated_at = ? WHERE id = ?`).run(
      input.key, input.value, input.quote, input.about === 'user' ? 'user' : 'persona', input.durability, input.memoryType, cleanTopic(input.topic),
      input.sensitive ? 1 : 0, input.interfaceLocale, input.sourceMessageId || null, now, id,
    )
  } else {
    db.prepare(`INSERT INTO conversation_memories
      (id, conversation_id, key, semantic_slot, value, quote, about, durability, memory_type, topic, sensitive, interface_locale, source_message_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, input.conversationId, input.key, slot, input.value, input.quote, input.about === 'user' ? 'user' : 'persona', input.durability, input.memoryType,
      cleanTopic(input.topic), input.sensitive ? 1 : 0, input.interfaceLocale, input.sourceMessageId || null, now, now,
    )
    db.prepare(`DELETE FROM conversation_memories WHERE conversation_id = ? AND id NOT IN (
      SELECT id FROM conversation_memories WHERE conversation_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT ?
    )`).run(input.conversationId, input.conversationId, CONVERSATION_MEMORY_LIMIT)
  }
  return id
}

export function deleteConversationMemory(conversationId: string, id: string) {
  return Boolean(db.prepare('DELETE FROM conversation_memories WHERE conversation_id = ? AND id = ?').run(conversationId, id).changes)
}

// ---------------------------------------------------------------------------
// The learning record: built from corrections, never asked about one by one

const DAY = 24 * 60 * 60 * 1000
/** Mistakes older than this no longer count as something the learner keeps doing. */
const FOCUS_WINDOW_DAYS = 45
/** This many messages without a kind of mistake, and it is treated as dealt with. */
const QUIET_AFTER_TURNS = 25

export function recordLearningEvents(input: {
  targetLanguageCode: string
  conversationId: string
  messageId: string
  corrections: CoachingResponse['corrections']
  reconstruction: CoachingResponse['reconstruction']
  at: string
}) {
  db.prepare('DELETE FROM learning_events WHERE message_id = ?').run(input.messageId)
  const insert = db.prepare(`INSERT INTO learning_events
    (id, target_language_code, kind, category, severity, original, improved, conversation_id, message_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  for (const correction of input.corrections) {
    if (!correction.original || !correction.improved || !countsAsError(correction)) continue
    insert.run(nanoid(), input.targetLanguageCode, 'error', isErrorCategory(correction.category) ? correction.category : 'other', correction.severity,
      correction.original.slice(0, 300), correction.improved.slice(0, 300), input.conversationId, input.messageId, input.at)
  }
  // A message that had to be put into the target language for the learner is something they wanted to say and could not yet.
  const rewrite = input.reconstruction
  if (rewrite && (rewrite.type === 'translation' || rewrite.type === 'completion') && rewrite.original && rewrite.improved) {
    insert.run(nanoid(), input.targetLanguageCode, 'gap', 'gap', '', rewrite.original.slice(0, 300), rewrite.improved.slice(0, 300), input.conversationId, input.messageId, input.at)
  }
}

function turnsSince(targetLanguageCode: string, currentLanguageCode: string, since: string) {
  return row<{ count: number }>(`SELECT COUNT(*) AS count FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE m.role = 'user' AND m.status = 'complete' AND m.created_at > ?
      AND (c.target_language_code = ? OR (c.target_language_code = '' AND ? = ?))`, since, targetLanguageCode, targetLanguageCode, currentLanguageCode)?.count || 0
}

interface ErrorSummary {
  category: string
  count: number
  recentCount: number
  lastAt: string
  /** True when the learner has written a good deal since without making it again. */
  quiet: boolean
  /** The learner asked for this kind of mistake to be kept in view. */
  noted: boolean
  /** Practice answers on this kind of mistake lately. */
  practice: { right: number; wrong: number }
  /** Those given since the mistake was last made: only they change how much it weighs. */
  practiceSince: { right: number; wrong: number }
  examples: Array<{ original: string; improved: string }>
}

function errorSummaries(targetLanguageCode: string, currentLanguageCode: string, now: Date): ErrorSummary[] {
  const windowStart = new Date(now.getTime() - FOCUS_WINDOW_DAYS * DAY).toISOString()
  const grouped = rows<{ category: string; count: number; recentCount: number; lastAt: string }>(`SELECT category, COUNT(*) AS count,
    SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS recentCount, MAX(created_at) AS lastAt
    FROM learning_events WHERE target_language_code = ? AND kind = 'error' GROUP BY category
    ORDER BY recentCount DESC, count DESC, lastAt DESC`, windowStart, targetLanguageCode)
  const answers = rows<{ category: string; severity: string; at: string }>(`SELECT category, severity, created_at AS at FROM learning_events
    WHERE target_language_code = ? AND kind = 'practice' AND created_at >= ?`, targetLanguageCode, windowStart)
  const practised = (category: string, since = '') => {
    const given = answers.filter((item) => item.category === category && item.at > since)
    return { right: given.filter((item) => item.severity === 'right').length, wrong: given.filter((item) => item.severity === 'wrong').length }
  }
  const noted = new Set(rows<{ category: string }>("SELECT DISTINCT category FROM learning_events WHERE target_language_code = ? AND kind = 'focus'", targetLanguageCode)
    .map((item) => item.category))
  return grouped.map((item) => ({
    ...item,
    noted: noted.has(item.category),
    practice: practised(item.category),
    practiceSince: practised(item.category, item.lastAt),
    quiet: item.count >= 2 && turnsSince(targetLanguageCode, currentLanguageCode, item.lastAt) >= QUIET_AFTER_TURNS,
    examples: rows<{ original: string; improved: string }>(`SELECT original, improved FROM learning_events
      WHERE target_language_code = ? AND kind = 'error' AND category = ? ORDER BY created_at DESC LIMIT 3`, targetLanguageCode, item.category),
  }))
}

/**
 * How much a kind of mistake still weighs: how often it was made lately, and half a mistake less for each
 * practice answer that was right since, half more for each that was wrong. Making it again wipes that credit.
 */
function focusWeight(item: ErrorSummary) {
  return Math.max(0, item.recentCount + (item.practiceSince.wrong - item.practiceSince.right) / 2)
}

/**
 * The kinds of mistake worth pointing out again: made more than once lately and not yet left behind,
 * or made once and marked by the learner as one to watch.
 */
export function learningFocus(targetLanguageCode: string, currentLanguageCode: string, now = new Date()) {
  return errorSummaries(targetLanguageCode, currentLanguageCode, now)
    .filter((item) => item.category !== 'other' && !item.quiet && focusWeight(item) > (item.noted ? 0 : 1))
    .sort((left, right) => focusWeight(right) - focusWeight(left))
    .slice(0, 3)
    .map((item) => ({
      category: item.category,
      count: item.recentCount,
      ...(item.examples[0] ? { example: `${item.examples[0].original} → ${item.examples[0].improved}` } : {}),
    }))
}

export function learningStatus(current: { code: string; name: string }, now = new Date()) {
  const known = new Map<string, string>([[current.code, current.name]])
  for (const item of rows<{ code: string; name: string }>(`SELECT target_language_code AS code, MAX(target_language) AS name
    FROM conversations WHERE target_language_code <> '' GROUP BY target_language_code`)) {
    if (!known.has(item.code)) known.set(item.code, item.name || item.code)
  }
  for (const item of rows<{ code: string }>('SELECT DISTINCT target_language_code AS code FROM learning_events')) {
    if (!known.has(item.code)) known.set(item.code, item.code)
  }
  const languages = [...known.entries()].map(([code, name]) => {
    const errors = errorSummaries(code, current.code, now)
    const gaps = rows<{ id: string; original: string; improved: string; at: string }>(`SELECT id, original, improved, created_at AS at
      FROM learning_events WHERE target_language_code = ? AND kind = 'gap' ORDER BY created_at DESC LIMIT 12`, code)
    const topics = rows<{ title: string; count: number; lastAt: string }>(`SELECT ${SCENE_TITLE} AS title, COUNT(*) AS count, MAX(updated_at) AS lastAt
      FROM conversations WHERE (target_language_code = ? OR (target_language_code = '' AND ? = ?))
        AND setup_json IS NOT NULL AND TRIM(setup_json) NOT IN ('', 'null')
        AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id AND m.role = 'user' AND m.status = 'complete')
      GROUP BY 1 ORDER BY lastAt DESC LIMIT 8`, code, code, current.code)
    return { code, name, current: code === current.code, turns: turnsSince(code, current.code, ''), errors, gaps, topics }
  })
  return { languages: languages.filter((language) => language.current || language.errors.length || language.gaps.length || language.topics.length) }
}

/** What a scene suggestion may lean on: weak spots and scenes not practised for a while. */
export function practiceProfile(targetLanguageCode: string, currentLanguageCode: string, now = new Date()) {
  const weakSpots = learningFocus(targetLanguageCode, currentLanguageCode, now).map((item) => item.category)
  const stale = new Date(now.getTime() - 14 * DAY).toISOString()
  const restingTopics = rows<{ title: string }>(`SELECT ${SCENE_TITLE} AS title, MAX(updated_at) AS lastAt FROM conversations
    WHERE (target_language_code = ? OR (target_language_code = '' AND ? = ?)) AND setup_json IS NOT NULL AND TRIM(setup_json) NOT IN ('', 'null')
    GROUP BY 1 HAVING lastAt < ? ORDER BY lastAt LIMIT 4`, targetLanguageCode, targetLanguageCode, currentLanguageCode, stale).map((item) => item.title)
  return { weakSpots, restingTopics }
}

export function forgetLearning(targetLanguageCode: string, kind: 'error' | 'gap', category?: string) {
  // What was practised and marked about a kind of mistake goes with the mistakes themselves.
  if (kind === 'error') {
    if (category) db.prepare("DELETE FROM learning_events WHERE target_language_code = ? AND kind IN ('practice', 'focus') AND category = ?").run(targetLanguageCode, category)
    else db.prepare("DELETE FROM learning_events WHERE target_language_code = ? AND kind IN ('practice', 'focus')").run(targetLanguageCode)
  }
  if (category) return db.prepare('DELETE FROM learning_events WHERE target_language_code = ? AND kind = ? AND category = ?').run(targetLanguageCode, kind, category).changes
  return db.prepare('DELETE FROM learning_events WHERE target_language_code = ? AND kind = ?').run(targetLanguageCode, kind).changes
}

/** The corrections of one conversation, those that change the meaning first. */
export function conversationErrors(conversationId: string, limit = 12) {
  return rows<{ category: string; severity: string; original: string; improved: string }>(`SELECT category, severity, original, improved FROM learning_events
    WHERE conversation_id = ? AND kind = 'error'
    ORDER BY CASE severity WHEN 'meaning' THEN 0 WHEN 'naturalness' THEN 1 ELSE 2 END, created_at DESC, rowid DESC LIMIT ?`, conversationId, limit)
}

/** A recent example of each kind of mistake the learner keeps making, from any conversation in the language. */
export function recurringErrors(targetLanguageCode: string, currentLanguageCode: string, now = new Date()) {
  const focus = new Set(learningFocus(targetLanguageCode, currentLanguageCode, now).map((item) => item.category))
  return errorSummaries(targetLanguageCode, currentLanguageCode, now)
    .filter((item) => focus.has(item.category))
    .flatMap((item) => item.examples.slice(0, 1).map((example) => ({ category: item.category, severity: '', ...example })))
}

export function isPatternNoted(targetLanguageCode: string, category: string) {
  return Boolean(row<{ id: string }>("SELECT id FROM learning_events WHERE target_language_code = ? AND kind = 'focus' AND category = ? LIMIT 1", targetLanguageCode, category))
}

/** The learner asked for one kind of mistake to be kept in view. Held once for each language and kind. */
export function noteErrorPattern(input: { targetLanguageCode: string; category: string; example?: { original: string; improved: string }; conversationId?: string | null; at?: string }) {
  db.prepare("DELETE FROM learning_events WHERE target_language_code = ? AND kind = 'focus' AND category = ?").run(input.targetLanguageCode, input.category)
  db.prepare(`INSERT INTO learning_events (id, target_language_code, kind, category, severity, original, improved, conversation_id, message_id, created_at)
    VALUES (?, ?, 'focus', ?, '', ?, ?, ?, NULL, ?)`).run(nanoid(), input.targetLanguageCode, input.category,
    (input.example?.original || '').slice(0, 300), (input.example?.improved || '').slice(0, 300), input.conversationId || null, input.at || new Date().toISOString())
}

/** One practice answer on a kind of mistake. A right answer makes the mistake weigh less, a wrong one more. */
export function recordPractice(input: { targetLanguageCode: string; category: string; right: boolean; sentence: string; answer: string; conversationId?: string | null; at?: string }) {
  db.prepare(`INSERT INTO learning_events (id, target_language_code, kind, category, severity, original, improved, conversation_id, message_id, created_at)
    VALUES (?, ?, 'practice', ?, ?, ?, ?, ?, NULL, ?)`).run(nanoid(), input.targetLanguageCode, input.category, input.right ? 'right' : 'wrong',
    input.sentence.slice(0, 300), input.answer.slice(0, 300), input.conversationId || null, input.at || new Date().toISOString())
}

export function forgetLearningEvent(id: string) {
  return Boolean(db.prepare('DELETE FROM learning_events WHERE id = ?').run(id).changes)
}

// ---------------------------------------------------------------------------
// Suggestions: things about the memories that only the learner can settle

export type SuggestionKind = 'promote' | 'conflict' | 'stale' | 'review'

export function addSuggestion(input: {
  kind: SuggestionKind
  memoryId?: string | null
  conversationMemoryId?: string | null
  conversationId?: string | null
  value?: string
  note?: string
  payload?: Record<string, unknown>
  interfaceLocale?: string
}) {
  // Asked once: a suggestion the learner already turned down is not raised again.
  const seen = row(`SELECT 1 FROM memory_suggestions WHERE kind = ? AND COALESCE(memory_id, '') = ? AND COALESCE(conversation_memory_id, '') = ?
    AND (status = 'open' OR value = ?)`, input.kind, input.memoryId || '', input.conversationMemoryId || '', input.value || '')
  if (seen) return null
  const id = nanoid()
  db.prepare(`INSERT INTO memory_suggestions
    (id, kind, memory_id, conversation_memory_id, conversation_id, value, note, payload_json, interface_locale, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`).run(
    id, input.kind, input.memoryId || null, input.conversationMemoryId || null, input.conversationId || null,
    input.value || '', input.note || '', JSON.stringify(input.payload || {}), input.interfaceLocale || '', new Date().toISOString(),
  )
  return id
}

export function openSuggestions() {
  const suggestions = rows<Record<string, any>>(`SELECT s.id AS id, s.kind AS kind, s.memory_id AS memoryId, s.conversation_memory_id AS conversationMemoryId,
    s.conversation_id AS conversationId, s.value AS value, s.note AS note, s.payload_json AS payloadJson, s.interface_locale AS interfaceLocale,
    s.created_at AS createdAt, m.value AS memoryValue, m.memory_type AS memoryType, m.valid_to AS memoryValidTo,
    COALESCE(NULLIF(CASE WHEN json_valid(c.setup_json) THEN json_extract(c.setup_json, '$.title') END, ''), c.title) AS conversationTitle,
    c.setup_json AS setupJson, k.value AS saidValue, k.quote AS quote
    FROM memory_suggestions s
    LEFT JOIN memories m ON m.id = s.memory_id
    LEFT JOIN conversations c ON c.id = s.conversation_id
    LEFT JOIN conversation_memories k ON k.id = s.conversation_memory_id
    WHERE s.status = 'open' ORDER BY s.created_at DESC`)
  const live: Array<Record<string, any>> = []
  for (const suggestion of suggestions) {
    // The thing it was about has gone, so there is nothing left to decide.
    const orphaned = (suggestion.memoryId && suggestion.memoryValue === null) ||
      (suggestion.kind === 'promote' && suggestion.saidValue === null)
    if (orphaned) {
      resolveSuggestion(suggestion.id, 'dismissed')
      continue
    }
    const scene = Boolean(suggestion.setupJson && String(suggestion.setupJson).trim() && String(suggestion.setupJson).trim() !== 'null')
    live.push({
      id: suggestion.id,
      kind: suggestion.kind,
      memoryId: suggestion.memoryId,
      conversationMemoryId: suggestion.conversationMemoryId,
      conversationId: suggestion.conversationTitle === null ? null : suggestion.conversationId,
      conversationTitle: suggestion.conversationTitle || '',
      frame: suggestion.conversationTitle === null ? '' : scene ? 'scene' : 'direct',
      value: suggestion.value || suggestion.saidValue || '',
      note: suggestion.note,
      quote: suggestion.quote || '',
      memoryValue: suggestion.memoryValue || '',
      layer: suggestion.memoryType ? layerOf(suggestion.memoryType) as MemoryLayer : null,
      interfaceLocale: suggestion.interfaceLocale,
      createdAt: suggestion.createdAt,
    })
  }
  return live
}

export function suggestionById(id: string) {
  return row<Record<string, any>>(`SELECT id, kind, memory_id AS memoryId, conversation_memory_id AS conversationMemoryId, conversation_id AS conversationId,
    value, note, payload_json AS payloadJson, interface_locale AS interfaceLocale, status FROM memory_suggestions WHERE id = ?`, id)
}

export function resolveSuggestion(id: string, status: 'accepted' | 'dismissed') {
  db.prepare('UPDATE memory_suggestions SET status = ?, resolved_at = ? WHERE id = ?').run(status, new Date().toISOString(), id)
}
