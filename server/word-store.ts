/**
 * When a saved word comes up next, and which saved words a conversation makes room for.
 *
 * Reviews are scheduled with FSRS. A flashcard rating and a word used in conversation go through
 * the same schedule, so either one moves the next review.
 */
import { createEmptyCard, fsrs, generatorParameters, State, type Card, type Grade } from 'ts-fsrs'
import { nanoid } from 'nanoid'
import { db, row, rows } from './services/database.js'
import { clampStep, difficultyProfile } from '../shared/proficiency.js'
import { ARRANGED_AT_ONCE, type ArrangedWord, type ReviewRating, type ReviewSource, type ReviewedWord, type WordUse } from '../shared/wordbook.js'
import { rankOf, wordRanks } from './proficiency-text.js'
import { safeJson } from './utils/json.js'
import { useResult, wordUse } from './word-use.js'

const DAY = 86_400_000
/** Words the partner is asked about come from this many hours at most, so one sitting gets a couple and no more. */
const ARRANGE_WINDOW_HOURS = 20

// Intervals are left exact: a personal wordbook is too small for reviews to pile up on one day.
const scheduler = fsrs(generatorParameters({ enable_fuzz: false }))

export interface WordRow {
  id: string
  term: string
  lemma: string
  language: string
  interface_locale: string
  meaning: string
  conversation_id: string | null
  due_at: string
  interval_days: number
  ease: number
  repetitions: number
  fsrs_json: string
  created_at: string
  updated_at: string
}

interface StoredCard extends Omit<Card, 'due' | 'last_review'> {
  due: string
  last_review?: string
}

function dateOf(value: unknown) {
  const date = new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? null : date
}

export function sameLanguage(a: string, b: string) {
  return String(a || '').toLowerCase().split('-')[0] === String(b || '').toLowerCase().split('-')[0]
}

/**
 * The review card of a word. Words reviewed before FSRS carry an interval and an ease factor:
 * the interval becomes the stability, and a lower ease a higher difficulty.
 */
export function cardOf(word: Pick<WordRow, 'fsrs_json' | 'due_at' | 'interval_days' | 'ease' | 'repetitions' | 'created_at'>, now = new Date()): Card {
  const stored = safeJson<StoredCard | null>(word.fsrs_json, null)
  const storedDue = stored && typeof stored.stability === 'number' ? dateOf(stored.due) : null
  if (stored && storedDue) return { ...stored, due: storedDue, last_review: dateOf(stored.last_review) || undefined }
  const due = dateOf(word.due_at) || now
  if (!word.repetitions) return { ...createEmptyCard(dateOf(word.created_at) || due), due }
  const interval = Math.max(1, Math.round(word.interval_days || 1))
  const ease = typeof word.ease === 'number' && Number.isFinite(word.ease) ? word.ease : 2.3
  return {
    due,
    stability: interval,
    difficulty: Math.max(1, Math.min(10, 5 - (ease - 2.3) * 5)),
    elapsed_days: 0,
    scheduled_days: interval,
    learning_steps: 0,
    reps: word.repetitions,
    lapses: 0,
    state: State.Review,
    last_review: new Date(due.getTime() - interval * DAY),
  }
}

export function nextCard(card: Card, rating: ReviewRating, now = new Date()): Card {
  return scheduler.next(card, now, rating as Grade).card
}

/** In how many minutes a word would come back after each rating: what the four buttons of a flashcard say. */
export function reviewPreview(word: Parameters<typeof cardOf>[0], now = new Date()): Record<ReviewRating, number> {
  const card = cardOf(word, now)
  const minutes = (rating: ReviewRating) => Math.max(1, Math.round((nextCard(card, rating, now).due.getTime() - now.getTime()) / 60_000))
  return { 1: minutes(1), 2: minutes(2), 3: minutes(3), 4: minutes(4) }
}

