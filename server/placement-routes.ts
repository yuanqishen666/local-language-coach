import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { getConfig } from './services/config.js'
import { tagUsage } from './ai/usage-meter.js'
import { db, row, rows } from './services/database.js'
import { TARGET_LANGUAGES, normalizeUiLocale } from '../shared/locales.js'
import {
  CEFR_LEVELS, clampStep, difficultyProfile, parseLevel, stepFromScore, stepOf,
  type CefrLevel, type ProficiencyConfidence,
} from '../shared/proficiency.js'
import type {
  ExpressionBand, ExpressionTask, PlacementKind, PlacementMode, PlacementProgress, PlacementQuestion, PlacementResult,
} from '../shared/placement.js'
import {
  expressionBand, expressionTaskAt, itemLevel, itemStep, levelsToPrepare, placementPlan, shuffleItem, type PlacementItem,
} from './placement.js'
import { placementOutcome, updateAbility, type PlacementAnswer } from './proficiency.js'
import { applyPlacement, getProfile } from './proficiency-store.js'
import { generatePlacementItems, gradePlacementExpression } from './ai/placement.js'
import { matchesExpectedLanguage } from './ai/language.js'

const MAX_ANSWER_LENGTH = 4_000
const STALE_AFTER_MS = 24 * 60 * 60 * 1000

interface CurrentQuestion {
  id: string
  kind: PlacementKind
  level?: CefrLevel
  itemId?: string
  task?: ExpressionTask
  band?: ExpressionBand
}

interface RecordedAnswer {
  kind: PlacementKind
  /** The step the question was written for. */
  step: number
  correct?: boolean
  itemId?: string
  task?: ExpressionTask
  band?: ExpressionBand
  text?: string
  skipped?: boolean
}

interface SessionState {
  startStep: number
  /** The running estimate from the choice questions, as a step. */
  ability: number
  plan: PlacementKind[]
  index: number
  current: CurrentQuestion | null
  answers: RecordedAnswer[]
  usedItemIds: string[]
  modelCalls: number
}

interface Session {
  id: string
  languageCode: string
  languageName: string
  interfaceLocale: string
  mode: PlacementMode
  status: 'active' | 'finished' | 'abandoned'
  state: SessionState
  result: PlacementResult | null
}

interface StoredItem extends PlacementItem {
  id: string
}

function failure(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code })
}

function parse<T>(value: unknown, fallback: T): T {
  try { return typeof value === 'string' && value ? JSON.parse(value) as T : fallback } catch { return fallback }
}

function loadSession(id: string): Session {
  const stored = row<Record<string, any>>('SELECT * FROM placement_sessions WHERE id = ?', id)
  if (!stored) throw failure('Placement test not found.', 404, 'PLACEMENT_NOT_FOUND')
  return {
    id: stored.id,
    languageCode: stored.language_code,
    languageName: stored.language_name,
    interfaceLocale: stored.interface_locale,
    mode: stored.mode === 'quick' ? 'quick' : 'full',
    status: stored.status,
    state: parse<SessionState>(stored.state_json, { startStep: stepOf('A2'), ability: stepOf('A2'), plan: [], index: 0, current: null, answers: [], usedItemIds: [], modelCalls: 0 }),
    result: parse<PlacementResult | null>(stored.result_json, null),
  }
}

function saveSession(session: Session, at = new Date().toISOString()) {
  db.prepare('UPDATE placement_sessions SET status = ?, state_json = ?, result_json = ?, updated_at = ? WHERE id = ?')
    .run(session.status, JSON.stringify(session.state), session.result ? JSON.stringify(session.result) : null, at, session.id)
}

function unusedItems(session: Session, kind: PlacementKind, level: CefrLevel): StoredItem[] {
  return rows<{ id: string; item_json: string }>(
    `SELECT id, item_json FROM placement_items WHERE language_code = ? AND interface_locale = ? AND level = ? AND kind = ?
     ORDER BY use_count ASC, created_at ASC`,
    session.languageCode, session.interfaceLocale, level, kind,
  )
    .filter((item) => !session.state.usedItemIds.includes(item.id))
    .map((item) => ({ id: item.id, ...parse<PlacementItem>(item.item_json, { text: '', question: '', options: [], answer: -1 }) }))
    .filter((item) => item.text && item.options.length === 4)
}

