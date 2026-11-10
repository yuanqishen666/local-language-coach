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
    value TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1,
    sensitive INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'confirmed',
    source_conversation_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(category, key)
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

db.exec('CREATE UNIQUE INDEX IF NOT EXISTS messages_client_id_unique ON messages(conversation_id, client_message_id) WHERE client_message_id IS NOT NULL')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS messages_reply_to_unique ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL')
db.exec('CREATE INDEX IF NOT EXISTS translation_cache_accessed_index ON translation_cache(last_accessed DESC)')
db.exec('CREATE INDEX IF NOT EXISTS ai_response_cache_accessed_index ON ai_response_cache(cache_type, last_accessed DESC)')
db.exec('CREATE INDEX IF NOT EXISTS conversation_episodes_conversation_index ON conversation_episodes(conversation_id, created_at)')
db.exec('CREATE INDEX IF NOT EXISTS web_lookup_cache_expiry_index ON web_lookup_cache(expires_at)')
export function rows<T>(statement: string, ...params: any[]): T[] {
  return db.prepare(statement).all(...params) as T[]
}

export function row<T>(statement: string, ...params: any[]): T | undefined {
  return db.prepare(statement).get(...params) as T | undefined
}
