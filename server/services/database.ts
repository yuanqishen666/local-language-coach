import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { dataRoot } from './config.js'

mkdirSync(dataRoot, { recursive: true, mode: 0o700 })
export let db = new DatabaseSync(path.join(dataRoot, 'app.db'))

function createTables() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      title TEXT NOT NULL,
      setup_json TEXT,
      interface_locale TEXT NOT NULL DEFAULT '',
      target_language TEXT NOT NULL DEFAULT '',
      target_language_code TEXT NOT NULL DEFAULT '',
      localized_setups_json TEXT NOT NULL DEFAULT '{}',
      state_json TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_episodes (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      start_message_id TEXT NOT NULL,
      end_message_id TEXT NOT NULL,
      thread TEXT NOT NULL,
      summary TEXT NOT NULL,
      facts_json TEXT NOT NULL DEFAULT '[]',
      open_loops_json TEXT NOT NULL DEFAULT '[]',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      topic_arcs_json TEXT NOT NULL DEFAULT '[]',
      interaction_signals_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      meta_json TEXT,
      client_message_id TEXT,
      reply_to_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'complete',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scene_anchors (
      id TEXT PRIMARY KEY,
      preset_id TEXT NOT NULL,
      target_language_code TEXT NOT NULL,
      raw_value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      interface_locale TEXT NOT NULL DEFAULT '',
      confirmed_facts_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(preset_id, target_language_code, normalized_value)
    );
    CREATE TABLE IF NOT EXISTS scene_backgrounds (
      id TEXT PRIMARY KEY,
      anchor_id TEXT NOT NULL REFERENCES scene_anchors(id) ON DELETE CASCADE,
      preset_id TEXT NOT NULL,
      target_language_code TEXT NOT NULL,
      identity_key TEXT NOT NULL,
      stable_fingerprint TEXT NOT NULL,
      background_json TEXT NOT NULL,
      saved INTEGER NOT NULL DEFAULT 0,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(anchor_id, identity_key)
    );
    CREATE TABLE IF NOT EXISTS scene_runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
      anchor_id TEXT NOT NULL REFERENCES scene_anchors(id) ON DELETE CASCADE,
      background_id TEXT REFERENCES scene_backgrounds(id) ON DELETE SET NULL,
      preset_id TEXT NOT NULL,
      target_language_code TEXT NOT NULL,
      run_mode TEXT NOT NULL DEFAULT 'new_encounter',
      dynamic_fingerprint TEXT NOT NULL,
      opening_fingerprint TEXT NOT NULL,
      encounter_json TEXT NOT NULL,
      opening_line TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS word_entries (
      id TEXT PRIMARY KEY,
      term TEXT NOT NULL,
      lemma TEXT NOT NULL,
      language TEXT NOT NULL,
      interface_locale TEXT NOT NULL DEFAULT '',
      meaning TEXT NOT NULL,
      details_json TEXT NOT NULL,
      source_sentence TEXT,
      conversation_id TEXT,
      due_at TEXT NOT NULL,
      interval_days INTEGER NOT NULL DEFAULT 0,
      ease REAL NOT NULL DEFAULT 2.3,
      repetitions INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      semantic_slot TEXT NOT NULL DEFAULT '',
      value TEXT NOT NULL,
      interface_locale TEXT NOT NULL DEFAULT '',
      localized_values_json TEXT NOT NULL DEFAULT '{}',
      tier TEXT NOT NULL DEFAULT 'long_term',
      memory_type TEXT NOT NULL DEFAULT 'preference',
      topic TEXT NOT NULL DEFAULT 'general',
      importance REAL NOT NULL DEFAULT 0.5,
      pinned INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 1,
      sensitive INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'confirmed',
      source_conversation_id TEXT,
      source_message_id TEXT,
      supersedes_id TEXT,
      valid_from TEXT,
      valid_to TEXT,
      last_used_at TEXT,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_mentioned_at TEXT,
      mention_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(category, key)
    );
    CREATE TABLE IF NOT EXISTS memory_revisions (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      previous_value TEXT,
      next_value TEXT,
      change_type TEXT NOT NULL,
      source_conversation_id TEXT,
      source_message_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_sources (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      conversation_id TEXT,
      message_id TEXT,
      frame TEXT NOT NULL DEFAULT '',
      scene_title TEXT NOT NULL DEFAULT '',
      quote TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_memories (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      semantic_slot TEXT NOT NULL,
      value TEXT NOT NULL,
      quote TEXT NOT NULL DEFAULT '',
      about TEXT NOT NULL DEFAULT 'persona',
      durability TEXT NOT NULL DEFAULT 'momentary',
      memory_type TEXT NOT NULL DEFAULT 'preference',
      topic TEXT NOT NULL DEFAULT 'general',
      sensitive INTEGER NOT NULL DEFAULT 0,
      interface_locale TEXT NOT NULL DEFAULT '',
      source_message_id TEXT,
      promoted_memory_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(conversation_id, semantic_slot)
    );
    CREATE TABLE IF NOT EXISTS learning_events (
      id TEXT PRIMARY KEY,
      target_language_code TEXT NOT NULL,
      kind TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT '',
      original TEXT NOT NULL,
      improved TEXT NOT NULL,
      conversation_id TEXT,
      message_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_suggestions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      memory_id TEXT,
      conversation_memory_id TEXT,
      conversation_id TEXT,
      value TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      interface_locale TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS app_flags (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS translation_cache (
      cache_key TEXT PRIMARY KEY,
      translation TEXT NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_accessed TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_response_cache (
      cache_type TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      response_json TEXT NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_accessed TEXT NOT NULL,
      PRIMARY KEY (cache_type, cache_key)
    );
    CREATE TABLE IF NOT EXISTS web_lookup_cache (
      cache_key TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      result_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_accessed TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS proficiency_profiles (
      language_code TEXT PRIMARY KEY,
      score REAL NOT NULL,
      working_step INTEGER NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'low',
      skills_json TEXT NOT NULL DEFAULT '{}',
      source TEXT NOT NULL DEFAULT 'self',
      locked INTEGER NOT NULL DEFAULT 0,
      tested_at TEXT,
      tested_step INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS proficiency_history (
      id TEXT PRIMARY KEY,
      language_code TEXT NOT NULL,
      kind TEXT NOT NULL,
      from_step INTEGER,
      to_step INTEGER NOT NULL,
      reason TEXT NOT NULL,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS placement_sessions (
      id TEXT PRIMARY KEY,
      language_code TEXT NOT NULL,
      language_name TEXT NOT NULL DEFAULT '',
      interface_locale TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'full',
      status TEXT NOT NULL DEFAULT 'active',
      state_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS placement_items (
      id TEXT PRIMARY KEY,
      language_code TEXT NOT NULL,
      interface_locale TEXT NOT NULL,
      level TEXT NOT NULL,
      kind TEXT NOT NULL,
      item_json TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS turn_signals (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      partner_message_id TEXT NOT NULL,
      user_message_id TEXT,
      language_code TEXT NOT NULL DEFAULT '',
      step INTEGER NOT NULL DEFAULT 0,
      length INTEGER NOT NULL DEFAULT 0,
      meaning_errors INTEGER NOT NULL DEFAULT 0,
      naturalness_errors INTEGER NOT NULL DEFAULT 0,
      non_target INTEGER NOT NULL DEFAULT 0,
      lookups INTEGER NOT NULL DEFAULT 0,
      translated INTEGER NOT NULL DEFAULT 0,
      simpler INTEGER NOT NULL DEFAULT 0,
      slower INTEGER NOT NULL DEFAULT 0,
      hints INTEGER NOT NULL DEFAULT 0,
      heard INTEGER NOT NULL DEFAULT 0,
      revealed INTEGER NOT NULL DEFAULT 0,
      lowered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(conversation_id, partner_message_id)
    );
    CREATE TABLE IF NOT EXISTS conversation_assessments (
      conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
      language_code TEXT NOT NULL,
      base_step INTEGER NOT NULL,
      estimate_step INTEGER NOT NULL,
      valid INTEGER NOT NULL DEFAULT 0,
      verdict TEXT NOT NULL DEFAULT 'fit',
      stats_json TEXT NOT NULL DEFAULT '{}',
      expression_step REAL,
      last_message_id TEXT,
      assessed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_recaps (
      conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
      language_code TEXT NOT NULL,
      interface_locale TEXT NOT NULL,
      last_message_id TEXT,
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS practice_sets (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
      language_code TEXT NOT NULL,
      interface_locale TEXT NOT NULL,
      items_json TEXT NOT NULL,
      answers_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS word_reviews (
      id TEXT PRIMARY KEY,
      word_id TEXT NOT NULL,
      language TEXT NOT NULL,
      rating INTEGER NOT NULL,
      source TEXT NOT NULL,
      conversation_id TEXT,
      state_before INTEGER NOT NULL DEFAULT 0,
      scheduled_days INTEGER NOT NULL DEFAULT 0,
      reviewed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_words (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      word_id TEXT NOT NULL,
      term TEXT NOT NULL,
      meaning TEXT NOT NULL,
      source TEXT NOT NULL,
      arranged_at TEXT NOT NULL,
      used_at TEXT,
      result TEXT,
      message_id TEXT,
      PRIMARY KEY (conversation_id, word_id)
    );
    CREATE TABLE IF NOT EXISTS word_stories (
      id TEXT PRIMARY KEY,
      language_code TEXT NOT NULL,
      interface_locale TEXT NOT NULL,
      step INTEGER NOT NULL,
      title TEXT NOT NULL,
      content_json TEXT NOT NULL,
      conversation_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS content_imports (
      id TEXT PRIMARY KEY,
      language_code TEXT NOT NULL,
      interface_locale TEXT NOT NULL,
      step INTEGER NOT NULL,
      source_kind TEXT NOT NULL,
      source_url TEXT,
      source_title TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS learning_paths (
      id TEXT PRIMARY KEY,
      language_code TEXT NOT NULL,
      interface_locale TEXT NOT NULL,
      items_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
}

function ensureTableColumn(table: 'conversations' | 'conversation_episodes' | 'word_entries' | 'memories' | 'messages' | 'turn_signals', name: string, definition: string) {
  const columns = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name))
  if (!columns.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
}

function addColumns() {
  // Lines listened to with their text hidden, and whether the text was asked for.
  ensureTableColumn('turn_signals', 'heard', 'INTEGER NOT NULL DEFAULT 0')
  ensureTableColumn('turn_signals', 'revealed', 'INTEGER NOT NULL DEFAULT 0')

  // SQLite CREATE TABLE IF NOT EXISTS does not add columns to an existing local
  // database. These additive migrations keep every previously saved memory.
  ensureTableColumn('conversations', 'interface_locale', "TEXT NOT NULL DEFAULT ''")
  ensureTableColumn('conversations', 'localized_setups_json', "TEXT NOT NULL DEFAULT '{}'")
  // Empty on conversations started before the learning language was recorded: those follow the current setting.
  ensureTableColumn('conversations', 'target_language', "TEXT NOT NULL DEFAULT ''")
  ensureTableColumn('conversations', 'target_language_code', "TEXT NOT NULL DEFAULT ''")
  ensureTableColumn('conversation_episodes', 'topic_arcs_json', "TEXT NOT NULL DEFAULT '[]'")
  ensureTableColumn('conversation_episodes', 'interaction_signals_json', "TEXT NOT NULL DEFAULT '[]'")
  ensureTableColumn('word_entries', 'interface_locale', "TEXT NOT NULL DEFAULT ''")
  // Empty until the word is first reviewed under FSRS; the card is then worked out from the old interval and ease.
  ensureTableColumn('word_entries', 'fsrs_json', "TEXT NOT NULL DEFAULT ''")
  // A story or pasted text the conversation is about. Empty for every other conversation.
  ensureTableColumn('conversations', 'material_json', "TEXT NOT NULL DEFAULT ''")
  ensureTableColumn('memories', 'interface_locale', "TEXT NOT NULL DEFAULT ''")
  ensureTableColumn('memories', 'localized_values_json', "TEXT NOT NULL DEFAULT '{}'")
  ensureTableColumn('memories', 'semantic_slot', "TEXT NOT NULL DEFAULT ''")
  ensureTableColumn('memories', 'tier', "TEXT NOT NULL DEFAULT 'long_term'")
  ensureTableColumn('memories', 'memory_type', "TEXT NOT NULL DEFAULT 'preference'")
  ensureTableColumn('memories', 'topic', "TEXT NOT NULL DEFAULT 'general'")
  ensureTableColumn('memories', 'importance', 'REAL NOT NULL DEFAULT 0.5')
  ensureTableColumn('memories', 'pinned', 'INTEGER NOT NULL DEFAULT 0')
  ensureTableColumn('memories', 'source_message_id', 'TEXT')
  ensureTableColumn('memories', 'supersedes_id', 'TEXT')
  ensureTableColumn('memories', 'valid_from', 'TEXT')
  ensureTableColumn('memories', 'valid_to', 'TEXT')
  ensureTableColumn('memories', 'last_used_at', 'TEXT')
  ensureTableColumn('memories', 'use_count', 'INTEGER NOT NULL DEFAULT 0')
  ensureTableColumn('memories', 'last_mentioned_at', 'TEXT')
  ensureTableColumn('memories', 'mention_count', 'INTEGER NOT NULL DEFAULT 0')
  // Learning memories belong to one learning language; everything else leaves this empty.
  ensureTableColumn('memories', 'target_language_code', "TEXT NOT NULL DEFAULT ''")
  // The last message that tidying up after the conversation has already looked at.
  ensureTableColumn('conversations', 'consolidated_message_id', 'TEXT')
  // The difficulty a conversation started at and how far it has moved since. Empty on conversations from before levels were kept.
  ensureTableColumn('conversations', 'difficulty_json', 'TEXT')

  db.exec(`
    UPDATE memories SET valid_from = created_at WHERE valid_from IS NULL;
    UPDATE memories SET memory_type = 'learning' WHERE category = 'learning' AND memory_type = 'preference';
  `)

  // Memories are filed by layer: about the learner, plans and current situation, learning.
  // What used to be filed as an experience becomes a plan; the kind decides the layer from here on.
  db.exec(`
    UPDATE OR IGNORE memories SET memory_type = 'plan', category = 'plan' WHERE category = 'scene' OR memory_type = 'episodic';
    UPDATE OR IGNORE memories SET category = 'about' WHERE category = 'personal';
  `)
}

/**
 * Runs once on a database from before memories had a scope. Each memory gets a record of where it
 * came from, and those that came out of a scene are put in front of the learner to decide on,
 * because a scene is where a line of role-play could have been stored as a fact about them.
 */
export function reviewMemoriesFromScenes() {
  if (db.prepare("SELECT 1 FROM app_flags WHERE key = 'memory_scope_review'").get()) return
  const now = new Date().toISOString()
  const sourced = db.prepare(`SELECT m.id AS id, m.source_conversation_id AS conversationId, m.source_message_id AS messageId,
    m.created_at AS createdAt, COALESCE(NULLIF(CASE WHEN json_valid(c.setup_json) THEN json_extract(c.setup_json, '$.title') END, ''), c.title) AS title, c.setup_json AS setupJson
    FROM memories m JOIN conversations c ON c.id = m.source_conversation_id
    WHERE NOT EXISTS (SELECT 1 FROM memory_sources s WHERE s.memory_id = m.id)`).all() as Array<Record<string, string | null>>
  db.exec('BEGIN IMMEDIATE')
  try {
    let sequence = 0
    for (const memory of sourced) {
      const scene = Boolean(memory.setupJson && memory.setupJson.trim() && memory.setupJson.trim() !== 'null')
      sequence += 1
      db.prepare(`INSERT INTO memory_sources (id, memory_id, conversation_id, message_id, frame, scene_title, quote, created_at)
        VALUES (?, ?, ?, ?, ?, ?, '', ?)`).run(`source-${memory.id}-${sequence}`, memory.id, memory.conversationId, memory.messageId, scene ? 'scene' : 'direct', scene ? memory.title || '' : '', memory.createdAt || now)
      if (!scene) continue
      db.prepare(`INSERT INTO memory_suggestions (id, kind, memory_id, conversation_id, status, created_at)
        VALUES (?, 'review', ?, ?, 'open', ?)`).run(`review-${memory.id}`, memory.id, memory.conversationId, now)
    }
    db.prepare("INSERT INTO app_flags (key, value) VALUES ('memory_scope_review', ?)").run(now)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function createIndexes() {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS messages_client_id_unique ON messages(conversation_id, client_message_id) WHERE client_message_id IS NOT NULL')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS messages_reply_to_unique ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL')
  db.exec('CREATE INDEX IF NOT EXISTS translation_cache_accessed_index ON translation_cache(last_accessed DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS ai_response_cache_accessed_index ON ai_response_cache(cache_type, last_accessed DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS conversation_episodes_conversation_index ON conversation_episodes(conversation_id, created_at)')
  db.exec('CREATE INDEX IF NOT EXISTS scene_anchors_lookup_index ON scene_anchors(preset_id, target_language_code, normalized_value)')
  db.exec('CREATE INDEX IF NOT EXISTS scene_backgrounds_anchor_index ON scene_backgrounds(anchor_id, use_count, last_used_at)')
  db.exec('CREATE INDEX IF NOT EXISTS scene_runs_anchor_index ON scene_runs(anchor_id, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS scene_runs_preset_index ON scene_runs(preset_id, target_language_code, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS web_lookup_cache_expiry_index ON web_lookup_cache(expires_at)')
  db.exec('DROP INDEX IF EXISTS memories_retrieval_index')
  db.exec('CREATE INDEX memories_retrieval_index ON memories(status, tier, topic, updated_at DESC)')
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS memories_semantic_slot_unique ON memories(semantic_slot) WHERE semantic_slot <> ''")
  db.exec('CREATE INDEX IF NOT EXISTS memory_revisions_memory_index ON memory_revisions(memory_id, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS memory_sources_memory_index ON memory_sources(memory_id, created_at)')
  db.exec('CREATE INDEX IF NOT EXISTS conversation_memories_conversation_index ON conversation_memories(conversation_id, updated_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS learning_events_language_index ON learning_events(target_language_code, kind, category, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS memory_suggestions_status_index ON memory_suggestions(status, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS proficiency_history_language_index ON proficiency_history(language_code, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS placement_items_lookup_index ON placement_items(language_code, interface_locale, level, kind, use_count)')
  db.exec('CREATE INDEX IF NOT EXISTS turn_signals_conversation_index ON turn_signals(conversation_id, created_at)')
  db.exec('CREATE INDEX IF NOT EXISTS conversation_assessments_language_index ON conversation_assessments(language_code, assessed_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS practice_sets_conversation_index ON practice_sets(conversation_id, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS word_entries_due_index ON word_entries(due_at)')
  db.exec('CREATE INDEX IF NOT EXISTS word_reviews_time_index ON word_reviews(reviewed_at)')
  db.exec('CREATE INDEX IF NOT EXISTS content_imports_time_index ON content_imports(created_at DESC)')
}

function setUp() {
  createTables()
  addColumns()
  reviewMemoriesFromScenes()
  createIndexes()
}
setUp()

/** The file one learner's conversations, memories, words and level are kept in. */
export function databaseFile(name = 'app.db') {
  return path.join(dataRoot, name)
}

/** Points every query at another learner's database, creating and preparing it when it is new. */
export function useDatabase(file: string) {
  db.close()
  db = new DatabaseSync(file)
  setUp()
}

export function rows<T>(statement: string, ...params: any[]): T[] {
  return db.prepare(statement).all(...params) as T[]
}

export function row<T>(statement: string, ...params: any[]): T | undefined {
  return db.prepare(statement).get(...params) as T | undefined
}
