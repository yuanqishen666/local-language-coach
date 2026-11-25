import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { getConfig } from './services/config.js'
import { db, perDatabase, row, rows } from './services/database.js'
import { conversationErrors, isPatternNoted, noteErrorPattern, recordPractice, recurringErrors } from './services/memory-store.js'
import { normalizeUiLocale } from '../shared/locales.js'
import { clampStep, replyStep } from '../shared/proficiency.js'
import { isErrorCategory, type ErrorCategory } from '../shared/memory.js'
import { RECAP_MIN_TURNS } from '../shared/recap.js'
import { safeJson } from './utils/json.js'
import { normalizeConversationSetup } from './ai/context.js'
import { localizeInterfaceValues } from './ai/engine.js'
import { matchesExpectedConversationLanguage } from './ai/language.js'
import { GAP, gradeRewrite, plain, writePracticeItems, writeRecap, type GapItem, type Mistake, type RecapDraft } from './ai/recap.js'
import { conversationLearning } from './conversation-help-routes.js'
import { assessConversation, conversationDifficulty, getAssessment, recordExpression } from './proficiency-store.js'
import type { LevelChange } from './proficiency.js'
import { arrangedWords } from './word-store.js'

/** Fewer answers than this and there is too little to say anything about. */
const TRANSCRIPT_MESSAGES = 60
const LINE_MAX_LENGTH = 500
const PRACTICE_ITEMS = 3
const ANSWER_MAX_LENGTH = 400
/** Kinds of fault that leave the sentence correct: the task is to say it better, not to fix it. */
const REPHRASE_CATEGORIES: ErrorCategory[] = ['register', 'phrasing', 'collocation', 'word_choice']

function failure(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code })
}

interface StoredRecap {
  good: RecapDraft['good']
  pattern: { category: ErrorCategory; comment: string; examples: Array<{ original: string; improved: string }>; recurring: boolean } | null
  takeaway: (NonNullable<RecapDraft['takeaway']> & { wordId: string | null }) | null
  expression: RecapDraft['expression']
  /** The same wording in other interface languages, written when first asked for. */
  localized?: Record<string, Record<string, string>>
}

interface RecapRow {
  conversation_id: string
  language_code: string
  interface_locale: string
  last_message_id: string | null
  content_json: string
  created_at: string
  updated_at: string
}

interface RewriteItem {
  kind: 'rewrite'
  category: ErrorCategory
  task: 'fix' | 'rephrase'
  sentence: string
  model: string
}

type PracticeItem = (GapItem | RewriteItem) & { id: string }

interface PracticeAnswer {
  right: boolean
  /** What the learner chose or wrote. */
  given: string
  /** How it should read. */
  answer: string
  explanation: string
}

interface PracticeRow {
  id: string
  conversation_id: string | null
  language_code: string
  interface_locale: string
  items_json: string
  answers_json: string
}

function lastMessageId(conversationId: string) {
  return row<{ id: string }>("SELECT id FROM messages WHERE conversation_id = ? AND status = 'complete' ORDER BY created_at DESC, rowid DESC LIMIT 1", conversationId)?.id || null
}

function learnerTurns(conversationId: string) {
  return row<{ total: number }>("SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ? AND role = 'user' AND status = 'complete'", conversationId)?.total || 0
}

function transcript(conversationId: string) {
  return rows<{ role: string; content: string }>(`SELECT role, content FROM (
      SELECT role, content, created_at, rowid AS position FROM messages WHERE conversation_id = ? AND status = 'complete' AND role IN ('user', 'assistant')
      ORDER BY created_at DESC, rowid DESC LIMIT ?
    ) ORDER BY created_at, position`, conversationId, TRANSCRIPT_MESSAGES)
    .map((message) => ({ who: message.role === 'user' ? 'learner' as const : 'partner' as const, text: message.content.slice(0, LINE_MAX_LENGTH) }))
}

/** The mistakes worth practising: this conversation's first, then one example of each kind the learner keeps making. */
function mistakesFor(conversationId: string, languageCode: string, currentLanguageCode: string): Mistake[] {
  const here = conversationErrors(conversationId)
  const seen = new Set(here.map((mistake) => plain(mistake.original)))
  const elsewhere = recurringErrors(languageCode, currentLanguageCode).filter((mistake) => !seen.has(plain(mistake.original)))
  return [...here, ...elsewhere].filter((mistake) => mistake.original && mistake.improved && plain(mistake.original) !== plain(mistake.improved))
}