function storedItem(id: string | undefined): StoredItem | null {
  const stored = id ? row<{ id: string; item_json: string }>('SELECT id, item_json FROM placement_items WHERE id = ?', id) : undefined
  return stored ? { id: stored.id, ...parse<PlacementItem>(stored.item_json, { text: '', question: '', options: [], answer: -1 }) } : null
}

/** A question at the level asked for, from those already written when one is unused, otherwise written now. */
async function takeItem(session: Session, kind: 'reading' | 'listening', level: CefrLevel): Promise<StoredItem> {
  let stored = unusedItems(session, kind, level)
  for (let attempt = 0; !stored.length && attempt < 2; attempt += 1) {
    // The first request also writes the neighbouring levels the test is likely to need next.
    const levels = attempt === 0
      ? levelsToPrepare(level).filter((candidate, index) => index === 0 || !unusedItems(session, kind, candidate).length)
      : [level]
    const avoid = rows<{ item_json: string }>(
      'SELECT item_json FROM placement_items WHERE language_code = ? AND kind = ? ORDER BY created_at DESC LIMIT 8', session.languageCode, kind,
    ).map((item) => parse<PlacementItem | null>(item.item_json, null)?.text.slice(0, 60) || '').filter(Boolean)
    session.state.modelCalls += 1
    const written = await generatePlacementItems({
      languageCode: session.languageCode, languageName: session.languageName, interfaceLocale: session.interfaceLocale, kind, levels, avoid,
    })
    const at = new Date().toISOString()
    const insert = db.prepare('INSERT INTO placement_items (id, language_code, interface_locale, level, kind, item_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const entry of written) {
      insert.run(randomUUID(), session.languageCode, session.interfaceLocale, entry.level, kind, JSON.stringify(shuffleItem(entry.item)), at)
    }
    stored = unusedItems(session, kind, level)
  }
  if (!stored.length) {
    saveSession(session)
    throw failure('The model did not write a usable question.', 502, 'PLACEMENT_ITEM_FAILED')
  }
  const item = stored[0]
  db.prepare('UPDATE placement_items SET use_count = use_count + 1, last_used_at = ? WHERE id = ?').run(new Date().toISOString(), item.id)
  session.state.usedItemIds.push(item.id)
  return item
}

function questionPayload(session: Session, current: CurrentQuestion): PlacementQuestion {
  if (current.kind === 'expression') return { id: current.id, kind: current.kind, task: current.task, band: current.band }
  const item = storedItem(current.itemId)
  if (!item) throw failure('The question is no longer available.', 409, 'PLACEMENT_ITEM_MISSING')
  return {
    id: current.id,
    kind: current.kind,
    text: item.text,
    question: item.question,
    options: item.options,
    ...(current.kind === 'listening' && current.level
      ? { speechRateFactor: difficultyProfile(itemStep(current.level), session.languageCode).speechRateFactor }
      : {}),
  }
}

/** The question the learner is on, written or picked when there is none yet. Null after the last one. */
async function currentQuestion(session: Session): Promise<PlacementQuestion | null> {
  const state = session.state
  if (session.status !== 'active' || state.index >= state.plan.length) return null
  if (state.current && state.current.kind !== 'expression' && !storedItem(state.current.itemId)) state.current = null
  if (!state.current) {
    const kind = state.plan[state.index]
    if (kind === 'expression') {
      const position = state.plan.slice(0, state.index).filter((item) => item === 'expression').length
      state.current = { id: randomUUID(), kind, task: expressionTaskAt(session.mode, position), band: expressionBand(itemStep(itemLevel(state.ability, session.mode, state.startStep))) }
    } else {
      const level = itemLevel(state.ability, session.mode, state.startStep)
      const item = await takeItem(session, kind, level)
      state.current = { id: randomUUID(), kind, level, itemId: item.id }
    }
    saveSession(session)
  }
  return questionPayload(session, state.current)
}

