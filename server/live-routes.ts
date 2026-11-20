/**
 * Practice with a real person. Before: a card of up to three things to try, taken from what the
 * learning record already holds, with no request to a model. After: the learner's notes on what
 * they could not say and what was corrected, written into the same learning record the
 * conversations here write into.
 */
import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { getConfig } from './services/config.js'
import { db, row, rows } from './services/database.js'
import { learningFocus } from './services/memory-store.js'
import { normalizeUiLocale } from '../shared/locales.js'
import type { ErrorCategory } from '../shared/memory.js'
import { safeJson } from './utils/json.js'
import { writeLiveDebrief } from './ai/live.js'
import { workingStepFor } from './proficiency-store.js'
import { wordsByDue } from './word-store.js'
import { LIVE_NOTES_MAX } from '../shared/quick-talk.js'

export const LIVE_CARD_ITEMS = 3
export { LIVE_NOTES_MAX }
const NOTE_MAX_LENGTH = 300
const CARD_WORDS = 3
const CARD_SENTENCES = 2
const PAST_SESSIONS = 10

export type LiveCardItem =
  | { kind: 'pattern'; category: string; example: string }
  | { kind: 'words'; words: Array<{ term: string; meaning: string }> }
  | { kind: 'say'; sentences: Array<{ original: string; improved: string }> }

interface LiveOutcome {
  /** For each thing on the card, whether the learner got to it. */
  used: boolean[]
  gaps: Array<{ original: string; improved: string }>
  errors: Array<{ original: string; improved: string; explanation: string; category: ErrorCategory }>
}

interface LiveRow {
  id: string
  language_code: string
  card_json: string
  outcome_json: string | null
  created_at: string
  finished_at: string | null
}

function failure(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code })
}

/** The marker the learning record carries for entries that came from one debrief. */
function recordKey(sessionId: string) {
  return `live:${sessionId}`
}

/**
 * Up to three things, the most useful first: the kind of mistake made most, saved words waiting
 * to be used, sentences the learner could not say last time, then further kinds of mistake.
 */
export function liveCard(languageCode: string, now = new Date()): LiveCardItem[] {
  const patterns: LiveCardItem[] = learningFocus(languageCode, languageCode, now)
    .map((item) => ({ kind: 'pattern', category: item.category, example: item.example || '' }))
  const words = wordsByDue(languageCode, CARD_WORDS).map((word) => ({ term: word.term, meaning: word.meaning }))
  const sentences = rows<{ original: string; improved: string }>(
    "SELECT original, improved FROM learning_events WHERE target_language_code = ? AND kind = 'gap' ORDER BY created_at DESC, rowid DESC LIMIT ?", languageCode, CARD_SENTENCES,
  )
  const ordered: LiveCardItem[] = [
    ...patterns.slice(0, 1),
    ...(words.length ? [{ kind: 'words' as const, words }] : []),
    ...(sentences.length ? [{ kind: 'say' as const, sentences }] : []),
    ...patterns.slice(1),
  ]
  return ordered.slice(0, LIVE_CARD_ITEMS)
}

function view(session: LiveRow) {
  return {
    id: session.id,
    languageCode: session.language_code,
    createdAt: session.created_at,
    finishedAt: session.finished_at,
    items: safeJson<LiveCardItem[]>(session.card_json, []),
    outcome: session.outcome_json ? safeJson<LiveOutcome | null>(session.outcome_json, null) : null,
  }
}

function notes(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((item) => typeof item === 'string' ? item.trim().slice(0, NOTE_MAX_LENGTH) : '')
    .filter(Boolean).slice(0, LIVE_NOTES_MAX)
}

function corrections(value: unknown) {
  return (Array.isArray(value) ? value : []).map((item) => {
    const pair = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      said: typeof pair.said === 'string' ? pair.said.trim().slice(0, NOTE_MAX_LENGTH) : '',
      right: typeof pair.right === 'string' ? pair.right.trim().slice(0, NOTE_MAX_LENGTH) : '',
    }
  }).filter((item) => item.said && item.right && item.said !== item.right).slice(0, LIVE_NOTES_MAX)
}

