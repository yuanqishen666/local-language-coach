import { db, row } from './database.js'
import { safeJson } from '../utils/json.js'

export type AiCacheType = 'lookup'

export function readAiResponseCache<T>(cacheType: AiCacheType, cacheKey: string): T | undefined {
  const cached = row<{ response_json: string }>(
    'SELECT response_json FROM ai_response_cache WHERE cache_type = ? AND cache_key = ?',
    cacheType,
    cacheKey,
  )
  if (!cached) return undefined
  const response = safeJson<T | null>(cached.response_json, null)
  if (response === null) return undefined
  db.prepare(`UPDATE ai_response_cache
    SET hit_count = hit_count + 1, last_accessed = ?
    WHERE cache_type = ? AND cache_key = ?`).run(new Date().toISOString(), cacheType, cacheKey)
  return response
}

export function writeAiResponseCache(cacheType: AiCacheType, cacheKey: string, response: unknown, limit = 2_000) {
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO ai_response_cache (cache_type, cache_key, response_json, created_at, last_accessed)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(cache_type, cache_key) DO UPDATE SET
      response_json = excluded.response_json,
      last_accessed = excluded.last_accessed`).run(cacheType, cacheKey, JSON.stringify(response), now, now)
  db.prepare(`DELETE FROM ai_response_cache WHERE cache_type = ? AND cache_key IN (
    SELECT cache_key FROM ai_response_cache
    WHERE cache_type = ?
    ORDER BY last_accessed DESC
    LIMIT -1 OFFSET ?
  )`).run(cacheType, cacheType, limit)
}
