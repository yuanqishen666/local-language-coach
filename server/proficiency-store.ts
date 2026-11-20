/**
 * Where level profiles, their history, per-turn signals and conversation verdicts are kept.
 * The rules themselves are in proficiency.ts; this file reads and writes what they work on.
 */
import { randomUUID } from 'node:crypto'
import { db, row, rows } from './services/database.js'
import {
  PROFICIENCY_SKILLS, clampScore, clampStep, emptySkills, normalizeConversationDifficulty, parseLevel, replyStep,
  scoreOfStep, startingDifficulty, stepFromScore, stepOf,
  type ConversationDifficulty, type ConversationVerdict, type ProficiencyChange, type ProficiencyChangeKind,
  type ProficiencyChangeReason, type ProficiencyConfidence, type ProficiencyProfile, type ProficiencySkill,
  type ProficiencySource, type SkillEstimate,
} from '../shared/proficiency.js'
import {
  CONVERSATION_SKILL_WEIGHT, MAX_AHEAD, confidenceFor, conversationStats, decideAdjustment, helpLowersDifficulty,
  judgeConversation, lowerConversation, mergeSkills, observeSkill, skillObservations,
  type AssessedConversation, type ConversationStats, type HelpKind, type LevelChange, type PlacementOutcome, type TurnSignal,
} from './proficiency.js'

interface ProfileRow {
  language_code: string
  score: number
  working_step: number
  confidence: string
  skills_json: string
  source: string
  locked: number
  tested_at: string | null
  tested_step: number | null
  created_at: string
  updated_at: string
}

function languageKey(languageCode: string) {
  return String(languageCode || '').trim().toLowerCase().split(/[-_]/u)[0]
}

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function readSkills(value: string, score: number): Record<ProficiencySkill, SkillEstimate> {
  const stored = parseJson(value)
  const source = stored && typeof stored === 'object' ? stored as Record<string, { score?: unknown; evidence?: unknown }> : {}
  const skills = emptySkills(score)
  for (const skill of PROFICIENCY_SKILLS) {
    const item = source[skill]
    if (!item || typeof item !== 'object') continue
    const itemScore = Number(item.score)
    const evidence = Number(item.evidence)
    if (Number.isFinite(itemScore)) skills[skill] = { score: clampScore(itemScore), evidence: Number.isFinite(evidence) ? Math.max(0, Math.round(evidence)) : 0 }
  }
  return skills
}

function toProfile(value: ProfileRow): ProficiencyProfile {
  const score = clampScore(value.score)
  return {
    languageCode: value.language_code,
    score,
    step: stepFromScore(score),
    workingStep: clampStep(value.working_step),
    confidence: (['low', 'medium', 'high'].includes(value.confidence) ? value.confidence : 'low') as ProficiencyConfidence,
    skills: readSkills(value.skills_json, score),
    source: (['self', 'test', 'assessment', 'manual'].includes(value.source) ? value.source : 'self') as ProficiencySource,
    locked: value.locked === 1,
    testedAt: value.tested_at,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  }
}

export function getProfile(languageCode: string): ProficiencyProfile | null {
  const value = row<ProfileRow>('SELECT * FROM proficiency_profiles WHERE language_code = ?', languageKey(languageCode))
  return value ? toProfile(value) : null
}

export function listProfiles(): ProficiencyProfile[] {
  return rows<ProfileRow>('SELECT * FROM proficiency_profiles ORDER BY updated_at DESC').map(toProfile)
}

function writeProfile(profile: ProficiencyProfile, extra: { testedStep?: number | null } = {}) {
  db.prepare(`INSERT INTO proficiency_profiles (language_code, score, working_step, confidence, skills_json, source, locked, tested_at, tested_step, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(language_code) DO UPDATE SET score = excluded.score, working_step = excluded.working_step, confidence = excluded.confidence,
      skills_json = excluded.skills_json, source = excluded.source, locked = excluded.locked, tested_at = excluded.tested_at,
      tested_step = COALESCE(excluded.tested_step, proficiency_profiles.tested_step), updated_at = excluded.updated_at`)
    .run(languageKey(profile.languageCode), profile.score, profile.workingStep, profile.confidence, JSON.stringify(profile.skills), profile.source,
      profile.locked ? 1 : 0, profile.testedAt, extra.testedStep ?? null, profile.createdAt, profile.updatedAt)
}

