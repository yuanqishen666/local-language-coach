/**
 * What the learner has done, counted from what is already kept: their own messages, the
 * corrections, the saved words they used, and the level history. Nothing here is a streak or a
 * target, and no request is made to a model.
 */
import type { FastifyInstance } from 'fastify'
import { getConfig } from './services/config.js'
import { rows } from './services/database.js'
import { textLength } from './proficiency-text.js'
import { clampStep, lengthRule } from '../shared/proficiency.js'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const WEEK = 7 * DAY

/** How many weeks the activity grid covers, the current one included. */
export const PROGRESS_WEEKS = 26
/** A kind of mistake has to have shown up this often before "fewer of it" means anything. */
const FEWER_MIN_BEFORE = 2
/** And the learner has to have written this much in the later week, or it only means they wrote less. */
const FEWER_MIN_MESSAGES = 5
const FIRST_USED_LIMIT = 12

function languageKey(code: string) {
  return String(code || '').trim().toLowerCase().split(/[-_]/u)[0]
}

function clockOffset(value: unknown) {
  const offset = Number(value)
  return Number.isFinite(offset) && Math.abs(offset) <= 16 * 60 ? Math.round(offset) : 0
}

/** The calendar day an instant falls on, on a clock `offsetMinutes` behind UTC (what Date#getTimezoneOffset gives). */
export function localDay(at: string | number, offsetMinutes: number) {
  return new Date((typeof at === 'number' ? at : Date.parse(at)) - offsetMinutes * MINUTE).toISOString().slice(0, 10)
}

/** The instant the learner's week began: Monday, midnight, on their clock. */
export function weekStart(now: Date, offsetMinutes: number) {
  const local = new Date(now.getTime() - offsetMinutes * MINUTE)
  const sinceMonday = (local.getUTCDay() + 6) % 7
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - sinceMonday * DAY + offsetMinutes * MINUTE
}

interface Written { at: number; amount: number; conversationId: string }

function weekOf(written: Written[], from: number, offsetMinutes: number) {
  const inWeek = written.filter((item) => item.at >= from && item.at < from + WEEK)
  return {
    from: new Date(from).toISOString(),
    to: new Date(from + WEEK).toISOString(),
    messages: inWeek.length,
    amount: inWeek.reduce((total, item) => total + item.amount, 0),
    conversations: new Set(inWeek.map((item) => item.conversationId)).size,
    days: new Set(inWeek.map((item) => localDay(item.at, offsetMinutes))).size,
  }
}

/**
 * The kind of mistake that fell the most between two weeks, per message written. Null when no
 * kind was frequent enough before, or the learner wrote too little after, for the drop to mean anything.
 */
export function fewerMistakes(
  before: { messages: number; errors: Record<string, number> },
  after: { messages: number; errors: Record<string, number> },
) {
  if (before.messages < FEWER_MIN_MESSAGES || after.messages < FEWER_MIN_MESSAGES) return null
  let best: { category: string; before: number; now: number; drop: number } | null = null
  for (const [category, count] of Object.entries(before.errors)) {
    if (category === 'other' || count < FEWER_MIN_BEFORE) continue
    const now = after.errors[category] || 0
    const drop = count / before.messages - now / after.messages
    if (drop <= 0 || now / after.messages > count / before.messages * 0.6) continue
    if (!best || drop > best.drop) best = { category, before: count, now, drop }
  }
  return best ? { category: best.category, before: best.before, now: best.now } : null
}

