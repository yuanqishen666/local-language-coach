import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { dataRoot } from './config.js'

mkdirSync(dataRoot, { recursive: true, mode: 0o700 })
export const db = new DatabaseSync(path.join(dataRoot, 'app.db'))

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    title TEXT NOT NULL,
    setup_json TEXT,
    interface_locale TEXT NOT NULL DEFAULT '',
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
`)

function ensureTableColumn(table: 'conversations' | 'conversation_episodes' | 'word_entries' | 'memories', name: string, definition: string) {
  const columns = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name))
  if (!columns.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
}

// SQLite CREATE TABLE IF NOT EXISTS does not add columns to an existing local
// database. These additive migrations keep every previously saved memory.
ensureTableColumn('conversations', 'interface_locale', "TEXT NOT NULL DEFAULT ''")
ensureTableColumn('conversations', 'localized_setups_json', "TEXT NOT NULL DEFAULT '{}'")
ensureTableColumn('conversation_episodes', 'topic_arcs_json', "TEXT NOT NULL DEFAULT '[]'")
ensureTableColumn('conversation_episodes', 'interaction_signals_json', "TEXT NOT NULL DEFAULT '[]'")
ensureTableColumn('word_entries', 'interface_locale', "TEXT NOT NULL DEFAULT ''")
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

db.exec(`
  UPDATE memories SET valid_from = created_at WHERE valid_from IS NULL;
  UPDATE memories SET memory_type = 'learning' WHERE category = 'learning' AND memory_type = 'preference';
  UPDATE memories SET memory_type = 'episodic' WHERE category = 'scene' AND memory_type = 'preference';
`)

db.exec('CREATE UNIQUE INDEX IF NOT EXISTS messages_client_id_unique ON messages(conversation_id, client_message_id) WHERE client_message_id IS NOT NULL')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS messages_reply_to_unique ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL')
db.exec('CREATE INDEX IF NOT EXISTS translation_cache_accessed_index ON translation_cache(last_accessed DESC)')
db.exec('CREATE INDEX IF NOT EXISTS ai_response_cache_accessed_index ON ai_response_cache(cache_type, last_accessed DESC)')
db.exec('CREATE INDEX IF NOT EXISTS conversation_episodes_conversation_index ON conversation_episodes(conversation_id, created_at)')
db.exec('CREATE INDEX IF NOT EXISTS web_lookup_cache_expiry_index ON web_lookup_cache(expires_at)')
db.exec('DROP INDEX IF EXISTS memories_retrieval_index')
db.exec('CREATE INDEX memories_retrieval_index ON memories(status, tier, topic, updated_at DESC)')
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS memories_semantic_slot_unique ON memories(semantic_slot) WHERE semantic_slot <> ''")
db.exec('CREATE INDEX IF NOT EXISTS memory_revisions_memory_index ON memory_revisions(memory_id, created_at DESC)')
export function rows<T>(statement: string, ...params: any[]): T[] {
  return db.prepare(statement).all(...params) as T[]
}

export function row<T>(statement: string, ...params: any[]): T | undefined {
  return db.prepare(statement).get(...params) as T | undefined
}