function addHistory(languageCode: string, kind: ProficiencyChangeKind, fromStep: number | null, toStep: number, reason: ProficiencyChangeReason, evidence: Record<string, number | string>, at: string) {
  if (fromStep !== null && fromStep === toStep) return
  db.prepare('INSERT INTO proficiency_history (id, language_code, kind, from_step, to_step, reason, evidence_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), languageKey(languageCode), kind, fromStep, toStep, reason, JSON.stringify(evidence), at)
}

export function profileHistory(languageCode: string, limit = 40): ProficiencyChange[] {
  return rows<{ id: string; language_code: string; kind: string; from_step: number | null; to_step: number; reason: string; evidence_json: string; created_at: string }>(
    'SELECT * FROM proficiency_history WHERE language_code = ? ORDER BY created_at DESC, rowid DESC LIMIT ?', languageKey(languageCode), limit,
  ).map((item) => ({
    id: item.id,
    languageCode: item.language_code,
    kind: item.kind === 'difficulty' ? 'difficulty' : 'estimate',
    fromStep: item.from_step,
    toStep: item.to_step,
    reason: item.reason as ProficiencyChangeReason,
    evidence: (parseJson(item.evidence_json) as Record<string, number | string>) || {},
    createdAt: item.created_at,
  }))
}

function lastChangeAt(languageCode: string, kind: ProficiencyChangeKind) {
  return row<{ created_at: string }>('SELECT created_at FROM proficiency_history WHERE language_code = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', languageKey(languageCode), kind)?.created_at || null
}

/** The learner picked a level, at the start or later by hand. Everything restarts from it. */
export function chooseLevel(languageCode: string, step: number, source: 'self' | 'manual', at = new Date().toISOString()): ProficiencyProfile {
  const existing = getProfile(languageCode)
  const chosen = clampStep(step)
  const score = Number(scoreOfStep(chosen).toFixed(1))
  const profile: ProficiencyProfile = {
    languageCode: languageKey(languageCode),
    score,
    step: chosen,
    workingStep: chosen,
    confidence: 'low',
    skills: emptySkills(score),
    source,
    locked: existing?.locked || false,
    testedAt: existing?.testedAt || null,
    createdAt: existing?.createdAt || at,
    updatedAt: at,
  }
  writeProfile(profile)
  const reason: ProficiencyChangeReason = source === 'self' ? 'self_selected' : 'manual'
  if (!existing) addHistory(languageCode, 'estimate', null, chosen, reason, {}, at)
  else {
    addHistory(languageCode, 'estimate', existing.step, chosen, reason, {}, at)
    addHistory(languageCode, 'difficulty', existing.workingStep, chosen, reason, {}, at)
  }
  return profile
}

/** A placement test finished. Its result replaces the estimate; a locked profile keeps its difficulty. */
export function applyPlacement(languageCode: string, outcome: PlacementOutcome, quick: boolean, at = new Date().toISOString()): ProficiencyProfile {
  const existing = getProfile(languageCode)
  const score = clampScore(outcome.score)
  const step = stepFromScore(score)
  let skills = existing && quick ? existing.skills : emptySkills(score)
  for (const skill of PROFICIENCY_SKILLS) {
    const observed = outcome.skills[skill]
    if (observed === undefined) continue
    skills = { ...skills, [skill]: observeSkill({ score: skills[skill].score, evidence: 0 }, observed, 1) }
  }
  const workingStep = existing?.locked ? existing.workingStep : step
  const profile: ProficiencyProfile = {
    languageCode: languageKey(languageCode),
    score,
    step,
    workingStep,
    confidence: outcome.confidence,
    skills,
    source: 'test',
    locked: existing?.locked || false,
    testedAt: at,
    createdAt: existing?.createdAt || at,
    updatedAt: at,
  }
  writeProfile(profile, { testedStep: step })
  const reason: ProficiencyChangeReason = quick ? 'quick_check' : 'test'
  const evidence: Record<string, string | number> = { answered: outcome.answered, confidence: outcome.confidence }
  for (const part of ['reading', 'listening', 'expression'] as const) {
    const value = outcome.parts[part]
    if (value !== null) evidence[part] = Math.round(value)
  }
  addHistory(languageCode, 'estimate', existing ? existing.step : null, step, reason, evidence, at)
  if (existing) addHistory(languageCode, 'difficulty', existing.workingStep, workingStep, reason, evidence, at)
  return profile
}

export function setLocked(languageCode: string, locked: boolean, at = new Date().toISOString()) {
  const profile = getProfile(languageCode)
  if (!profile) return null
  const next = { ...profile, locked, updatedAt: at }
  writeProfile(next)
  return next
}

/** Sets only the difficulty conversations are held at. Kept within one step above the estimate. */
export function setWorkingStep(languageCode: string, step: number, at = new Date().toISOString()) {
  const profile = getProfile(languageCode)
  if (!profile) return null
  const workingStep = Math.min(clampStep(step), clampStep(profile.step + MAX_AHEAD))
  const next = { ...profile, workingStep, updatedAt: at }
  writeProfile(next)
  addHistory(languageCode, 'difficulty', profile.workingStep, workingStep, 'manual', {}, at)
  return next
}

/** Forgets the level for one language, with its history and test records. Conversations are kept. */
export function clearProfile(languageCode: string) {
  const key = languageKey(languageCode)
  db.prepare('DELETE FROM proficiency_profiles WHERE language_code = ?').run(key)
  db.prepare('DELETE FROM proficiency_history WHERE language_code = ?').run(key)
  db.prepare('DELETE FROM placement_sessions WHERE language_code = ?').run(key)
  db.prepare('DELETE FROM conversation_assessments WHERE language_code = ?').run(key)
  // Clearing is a decision; the level from settings is not put back in its place.
  db.prepare("INSERT OR IGNORE INTO app_flags (key, value) VALUES ('proficiency_seeded', ?)").run(new Date().toISOString())
}

/** The first run asks for the level itself, so there is nothing from before profiles existed to carry over. */
export function skipSeeding(at = new Date().toISOString()) {
  db.prepare("INSERT OR IGNORE INTO app_flags (key, value) VALUES ('proficiency_seeded', ?)").run(at)
}

/** The level chosen in settings before profiles existed, as a step. B1 when it cannot be read. */
export function stepFromSetting(proficiency: string) {
  return parseLevel(proficiency) ?? stepOf('B1')
}

/**
 * Runs once: gives the language in use a profile from the level that was chosen in settings.
 * Other languages are asked about when they are first used.
 */
export function seedProfileFromSetting(languageCode: string, proficiency: string, at = new Date().toISOString()) {
  if (row("SELECT 1 AS found FROM app_flags WHERE key = 'proficiency_seeded'")) return
  if (languageKey(languageCode) && !getProfile(languageCode)) chooseLevel(languageCode, stepFromSetting(proficiency), 'self', at)
  db.prepare("INSERT OR IGNORE INTO app_flags (key, value) VALUES ('proficiency_seeded', ?)").run(at)
}

/** The difficulty new conversations and generated material are written at. */
export function workingStepFor(languageCode: string, fallbackProficiency: string) {
  return getProfile(languageCode)?.workingStep ?? stepFromSetting(fallbackProficiency)
}

// ---------------------------------------------------------------------------------------------
// Difficulty inside a conversation

export function readConversationDifficulty(conversationId: string): ConversationDifficulty | null {
  const value = row<{ difficulty_json: string | null }>('SELECT difficulty_json FROM conversations WHERE id = ?', conversationId)
  const stored = parseJson(value?.difficulty_json)
  if (!stored || typeof stored !== 'object') return null
  return normalizeConversationDifficulty(stored, clampStep((stored as { base?: unknown }).base))
}

export function writeConversationDifficulty(conversationId: string, state: ConversationDifficulty) {
  db.prepare('UPDATE conversations SET difficulty_json = ? WHERE id = ?').run(JSON.stringify(state), conversationId)
}

/** The conversation's difficulty; one from before levels were kept gets the current difficulty of its language. */
export function conversationDifficulty(conversationId: string, languageCode: string, fallbackProficiency: string): ConversationDifficulty {
  const stored = readConversationDifficulty(conversationId)
  if (stored) return stored
  const state = startingDifficulty(workingStepFor(languageCode, fallbackProficiency))
  // Already under way: no warm-up.
  const turns = row<{ total: number }>("SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ? AND role = 'user'", conversationId)?.total || 0
  state.turns = turns
  writeConversationDifficulty(conversationId, state)
  return state
}

/** Called when a conversation is created. */
export function startConversationDifficulty(conversationId: string, languageCode: string, fallbackProficiency: string) {
  const state = startingDifficulty(workingStepFor(languageCode, fallbackProficiency))
  writeConversationDifficulty(conversationId, state)
  return state
}

interface SignalRow {
  id: string
  conversation_id: string
  partner_message_id: string
  user_message_id: string | null
  step: number
  length: number
  meaning_errors: number
  naturalness_errors: number
  non_target: number
  lookups: number
  translated: number
  simpler: number
  slower: number
  hints: number
  heard: number
  revealed: number
  lowered: number
}

function toSignal(value: SignalRow): TurnSignal {
  return {
    length: value.length,
    meaningErrors: value.meaning_errors,
    naturalnessErrors: value.naturalness_errors,
    nonTarget: value.non_target === 1,
    lookups: value.lookups,
    translated: value.translated === 1,
    simpler: value.simpler,
    slower: value.slower,
    hints: value.hints,
    heard: value.heard === 1,
    revealed: value.revealed === 1,
    answered: Boolean(value.user_message_id),
  }
}

/** Stands for the line before the learner's first message when the learner spoke first. */
export const CONVERSATION_START = 'start'

function signalRow(conversationId: string, partnerMessageId: string, languageCode: string, step: number, at: string): SignalRow {
  const found = row<SignalRow>('SELECT * FROM turn_signals WHERE conversation_id = ? AND partner_message_id = ?', conversationId, partnerMessageId)
  if (found) return found
  const id = randomUUID()
  db.prepare('INSERT INTO turn_signals (id, conversation_id, partner_message_id, language_code, step, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, conversationId, partnerMessageId, languageKey(languageCode), step, at, at)
  return row<SignalRow>('SELECT * FROM turn_signals WHERE id = ?', id) as SignalRow
}

export function conversationSignals(conversationId: string): TurnSignal[] {
  return rows<SignalRow>('SELECT * FROM turn_signals WHERE conversation_id = ? ORDER BY created_at, rowid', conversationId).map(toSignal)
}

export interface HelpResult {
  difficulty: ConversationDifficulty
  /** The difficulty went down because of this request. */
  lowered: boolean
  /** The step the line was written at. */
  lineStep: number
}

/** The learner asked for help with one of the partner's lines. */
export function recordHelp(input: { conversationId: string; partnerMessageId: string; kind: HelpKind; languageCode: string; fallbackProficiency: string; at?: string }): HelpResult {
  const at = input.at || new Date().toISOString()
  let difficulty = conversationDifficulty(input.conversationId, input.languageCode, input.fallbackProficiency)
  const signal = signalRow(input.conversationId, input.partnerMessageId, input.languageCode, replyStep(difficulty), at)
  const column = { lookup: 'lookups', translate: 'translated', simpler: 'simpler', slower: 'slower', hint: 'hints', heard: 'heard', reveal: 'revealed' }[input.kind]
  // These happened or did not; the rest are counted.
  if (input.kind === 'translate' || input.kind === 'heard' || input.kind === 'reveal') db.prepare(`UPDATE turn_signals SET ${column} = 1, updated_at = ? WHERE id = ?`).run(at, signal.id)
  else db.prepare(`UPDATE turn_signals SET ${column} = ${column} + 1, updated_at = ? WHERE id = ?`).run(at, signal.id)
  const lookups = signal.lookups + (input.kind === 'lookup' ? 1 : 0)
  // One line lowers the difficulty once, however much help it took.
  const lowered = signal.lowered === 0 && helpLowersDifficulty(input.kind, { lookups })
  if (lowered) {
    difficulty = lowerConversation(difficulty)
    writeConversationDifficulty(input.conversationId, difficulty)
    db.prepare('UPDATE turn_signals SET lowered = 1 WHERE id = ?').run(signal.id)
  }
  return { difficulty, lowered, lineStep: signal.step }
}

/** The help the learner asked for on one of the partner's lines, for the turn that answers it. */
export function helpForLine(conversationId: string, partnerMessageId: string) {
  const signal = row<SignalRow>('SELECT * FROM turn_signals WHERE conversation_id = ? AND partner_message_id = ?', conversationId, partnerMessageId)
  if (!signal) return undefined
  return { lookups: signal.lookups, translated: signal.translated === 1, simpler: signal.simpler, slower: signal.slower, hints: signal.hints, lowered: signal.lowered === 1 }
}

/** The line a learner's message answers: the partner's last line before it, or the start of the conversation. */
export function lineAnswered(conversationId: string, userMessageId: string) {
  const user = row<{ created_at: string }>('SELECT created_at FROM messages WHERE id = ?', userMessageId)
  if (!user) return CONVERSATION_START
  return row<{ id: string }>("SELECT id FROM messages WHERE conversation_id = ? AND role = 'assistant' AND status = 'complete' AND created_at <= ? AND id <> ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
    conversationId, user.created_at, userMessageId)?.id || CONVERSATION_START
}

/** The learner answered and the reply was written. Keeps what the turn showed and where it left the difficulty. */
export function saveAnswer(input: {
  conversationId: string
  partnerMessageId: string
  userMessageId: string
  languageCode: string
  /** The step the reply was written at. */
  step: number
  signal: Pick<TurnSignal, 'length' | 'meaningErrors' | 'naturalnessErrors' | 'nonTarget'>
  difficulty: ConversationDifficulty
  at?: string
}) {
  const at = input.at || new Date().toISOString()
  const signal = signalRow(input.conversationId, input.partnerMessageId, input.languageCode, input.step, at)
  db.prepare('UPDATE turn_signals SET user_message_id = ?, step = ?, length = ?, meaning_errors = ?, naturalness_errors = ?, non_target = ?, updated_at = ? WHERE id = ?')
    .run(input.userMessageId, input.step, Math.max(0, Math.round(input.signal.length)), input.signal.meaningErrors, input.signal.naturalnessErrors, input.signal.nonTarget ? 1 : 0, at, signal.id)
  writeConversationDifficulty(input.conversationId, input.difficulty)
}

// ---------------------------------------------------------------------------------------------
// After a conversation

interface AssessmentRow {
  conversation_id: string
  language_code: string
  base_step: number
  estimate_step: number
  valid: number
  verdict: string
  stats_json: string
  expression_step: number | null
  last_message_id: string | null
  assessed_at: string
}

export interface ConversationAssessment {
  conversationId: string
  languageCode: string
  baseStep: number
  valid: boolean
  verdict: ConversationVerdict
  stats: ConversationStats
  expressionStep: number | null
  assessedAt: string
}

function toAssessment(value: AssessmentRow): ConversationAssessment {
  return {
    conversationId: value.conversation_id,
    languageCode: value.language_code,
    baseStep: value.base_step,
    valid: value.valid === 1,
    verdict: (['easy', 'fit', 'hard'].includes(value.verdict) ? value.verdict : 'fit') as ConversationVerdict,
    stats: (parseJson(value.stats_json) as ConversationStats) || conversationStats([], value.language_code),
    expressionStep: value.expression_step,
    assessedAt: value.assessed_at,
  }
}

export function getAssessment(conversationId: string) {
  const value = row<AssessmentRow>('SELECT * FROM conversation_assessments WHERE conversation_id = ?', conversationId)
  return value ? toAssessment(value) : null
}

function validAssessments(languageCode: string, limit = 12): AssessedConversation[] {
  return rows<AssessmentRow>('SELECT * FROM conversation_assessments WHERE language_code = ? AND valid = 1 ORDER BY assessed_at DESC, rowid DESC LIMIT ?', languageKey(languageCode), limit)
    .map((item) => ({
      conversationId: item.conversation_id,
      baseStep: item.base_step,
      estimateStep: item.estimate_step,
      verdict: (['easy', 'fit', 'hard'].includes(item.verdict) ? item.verdict : 'fit') as ConversationVerdict,
      expressionStep: item.expression_step,
      assessedAt: item.assessed_at,
    }))
}

function applyChanges(languageCode: string, at: string): LevelChange[] {
  const profile = getProfile(languageCode)
  if (!profile) return []
  const assessments = validAssessments(languageCode)
  const changes = decideAdjustment({
    profile,
    assessments,
    difficultyChangedAt: lastChangeAt(languageCode, 'difficulty'),
    estimateChangedAt: lastChangeAt(languageCode, 'estimate'),
  })
  const total = row<{ total: number }>('SELECT COUNT(*) AS total FROM conversation_assessments WHERE language_code = ? AND valid = 1', languageKey(languageCode))?.total || 0
  const next = { ...profile, updatedAt: at }
  next.confidence = profile.locked ? profile.confidence : strongest(profile.confidence, confidenceFor({ tested: Boolean(profile.testedAt), testAgreed: profile.confidence === 'high', validConversations: total }))
  for (const change of changes) {
    if (change.kind === 'estimate') {
      next.score = Number(scoreOfStep(change.toStep).toFixed(1))
      next.step = change.toStep
      next.source = 'assessment'
    } else {
      next.workingStep = change.toStep
    }
    addHistory(languageCode, change.kind, change.fromStep, change.toStep, change.reason, change.evidence, at)
  }
  if (changes.length || next.confidence !== profile.confidence) writeProfile(next)
  return changes
}

function strongest(current: ProficiencyConfidence, computed: ProficiencyConfidence): ProficiencyConfidence {
  const order: ProficiencyConfidence[] = ['low', 'medium', 'high']
  return order[Math.max(order.indexOf(current), order.indexOf(computed))]
}

/**
 * Looks at how a conversation went and lets the level move if the rules say so.
 * Safe to call again: nothing happens until the conversation has gone further.
 */
export function assessConversation(input: { conversationId: string; languageCode: string; fallbackProficiency: string; at?: string }): { assessment: ConversationAssessment | null; changes: LevelChange[] } {
  const at = input.at || new Date().toISOString()
  const signals = conversationSignals(input.conversationId)
  if (!signals.some((signal) => signal.answered)) return { assessment: getAssessment(input.conversationId), changes: [] }
  const lastMessageId = row<{ id: string }>('SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', input.conversationId)?.id || null
  const existing = row<AssessmentRow>('SELECT * FROM conversation_assessments WHERE conversation_id = ?', input.conversationId)
  if (existing && existing.last_message_id === lastMessageId) return { assessment: toAssessment(existing), changes: [] }
  const difficulty = conversationDifficulty(input.conversationId, input.languageCode, input.fallbackProficiency)
  const stats = conversationStats(signals, input.languageCode, difficulty.offset)
  const { valid, verdict } = judgeConversation(stats, difficulty.base, input.languageCode)
  const profile = getProfile(input.languageCode)
  db.prepare(`INSERT INTO conversation_assessments (conversation_id, language_code, base_step, estimate_step, valid, verdict, stats_json, expression_step, last_message_id, assessed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(conversation_id) DO UPDATE SET language_code = excluded.language_code, base_step = excluded.base_step, valid = excluded.valid,
      verdict = excluded.verdict, stats_json = excluded.stats_json, last_message_id = excluded.last_message_id, assessed_at = excluded.assessed_at`)
    .run(input.conversationId, languageKey(input.languageCode), difficulty.base, profile?.step ?? difficulty.base, valid ? 1 : 0, verdict, JSON.stringify(stats), existing?.expression_step ?? null, lastMessageId, at)
  let changes: LevelChange[] = []
  if (valid && profile) {
    // A conversation feeds the skills once, the first time it is long enough to count.
    if (!existing || existing.valid !== 1) {
      const skills = mergeSkills(profile.skills, skillObservations(stats, difficulty.base, input.languageCode), CONVERSATION_SKILL_WEIGHT)
      writeProfile({ ...profile, skills, updatedAt: at })
    }
    changes = applyChanges(input.languageCode, at)
  }
  return { assessment: getAssessment(input.conversationId), changes }
}

export const IDLE_MINUTES = 30

/** Assesses conversations in this language that have gone quiet without the page saying so. */
export function assessIdleConversations(languageCode: string, fallbackProficiency: string, currentLanguageCode: string, now = new Date()) {
  const before = new Date(now.getTime() - IDLE_MINUTES * 60_000).toISOString()
  const key = languageKey(languageCode)
  // Conversations from before the language was recorded belong to the language in use.
  const candidates = rows<{ id: string; code: string }>(`SELECT c.id AS id, c.target_language_code AS code FROM conversations c
    WHERE c.updated_at < ? AND EXISTS (SELECT 1 FROM turn_signals s WHERE s.conversation_id = c.id AND s.user_message_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM conversation_assessments a WHERE a.conversation_id = c.id
        AND a.last_message_id IS (SELECT m.id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1))
    ORDER BY c.updated_at LIMIT 20`, before)
  const changes: LevelChange[] = []
  for (const candidate of candidates) {
    const code = languageKey(candidate.code) || languageKey(currentLanguageCode)
    if (code !== key) continue
    changes.push(...assessConversation({ conversationId: candidate.id, languageCode: key, fallbackProficiency, at: now.toISOString() }).changes)
  }
  return changes
}

/** The level the model read from the learner's lines in one conversation, from its recap. */
export function recordExpression(input: { conversationId: string; languageCode: string; step: number; at?: string }) {
  const at = input.at || new Date().toISOString()
  const existing = row<AssessmentRow>('SELECT * FROM conversation_assessments WHERE conversation_id = ?', input.conversationId)
  if (!existing) return []
  const first = existing.expression_step === null
  db.prepare('UPDATE conversation_assessments SET expression_step = ? WHERE conversation_id = ?').run(input.step, input.conversationId)
  const profile = getProfile(input.languageCode)
  if (!profile || existing.valid !== 1) return []
  if (first) {
    const skills = { ...profile.skills, expression: observeSkill(profile.skills.expression, input.step, CONVERSATION_SKILL_WEIGHT) }
    writeProfile({ ...profile, skills, updatedAt: at })
  }
  return applyChanges(input.languageCode, at)
}

/** The difficulty of the conversation before this one in the same language, to tell the learner when it has gone up. */
export function previousConversationBase(conversationId: string, languageCode: string): number | null {
  const current = row<{ created_at: string }>('SELECT created_at FROM conversations WHERE id = ?', conversationId)
  if (!current) return null
  const previous = rows<{ difficulty_json: string | null; code: string }>(
    "SELECT difficulty_json, target_language_code AS code FROM conversations WHERE created_at < ? AND difficulty_json IS NOT NULL ORDER BY created_at DESC LIMIT 12", current.created_at,
  ).find((item) => !item.code || languageKey(item.code) === languageKey(languageCode))
  const stored = parseJson(previous?.difficulty_json)
  if (!stored || typeof stored !== 'object') return null
  const base = Number((stored as { base?: unknown }).base)
  return Number.isFinite(base) ? clampStep(base) : null
}