/** Records one review of a word and moves its next one. Null when the word is gone. */
export function reviewWord(wordId: string, rating: ReviewRating, source: ReviewSource, options: { conversationId?: string | null; now?: Date } = {}) {
  const word = row<WordRow>('SELECT * FROM word_entries WHERE id = ?', wordId)
  if (!word) return null
  const now = options.now || new Date()
  const before = cardOf(word, now)
  const next = nextCard(before, rating, now)
  const dueAt = next.due.toISOString()
  db.prepare('UPDATE word_entries SET fsrs_json = ?, due_at = ?, interval_days = ?, repetitions = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(next), dueAt, next.scheduled_days, next.reps, now.toISOString(), wordId)
  db.prepare(`INSERT INTO word_reviews (id, word_id, language, rating, source, conversation_id, state_before, scheduled_days, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(nanoid(), wordId, word.language, rating, source, options.conversationId || null, before.state, next.scheduled_days, now.toISOString())
  return { dueAt, intervalDays: next.scheduled_days }
}

/** Saved words of one language whose review has come, the longest overdue first. */
export function dueWords(languageCode: string, now = new Date(), limit = 30): WordRow[] {
  return rows<WordRow>('SELECT * FROM word_entries WHERE due_at <= ? ORDER BY due_at, rowid LIMIT 400', now.toISOString())
    .filter((word) => sameLanguage(word.language, languageCode))
    .slice(0, limit)
}

/** Saved words of one language in the order their reviews come, due or not. */
export function wordsByDue(languageCode: string, limit = 30): WordRow[] {
  return rows<WordRow>('SELECT * FROM word_entries ORDER BY due_at, rowid LIMIT 400')
    .filter((word) => sameLanguage(word.language, languageCode))
    .slice(0, limit)
}

/** How far above the working step a saved word may sit and still be brought into conversation: two levels. */
const REACH_STEPS = 6

/**
 * Whether a word can come up in a conversation at this difficulty. A word well beyond what the
 * replies may use is left to flashcards first. Phrases, and languages without a word list, are let through.
 */
export function withinReach(word: Pick<WordRow, 'term' | 'lemma'>, languageCode: string, step: number) {
  const reach = difficultyProfile(clampStep(step + REACH_STEPS), languageCode).commonRank
  if (!reach || !wordRanks(languageCode)) return true
  const forms = [word.lemma, word.term].map((value) => String(value || '').trim()).filter(Boolean)
  if (forms.every((form) => /\s/u.test(form))) return true
  const ranks = forms.filter((form) => !/\s/u.test(form)).map((form) => rankOf(form, languageCode)).filter((rank): rank is number => typeof rank === 'number')
  return ranks.length > 0 && Math.min(...ranks) <= reach
}

interface ArrangedRow {
  word_id: string
  term: string
  meaning: string
  result: string | null
}

/** Every saved word a conversation made room for, in the order they were arranged. */
export function arrangedWords(conversationId: string, interfaceLocale?: string): ArrangedWord[] {
  return rows<ArrangedRow & { locale: string | null; current: string | null }>(`SELECT cw.word_id, cw.term, cw.meaning, cw.result, w.interface_locale AS locale, w.meaning AS current
    FROM conversation_words cw LEFT JOIN word_entries w ON w.id = cw.word_id WHERE cw.conversation_id = ? ORDER BY cw.arranged_at, cw.rowid`, conversationId)
    .map((item) => ({
      wordId: item.word_id,
      term: item.term,
      // A meaning is shown only in the interface language it is written in.
      meaning: !interfaceLocale ? item.meaning : item.locale === interfaceLocale ? String(item.current || '') : '',
      result: item.result === 'right' || item.result === 'slip' ? item.result : null,
    }))
}

export interface WaitingWord {
  wordId: string
  term: string
  lemma: string
  meaning: string
}

/** The arranged words the learner has not used yet and still keeps in the wordbook. */
export function waitingWords(conversationId: string): WaitingWord[] {
  return rows<WaitingWord>(`SELECT a.word_id AS wordId, w.term, w.lemma, w.meaning FROM conversation_words a
    JOIN word_entries w ON w.id = a.word_id
    WHERE a.conversation_id = ? AND a.used_at IS NULL ORDER BY a.arranged_at, a.rowid`, conversationId)
}

function arrange(conversationId: string, words: Array<Pick<WordRow, 'id' | 'term' | 'meaning'>>, source: 'due' | 'path' | 'story', now: Date) {
  const insert = db.prepare(`INSERT OR IGNORE INTO conversation_words (conversation_id, word_id, term, meaning, source, arranged_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
  for (const word of words) insert.run(conversationId, word.id, word.term, word.meaning, source, now.toISOString())
}

/** Words the learner chose with a story or a suggested conversation. Ones no longer in the wordbook are skipped. */
export function arrangeChosenWords(conversationId: string, wordIds: string[], source: 'path' | 'story', now = new Date()) {
  const words = [...new Set(wordIds)].flatMap((id) => {
    const word = row<WordRow>('SELECT * FROM word_entries WHERE id = ?', id)
    return word ? [word] : []
  })
  arrange(conversationId, words, source, now)
  return words.length
}

/**
 * Tops the conversation up with words whose review has come: never more than two waiting at
 * once, and no more than two added in one sitting, so a long conversation is not turned into a drill.
 */
export function arrangeDueWords(input: { conversationId: string; languageCode: string; step: number; now?: Date }) {
  const now = input.now || new Date()
  const waiting = waitingWords(input.conversationId).length
  if (waiting >= ARRANGED_AT_ONCE) return 0
  const since = new Date(now.getTime() - ARRANGE_WINDOW_HOURS * 3_600_000).toISOString()
  const recent = row<{ total: number }>("SELECT COUNT(*) AS total FROM conversation_words WHERE conversation_id = ? AND source = 'due' AND arranged_at > ?", input.conversationId, since)?.total || 0
  const room = Math.min(ARRANGED_AT_ONCE - waiting, ARRANGED_AT_ONCE - recent)
  if (room <= 0) return 0
  const taken = new Set(rows<{ word_id: string }>('SELECT word_id FROM conversation_words WHERE conversation_id = ?', input.conversationId).map((item) => item.word_id))
  const picks = dueWords(input.languageCode, now, 60)
    // A word looked up a moment ago in this very conversation is not review yet.
    .filter((word) => !taken.has(word.id) && word.conversation_id !== input.conversationId && withinReach(word, input.languageCode, input.step))
    .slice(0, room)
  arrange(input.conversationId, picks, 'due', now)
  return picks.length
}

/**
 * Looks for the waiting words in what the learner just wrote. A word used and left alone by the
 * corrections is a review remembered; one that was corrected is a review half remembered.
 */
export function recordWordUses(input: {
  conversationId: string
  messageId: string
  content: string
  corrections: Array<{ original: string; improved: string }>
  languageCode: string
  now?: Date
}): ReviewedWord[] {
  const now = input.now || new Date()
  const used: ReviewedWord[] = []
  for (const word of waitingWords(input.conversationId)) {
    const found = wordUse(input.content, word, input.languageCode)
    if (!found) continue
    const result: WordUse = useResult(found.surface, input.corrections)
    db.prepare('UPDATE conversation_words SET used_at = ?, result = ?, message_id = ? WHERE conversation_id = ? AND word_id = ?')
      .run(now.toISOString(), result, input.messageId, input.conversationId, word.wordId)
    reviewWord(word.wordId, result === 'right' ? 3 : 2, 'conversation', { conversationId: input.conversationId, now })
    used.push({ wordId: word.wordId, term: word.term, result })
  }
  return used
}