export function progressFor(languageCode: string, now = new Date(), offsetMinutes = 0) {
  const code = languageKey(languageCode)
  const thisWeek = weekStart(now, offsetMinutes)
  const gridFrom = thisWeek - (PROGRESS_WEEKS - 1) * WEEK
  const since = new Date(gridFrom).toISOString()
  // A conversation from before languages were recorded counts for whichever language is asked about.
  const scope = "(c.target_language_code = '' OR LOWER(c.target_language_code) = ? OR LOWER(c.target_language_code) LIKE ?)"
  const scopeValues = [code, `${code}-%`]

  const written: Written[] = rows<{ content: string; at: string; conversationId: string }>(
    `SELECT m.content AS content, m.created_at AS at, m.conversation_id AS conversationId
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.role = 'user' AND m.status = 'complete' AND m.created_at >= ? AND ${scope}`, since, ...scopeValues,
  ).map((item) => ({ at: Date.parse(item.at), amount: textLength(item.content, code), conversationId: item.conversationId }))
    .filter((item) => Number.isFinite(item.at))

  const byDay = new Map<string, { messages: number; amount: number }>()
  for (const item of written) {
    const day = localDay(item.at, offsetMinutes)
    const entry = byDay.get(day) || { messages: 0, amount: 0 }
    entry.messages += 1
    entry.amount += item.amount
    byDay.set(day, entry)
  }

  const errors = rows<{ category: string; at: string }>(
    "SELECT category, created_at AS at FROM learning_events WHERE kind = 'error' AND created_at >= ? AND (LOWER(target_language_code) = ? OR LOWER(target_language_code) LIKE ?)",
    new Date(thisWeek - 2 * WEEK).toISOString(), ...scopeValues,
  )
  const errorsIn = (from: number) => {
    const counted: Record<string, number> = {}
    for (const item of errors) {
      const at = Date.parse(item.at)
      if (at >= from && at < from + WEEK) counted[item.category] = (counted[item.category] || 0) + 1
    }
    return counted
  }

  // A saved word counts as first used in the week of the earliest message it appears in.
  const firstUses = rows<{ wordId: string; term: string; meaning: string; first: string }>(
    `SELECT w.word_id AS wordId, w.term AS term, w.meaning AS meaning, MIN(w.used_at) AS first
       FROM conversation_words w JOIN conversations c ON c.id = w.conversation_id
      WHERE w.used_at IS NOT NULL AND ${scope} GROUP BY w.word_id ORDER BY first DESC`, ...scopeValues,
  )
  const firstUsedIn = (from: number) => firstUses
    .filter((item) => Date.parse(item.first) >= from && Date.parse(item.first) < from + WEEK)
    .slice(0, FIRST_USED_LIMIT).map((item) => ({ term: item.term, meaning: item.meaning }))

  const summary = (from: number) => {
    const week = weekOf(written, from, offsetMinutes)
    const previous = weekOf(written, from - WEEK, offsetMinutes)
    return {
      ...week,
      previous: { messages: previous.messages, amount: previous.amount },
      firstUsed: firstUsedIn(from),
      fewer: fewerMistakes({ messages: previous.messages, errors: errorsIn(from - WEEK) }, { messages: week.messages, errors: errorsIn(from) }),
    }
  }

  const level = rows<{ step: number; at: string; reason: string }>(
    "SELECT to_step AS step, created_at AS at, reason FROM proficiency_history WHERE language_code = ? AND kind = 'estimate' ORDER BY created_at, rowid LIMIT 400", code,
  ).map((item) => ({ at: item.at, step: clampStep(item.step), reason: item.reason }))

  return {
    languageCode: code,
    unit: lengthRule(code).unit,
    weeks: PROGRESS_WEEKS,
    from: since,
    today: localDay(now.getTime(), offsetMinutes),
    days: [...byDay.entries()].sort(([left], [right]) => left < right ? -1 : 1).map(([date, value]) => ({ date, ...value })),
    week: summary(thisWeek),
    lastWeek: summary(thisWeek - WEEK),
    level,
  }
}

export function registerProgressRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { language?: string; offset?: string } }>('/api/progress', async (request) => {
    const current = await getConfig()
    return progressFor(request.query.language || current.learning.targetLanguageCode, new Date(), clockOffset(request.query.offset))
  })
}