export function registerLiveRoutes(app: FastifyInstance) {
  const pending = new Map<string, Promise<unknown>>()

  app.get('/api/live', async () => {
    const code = (await getConfig()).learning.targetLanguageCode
    const sessions = rows<LiveRow>('SELECT * FROM live_sessions WHERE language_code = ? ORDER BY created_at DESC, rowid DESC LIMIT ?', code, PAST_SESSIONS + 1).map(view)
    const current = sessions.find((session) => !session.finishedAt) || null
    return { current, past: sessions.filter((session) => session.finishedAt).slice(0, PAST_SESSIONS) }
  })

  // A new card replaces one that was never come back to.
  app.post('/api/live', async () => {
    const code = (await getConfig()).learning.targetLanguageCode
    const id = nanoid()
    const now = new Date()
    db.prepare('DELETE FROM live_sessions WHERE language_code = ? AND finished_at IS NULL').run(code)
    db.prepare('INSERT INTO live_sessions (id, language_code, card_json, created_at) VALUES (?, ?, ?, ?)')
      .run(id, code, JSON.stringify(liveCard(code, now)), now.toISOString())
    return view(row<LiveRow>('SELECT * FROM live_sessions WHERE id = ?', id)!)
  })

  app.post<{ Params: { id: string }; Body: { used?: unknown; stuck?: unknown; corrected?: unknown; interfaceLocale?: string } }>('/api/live/:id/debrief', async (request) => {
    const session = row<LiveRow>('SELECT * FROM live_sessions WHERE id = ?', request.params.id)
    if (!session) throw failure('Session not found', 404, 'LIVE_NOT_FOUND')
    if (session.finished_at) return view(session)
    const running = pending.get(session.id)
    if (running) return running
    const task = (async () => {
      const current = await getConfig()
      const body = request.body || {}
      const items = safeJson<LiveCardItem[]>(session.card_json, [])
      const used = items.map((_, index) => Array.isArray(body.used) && body.used[index] === true)
      const debrief = await writeLiveDebrief({
        languageCode: session.language_code,
        languageName: current.learning.targetLanguage,
        interfaceLocale: normalizeUiLocale(body.interfaceLocale, current.ui.locale),
        variant: current.learning.variant,
        step: workingStepFor(session.language_code, current.learning.proficiency),
        stuck: notes(body.stuck),
        corrected: corrections(body.corrected),
      })
      const at = new Date().toISOString()
      const outcome: LiveOutcome = { used, ...debrief }
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('DELETE FROM learning_events WHERE message_id = ?').run(recordKey(session.id))
        const insert = db.prepare(`INSERT INTO learning_events
          (id, target_language_code, kind, category, severity, original, improved, conversation_id, message_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
        for (const item of debrief.errors) insert.run(nanoid(), session.language_code, 'error', item.category, 'naturalness', item.original, item.improved, recordKey(session.id), at)
        for (const item of debrief.gaps) insert.run(nanoid(), session.language_code, 'gap', 'gap', '', item.original, item.improved, recordKey(session.id), at)
        db.prepare('UPDATE live_sessions SET outcome_json = ?, finished_at = ? WHERE id = ?').run(JSON.stringify(outcome), at, session.id)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return view(row<LiveRow>('SELECT * FROM live_sessions WHERE id = ?', session.id)!)
    })()
    pending.set(session.id, task)
    try { return await task }
    finally { if (pending.get(session.id) === task) pending.delete(session.id) }
  })

  // Taking a session away takes what it wrote into the learning record with it.
  app.delete<{ Params: { id: string } }>('/api/live/:id', async (request) => {
    db.prepare('DELETE FROM learning_events WHERE message_id = ?').run(recordKey(request.params.id))
    return { deleted: db.prepare('DELETE FROM live_sessions WHERE id = ?').run(request.params.id).changes > 0 }
  })
}