/** The texts of a recap that are written in the interface language, by a stable name. */
function interfaceTexts(content: StoredRecap) {
  return {
    goodComment: content.good?.comment || '',
    patternComment: content.pattern?.comment || '',
    takeawayMeaning: content.takeaway?.meaning || '',
    takeawayComment: content.takeaway?.comment || '',
    expressionReason: content.expression?.reason || '',
  }
}

export function registerRecapRoutes(app: FastifyInstance) {
  const running = perDatabase(() => new Map<string, Promise<unknown>>())
  function once<T>(key: string, work: () => Promise<T>): Promise<T> {
    // Shared with the same learner's own requests only: the answer is theirs.
    const underWay = running()
    const current = underWay.get(key) as Promise<T> | undefined
    if (current) return current
    const task = work().finally(() => { if (underWay.get(key) === task) underWay.delete(key) })
    underWay.set(key, task)
    return task
  }

  async function context(conversationId: string, interfaceLocale?: string) {
    const conversation = row<Record<string, any>>('SELECT * FROM conversations WHERE id = ?', conversationId)
    if (!conversation) throw failure('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
    const current = await getConfig()
    const learning = conversationLearning(conversation, current)
    return { conversation, current, learning, code: learning.targetLanguageCode, locale: normalizeUiLocale(interfaceLocale, current.ui.locale) }
  }

  /** The recap as the page shows it, in the interface language asked for. */
  async function view(stored: RecapRow, locale: string, input: { code: string; currentCode: string }) {
    const content = safeJson<StoredRecap>(stored.content_json, { good: null, pattern: null, takeaway: null, expression: null })
    let texts: Record<string, string> = interfaceTexts(content)
    if (stored.interface_locale !== locale) {
      const cached = content.localized?.[locale]
      if (cached) texts = { ...texts, ...cached }
      else {
        const items = Object.entries(texts).filter(([, value]) => value).map(([id, value]) => ({ id, value }))
        try {
          const localized = Object.fromEntries((await localizeInterfaceValues(items, locale)).map((item) => [item.id, item.value]))
          content.localized = { ...content.localized, [locale]: localized }
          db.prepare('UPDATE conversation_recaps SET content_json = ? WHERE conversation_id = ?').run(JSON.stringify(content), stored.conversation_id)
          texts = { ...texts, ...localized }
        } catch {
          // Shown as it was written rather than not at all.
        }
      }
    }
    const assessment = getAssessment(stored.conversation_id)
    const wordId = content.takeaway?.wordId && row<{ id: string }>('SELECT id FROM word_entries WHERE id = ?', content.takeaway.wordId) ? content.takeaway.wordId : null
    return {
      conversationId: stored.conversation_id,
      languageCode: stored.language_code,
      createdAt: stored.updated_at,
      /** The conversation went on after this was written. */
      stale: stored.last_message_id !== lastMessageId(stored.conversation_id),
      arranged: arrangedWords(stored.conversation_id, locale),
      good: content.good ? { quote: content.good.quote, comment: texts.goodComment } : null,
      pattern: content.pattern
        ? { ...content.pattern, comment: texts.patternComment, noted: isPatternNoted(input.code, content.pattern.category) }
        : null,
      takeaway: content.takeaway
        ? { original: content.takeaway.original, improved: content.takeaway.improved, meaning: texts.takeawayMeaning, comment: texts.takeawayComment, wordId }
        : null,
      expression: content.expression ? { step: content.expression.step, reason: texts.expressionReason } : null,
      session: assessment
        ? {
            startStep: assessment.baseStep,
            endStep: clampStep(assessment.baseStep + assessment.stats.finalOffset),
            // Too short a conversation says nothing about how it went.
            verdict: assessment.valid ? assessment.verdict : null,
            turns: assessment.stats.turns,
            help: { lookups: assessment.stats.lookups, translations: assessment.stats.translations, simpler: assessment.stats.simpler, slower: assessment.stats.slower, hints: assessment.stats.hints },
          }
        : null,
      practice: mistakesFor(stored.conversation_id, input.code, input.currentCode).length > 0,
    }
  }

  function recapRow(conversationId: string) {
    return row<RecapRow>('SELECT * FROM conversation_recaps WHERE conversation_id = ?', conversationId)
  }

  app.get<{ Params: { id: string }; Querystring: { interfaceLocale?: string } }>('/api/conversations/:id/recap', async (request) => {
    const { conversation, current, code, locale } = await context(request.params.id, request.query.interfaceLocale)
    const stored = recapRow(conversation.id)
    return {
      available: learnerTurns(conversation.id) >= RECAP_MIN_TURNS,
      recap: stored ? await view(stored, locale, { code, currentCode: current.learning.targetLanguageCode }) : null,
    }
  })

  // Written when the learner asks for it: one model call, and none when nothing was said since the last one.
  app.post<{ Params: { id: string }; Body: { interfaceLocale?: string } }>('/api/conversations/:id/recap', async (request) => {
    const { conversation, current, learning, code, locale } = await context(request.params.id, request.body?.interfaceLocale)
    if (learnerTurns(conversation.id) < RECAP_MIN_TURNS) throw failure('The conversation is too short to look back on.', 409, 'RECAP_TOO_SHORT')
    const viewInput = { code, currentCode: current.learning.targetLanguageCode }
    return once(`recap:${conversation.id}`, async () => {
      const assessed = assessConversation({ conversationId: conversation.id, languageCode: code, fallbackProficiency: current.learning.proficiency })
      const last = lastMessageId(conversation.id)
      const existing = recapRow(conversation.id)
      if (existing && existing.last_message_id === last) return { recap: await view(existing, locale, viewInput), changes: assessed.changes }
      const mistakes = conversationErrors(conversation.id)
      const recurring = recurringErrors(code, current.learning.targetLanguageCode).map((mistake) => mistake.category)
      const setup = normalizeConversationSetup(safeJson(conversation.setup_json, null))
      const draft = await writeRecap({
        languageCode: code,
        languageName: learning.targetLanguage,
        interfaceLocale: locale,
        scene: setup ? [setup.title, setup.setting].filter(Boolean).join(' — ') : '',
        lines: transcript(conversation.id),
        mistakes,
        recurring,
      })
      const changes: LevelChange[] = [...assessed.changes]
      if (draft.expression) changes.push(...recordExpression({ conversationId: conversation.id, languageCode: code, step: draft.expression.step }))
      // The kind of mistake named is one the corrections really hold; without one from the model, the most frequent stands in.
      const counted = new Map<string, number>()
      for (const mistake of mistakes) if (mistake.category !== 'other') counted.set(mistake.category, (counted.get(mistake.category) || 0) + 1)
      const commonest = [...counted.entries()].sort((left, right) => right[1] - left[1] || Number(recurring.includes(right[0])) - Number(recurring.includes(left[0])))[0]?.[0]
      const category = draft.pattern?.category || (isErrorCategory(commonest) ? commonest : undefined)
      const content: StoredRecap = {
        good: draft.good,
        pattern: category
          ? {
              category,
              comment: draft.pattern?.comment || '',
              examples: mistakes.filter((mistake) => mistake.category === category).slice(0, 2).map((mistake) => ({ original: mistake.original, improved: mistake.improved })),
              recurring: recurring.includes(category),
            }
          : null,
        takeaway: draft.takeaway ? { ...draft.takeaway, wordId: null } : null,
        expression: draft.expression,
      }
      const now = new Date().toISOString()
      db.prepare(`INSERT INTO conversation_recaps (conversation_id, language_code, interface_locale, last_message_id, content_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(conversation_id) DO UPDATE SET language_code = excluded.language_code, interface_locale = excluded.interface_locale,
          last_message_id = excluded.last_message_id, content_json = excluded.content_json, updated_at = excluded.updated_at`)
        .run(conversation.id, code, locale, last, JSON.stringify(content), now, now)
      return { recap: await view(recapRow(conversation.id)!, locale, viewInput), changes }
    })
  })

  // The learner keeps the expression: only now does it go into the wordbook.
  app.post<{ Params: { id: string }; Body: { interfaceLocale?: string } }>('/api/conversations/:id/recap/takeaway', async (request) => {
    const { conversation, code, locale } = await context(request.params.id, request.body?.interfaceLocale)
    const stored = recapRow(conversation.id)
    const content = stored ? safeJson<StoredRecap | null>(stored.content_json, null) : null
    if (!stored || !content?.takeaway) throw failure('There is no expression to keep.', 404, 'RECAP_TAKEAWAY_MISSING')
    const kept = content.takeaway.wordId ? row<{ id: string }>('SELECT id FROM word_entries WHERE id = ?', content.takeaway.wordId) : undefined
    if (kept) return { wordId: kept.id }
    const takeaway = content.takeaway
    // The word is kept with the wording of the interface language it is saved in.
    const texts = stored.interface_locale === locale ? interfaceTexts(content) : { ...interfaceTexts(content), ...content.localized?.[locale] }
    const wordLocale = stored.interface_locale === locale || content.localized?.[locale] ? locale : stored.interface_locale
    const id = nanoid()
    const now = new Date().toISOString()
    const details = { lemma: takeaway.improved, contextMeaning: texts.takeawayMeaning, note: texts.takeawayComment, original: takeaway.original, senses: [], source: 'recap' }
    db.prepare('INSERT INTO word_entries (id, term, lemma, language, interface_locale, meaning, details_json, source_sentence, conversation_id, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, takeaway.improved, takeaway.improved, code, wordLocale, texts.takeawayMeaning, JSON.stringify(details), takeaway.original || null, conversation.id, now, now, now)
    content.takeaway = { ...takeaway, wordId: id }
    db.prepare('UPDATE conversation_recaps SET content_json = ? WHERE conversation_id = ?').run(JSON.stringify(content), conversation.id)
    return { wordId: id }
  })

  // The learner asks for the kind of mistake to be kept in view: only now is it marked in the learning record.
  app.post<{ Params: { id: string } }>('/api/conversations/:id/recap/pattern', async (request) => {
    const { conversation, code } = await context(request.params.id)
    const content = safeJson<StoredRecap | null>(recapRow(conversation.id)?.content_json, null)
    if (!content?.pattern) throw failure('There is no kind of mistake to mark.', 404, 'RECAP_PATTERN_MISSING')
    noteErrorPattern({ targetLanguageCode: code, category: content.pattern.category, example: content.pattern.examples[0], conversationId: conversation.id })
    return { noted: true }
  })

  function practiceView(set: PracticeRow) {
    const items = safeJson<PracticeItem[]>(set.items_json, [])
    const answers = safeJson<Record<string, PracticeAnswer>>(set.answers_json, {})
    return {
      id: set.id,
      conversationId: set.conversation_id,
      languageCode: set.language_code,
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        category: item.category,
        sentence: item.sentence,
        ...(item.kind === 'gap' ? { options: item.options } : { task: item.task }),
        result: answers[item.id] || null,
      })),
      done: items.every((item) => answers[item.id]),
      right: items.filter((item) => answers[item.id]?.right).length,
    }
  }

  // Three questions on the learner's own mistakes. One model call writes the two with choices; the third is one of their own sentences.
  app.post<{ Params: { id: string }; Body: { interfaceLocale?: string } }>('/api/conversations/:id/practice', async (request) => {
    const { conversation, current, learning, code, locale } = await context(request.params.id, request.body?.interfaceLocale)
    return once(`practice:${conversation.id}`, async () => {
      const open = rows<PracticeRow>('SELECT * FROM practice_sets WHERE conversation_id = ? AND interface_locale = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', conversation.id, locale)[0]
      if (open && !practiceView(open).done) return { practice: practiceView(open) }
      const mistakes = mistakesFor(conversation.id, code, current.learning.targetLanguageCode)
      if (!mistakes.length) throw failure('There are no mistakes to practise.', 409, 'PRACTICE_NOTHING')
      // The sentence to put right is the learner's own, in the language being learned; the choices are built on the other mistakes.
      const own = mistakes.find((mistake) => matchesExpectedConversationLanguage(mistake.original, code))
      const others = mistakes.filter((mistake) => mistake !== own)
      const forGaps = (others.length ? others : mistakes).slice(0, PRACTICE_ITEMS - (own ? 1 : 0))
      const step = replyStep(conversationDifficulty(conversation.id, code, current.learning.proficiency))
      const gaps = await writePracticeItems({
        languageCode: code, languageName: learning.targetLanguage, interfaceLocale: locale,
        mistakes: forGaps, step, count: Math.min(forGaps.length, PRACTICE_ITEMS - (own ? 1 : 0)),
      })
      const items: PracticeItem[] = gaps.map((item) => ({ ...item, id: nanoid(8) }))
      if (own) {
        const category = isErrorCategory(own.category) ? own.category : 'other'
        items.push({ id: nanoid(8), kind: 'rewrite', category, task: REPHRASE_CATEGORIES.includes(category) ? 'rephrase' : 'fix', sentence: own.original, model: own.improved })
      }
      const id = nanoid()
      const now = new Date().toISOString()
      db.prepare('INSERT INTO practice_sets (id, conversation_id, language_code, interface_locale, items_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, conversation.id, code, locale, JSON.stringify(items), now, now)
      return { practice: practiceView(row<PracticeRow>('SELECT * FROM practice_sets WHERE id = ?', id)!) }
    })
  })

  app.get<{ Params: { id: string } }>('/api/practice/:id', async (request) => {
    const set = row<PracticeRow>('SELECT * FROM practice_sets WHERE id = ?', request.params.id)
    if (!set) throw failure('Practice not found', 404, 'PRACTICE_NOT_FOUND')
    return { practice: practiceView(set) }
  })

  // A choice is checked here; a rewritten sentence that is neither the model answer nor plainly wrong is marked by the model.
  app.post<{ Params: { id: string }; Body: { itemId?: string; choice?: number; text?: string } }>('/api/practice/:id/answer', async (request) => {
    const set = row<PracticeRow>('SELECT * FROM practice_sets WHERE id = ?', request.params.id)
    if (!set) throw failure('Practice not found', 404, 'PRACTICE_NOT_FOUND')
    const items = safeJson<PracticeItem[]>(set.items_json, [])
    const item = items.find((candidate) => candidate.id === request.body?.itemId)
    if (!item) throw failure('That question is not part of this practice.', 400, 'PRACTICE_ITEM_INVALID')
    return once(`answer:${set.id}:${item.id}`, async () => {
      const answers = safeJson<Record<string, PracticeAnswer>>(row<{ answers_json: string }>('SELECT answers_json FROM practice_sets WHERE id = ?', set.id)?.answers_json, {})
      if (answers[item.id]) return { result: answers[item.id], practice: practiceView({ ...set, answers_json: JSON.stringify(answers) }) }
      let result: PracticeAnswer
      if (item.kind === 'gap') {
        const choice = request.body?.choice
        if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= item.options.length) throw failure('Choose one of the answers.', 400, 'PRACTICE_CHOICE_INVALID')
        result = { right: choice === item.answer, given: item.options[choice], answer: item.sentence.replace(GAP, item.options[item.answer]), explanation: item.explanation }
      } else {
        const given = typeof request.body?.text === 'string' ? request.body.text.trim().slice(0, ANSWER_MAX_LENGTH) : ''
        if (!given) throw failure('Write an answer first.', 400, 'PRACTICE_ANSWER_REQUIRED')
        if (plain(given) === plain(item.model)) result = { right: true, given, answer: item.model, explanation: '' }
        // The sentence copied back, or an answer in another language, has not put the fault right.
        else if (plain(given) === plain(item.sentence) || !matchesExpectedConversationLanguage(given, set.language_code)) result = { right: false, given, answer: item.model, explanation: '' }
        else {
          const config = await getConfig()
          const languageName = set.conversation_id
            ? conversationLearning(row<Record<string, any>>('SELECT * FROM conversations WHERE id = ?', set.conversation_id) || {}, config).targetLanguage
            : config.learning.targetLanguage
          const graded = await gradeRewrite({ languageCode: set.language_code, languageName, interfaceLocale: set.interface_locale, sentence: item.sentence, model: item.model, answer: given })
          result = { right: graded.right, given, answer: graded.right ? graded.improved : item.model, explanation: graded.comment }
        }
      }
      answers[item.id] = result
      db.prepare('UPDATE practice_sets SET answers_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(answers), new Date().toISOString(), set.id)
      // Written back to the learning record: a right answer makes this kind of mistake weigh less.
      recordPractice({ targetLanguageCode: set.language_code, category: item.category, right: result.right, sentence: item.sentence, answer: result.answer, conversationId: set.conversation_id })
      return { result, practice: practiceView({ ...set, answers_json: JSON.stringify(answers) }) }
    })
  })
}