function progress(session: Session, question: PlacementQuestion | null): PlacementProgress {
  return {
    sessionId: session.id,
    languageCode: session.languageCode,
    mode: session.mode,
    index: session.state.index,
    total: session.state.plan.length,
    question,
    done: session.status !== 'active' || session.state.index >= session.state.plan.length,
  }
}

const CONFIDENCE_ORDER: ProficiencyConfidence[] = ['low', 'medium', 'high']

function rounded(value: number | null | undefined) {
  return typeof value === 'number' ? clampStep(Math.round(value)) : null
}

/** Rates what was answered, writes the level and closes the test. Null when nothing was answered. */
async function finishSession(session: Session): Promise<PlacementResult | null> {
  if (session.status === 'finished') return session.result
  const state = session.state
  const answered = state.answers.filter((answer) => answer.kind !== 'expression' || answer.text)
  if (!answered.length) {
    session.status = 'abandoned'
    saveSession(session)
    return null
  }
  const choices = (kind: PlacementKind): PlacementAnswer[] => state.answers
    .filter((answer) => answer.kind === kind)
    .map((answer) => ({ step: answer.step, correct: answer.correct === true }))
  const open = state.answers
    .map((answer, index) => ({ answer, id: `answer-${index + 1}` }))
    .filter((entry) => entry.answer.kind === 'expression' && entry.answer.text)
  // An answer written in another language shows nothing of the language being tested.
  const inLanguage = open.filter((entry) => matchesExpectedLanguage(entry.answer.text!, session.languageCode))
  if (inLanguage.length) state.modelCalls += 1
  const graded = await gradePlacementExpression({
    languageCode: session.languageCode,
    languageName: session.languageName,
    interfaceLocale: session.interfaceLocale,
    answers: inLanguage.map((entry) => ({ id: entry.id, task: entry.answer.task || 'opinion', band: entry.answer.band || 'mid', text: entry.answer.text! })),
  })
  const gradeOf = (id: string) => graded.grades.find((grade) => grade.id === id)
  const outcome = placementOutcome({
    reading: choices('reading'),
    listening: choices('listening'),
    expression: open.map((entry) => gradeOf(entry.id)?.step ?? 0),
    vocabulary: inLanguage.map((entry) => gradeOf(entry.id)?.vocabulary ?? 0),
    grammar: inLanguage.map((entry) => gradeOf(entry.id)?.grammar ?? 0),
    startStep: state.startStep,
    partial: state.index < state.plan.length,
  })
  const previous = getProfile(session.languageCode)
  const quick = session.mode === 'quick'
  if (quick && previous) {
    // Five questions confirm or nudge an estimate; they do not replace it.
    const score = Number(((previous.score + outcome.score) / 2).toFixed(1))
    outcome.score = score
    outcome.step = stepFromScore(score)
    const agrees = Math.abs(outcome.step - previous.step) <= 2
    outcome.confidence = state.index < state.plan.length || !agrees
      ? 'low'
      : CONFIDENCE_ORDER[Math.max(1, CONFIDENCE_ORDER.indexOf(previous.confidence))]
  }
  const profile = applyPlacement(session.languageCode, outcome, quick)
  const result: PlacementResult = {
    sessionId: session.id,
    languageCode: session.languageCode,
    mode: session.mode,
    partial: state.index < state.plan.length,
    step: profile.step,
    score: profile.score,
    confidence: profile.confidence,
    parts: { reading: rounded(outcome.parts.reading), listening: rounded(outcome.parts.listening), expression: rounded(outcome.parts.expression) },
    skills: Object.fromEntries(Object.entries(outcome.skills).map(([skill, value]) => [skill, clampStep(Math.round(value as number))])),
    answered: outcome.answered,
    total: state.plan.length,
    evidence: graded.evidence,
    previousStep: previous ? previous.step : null,
    modelCalls: state.modelCalls,
    profile,
  }
  session.status = 'finished'
  session.result = result
  state.current = null
  saveSession(session)
  return result
}

export function registerPlacementRoutes(app: FastifyInstance) {
  app.post<{ Body: { language?: string; mode?: string; listening?: boolean; interfaceLocale?: string; startLevel?: string } }>('/api/placement', async (request) => {
    const body = request.body || {}
    const config = await getConfig()
    const requested = typeof body.language === 'string' ? body.language.trim().toLowerCase() : ''
    const language = TARGET_LANGUAGES.find((item) => item.code === requested)
      || TARGET_LANGUAGES.find((item) => item.code === config.learning.targetLanguageCode)
    if (!language) throw failure('Choose a language to learn first.', 400, 'PLACEMENT_LANGUAGE_REQUIRED')
    const profile = getProfile(language.code)
    // A short check only makes sense around an estimate that already exists.
    const mode: PlacementMode = body.mode === 'quick' && profile ? 'quick' : 'full'
    const startStep = parseLevel(body.startLevel) ?? profile?.step ?? stepOf('A2')
    const now = new Date()
    db.prepare("UPDATE placement_sessions SET status = 'abandoned', updated_at = ? WHERE status = 'active' AND updated_at < ?")
      .run(now.toISOString(), new Date(now.getTime() - STALE_AFTER_MS).toISOString())
    const session: Session = {
      id: randomUUID(),
      languageCode: language.code,
      languageName: language.name,
      interfaceLocale: normalizeUiLocale(body.interfaceLocale, config.ui.locale),
      mode,
      status: 'active',
      state: {
        startStep,
        ability: startStep,
        plan: placementPlan(mode, body.listening === true),
        index: 0,
        current: null,
        answers: [],
        usedItemIds: [],
        modelCalls: 0,
      },
      result: null,
    }
    db.prepare(`INSERT INTO placement_sessions (id, language_code, language_name, interface_locale, mode, status, state_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`)
      .run(session.id, session.languageCode, session.languageName, session.interfaceLocale, session.mode, JSON.stringify(session.state), now.toISOString(), now.toISOString())
    tagUsage({ sessionId: session.id })
    return progress(session, await currentQuestion(session))
  })

  // Also the way back in after a reload or a failed request: the question in hand is returned again.
  app.get<{ Params: { id: string } }>('/api/placement/:id', async (request) => {
    const session = loadSession(request.params.id)
    return { ...progress(session, await currentQuestion(session)), result: session.result }
  })

  app.post<{ Params: { id: string }; Body: { questionId?: string; choice?: number | null; text?: string } }>('/api/placement/:id/answer', async (request) => {
    const session = loadSession(request.params.id)
    if (session.status !== 'active') throw failure('This test is already closed.', 409, 'PLACEMENT_CLOSED')
    const state = session.state
    const current = state.current
    const body = request.body || {}
    // A repeated request for a question already answered changes nothing.
    if (current && body.questionId === current.id) {
      if (current.kind === 'expression') {
        const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_ANSWER_LENGTH) : ''
        state.answers.push({ kind: current.kind, step: clampStep(Math.round(state.ability)), task: current.task, band: current.band, text, skipped: !text })
      } else {
        const item = storedItem(current.itemId)
        const choice = typeof body.choice === 'number' && Number.isInteger(body.choice) ? body.choice : null
        const step = itemStep(current.level || CEFR_LEVELS[1])
        // "Not sure" counts as wrong, without the luck of a guess.
        const correct = Boolean(item) && choice !== null && choice === item!.answer
        const before = state.answers.filter((answer) => answer.kind !== 'expression').length
        state.ability = updateAbility(state.ability, { step, correct }, before)
        state.answers.push({ kind: current.kind, step, correct, itemId: current.itemId, skipped: choice === null })
      }
      state.index += 1
      state.current = null
      saveSession(session)
    }
    return progress(session, await currentQuestion(session))
  })

  app.post<{ Params: { id: string } }>('/api/placement/:id/finish', async (request) => {
    const session = loadSession(request.params.id)
    return { result: await finishSession(session) }
  })
}
