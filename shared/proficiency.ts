/**
 * The scale a learner's level is kept on, and what one step of it asks of a reply.
 * Shared by the server, which writes prompts and checks replies against it, and the pages that show it.
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type CefrLevel = (typeof CEFR_LEVELS)[number]

/** Each level is walked in three small steps, so that difficulty can move without jumping a whole level. */
export const LEVEL_PARTS = ['low', 'mid', 'high'] as const
export type LevelPart = (typeof LEVEL_PARTS)[number]

export const STEP_COUNT = CEFR_LEVELS.length * LEVEL_PARTS.length
export const MAX_STEP = STEP_COUNT - 1
const STEP_SPAN = 100 / STEP_COUNT

export const PROFICIENCY_SKILLS = ['vocabulary', 'grammar', 'reading', 'listening', 'expression'] as const
export type ProficiencySkill = (typeof PROFICIENCY_SKILLS)[number]

/** Where an estimate came from: chosen by the learner, measured by the test, read from conversations, or edited by hand. */
export type ProficiencySource = 'self' | 'test' | 'assessment' | 'manual'
export type ProficiencyConfidence = 'low' | 'medium' | 'high'

export interface SkillEstimate {
  /** 0-100 on the same scale as the overall estimate. */
  score: number
  /** How many observations it rests on. */
  evidence: number
}

export interface ProficiencyProfile {
  languageCode: string
  /** Estimated level, 0-100. */
  score: number
  /** The step that score falls in. */
  step: number
  /** The difficulty conversations are actually held at. At most one step above the estimate. */
  workingStep: number
  confidence: ProficiencyConfidence
  skills: Record<ProficiencySkill, SkillEstimate>
  source: ProficiencySource
  /** A locked profile is still observed, but never adjusted on its own. */
  locked: boolean
  testedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ProficiencyChangeKind = 'estimate' | 'difficulty'

/**
 * Why a level changed. Stored as a code with its numbers, never as a sentence,
 * so the page can say it in whichever interface language is in use.
 */
export type ProficiencyChangeReason =
  | 'self_selected'
  | 'manual'
  | 'test'
  | 'quick_check'
  | 'easy_streak'
  | 'hard_streak'
  | 'sustained_above'
  | 'follow_difficulty'
  | 'reset'

export interface ProficiencyChange {
  id: string
  languageCode: string
  kind: ProficiencyChangeKind
  fromStep: number | null
  toStep: number
  reason: ProficiencyChangeReason
  /** Numbers the reason is stated with, such as how many conversations it rests on. */
  evidence: Record<string, number | string>
  createdAt: string
}

/** How one conversation went for the learner at the difficulty it was held at. */
export type ConversationVerdict = 'easy' | 'fit' | 'hard'

function finite(value: unknown, fallback: number) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function clampStep(step: unknown) {
  return Math.max(0, Math.min(MAX_STEP, Math.round(finite(step, 0))))
}

export function clampScore(score: unknown) {
  return Math.max(0, Math.min(100, finite(score, 0)))
}

export function stepOf(level: CefrLevel, part: LevelPart = 'mid') {
  return CEFR_LEVELS.indexOf(level) * LEVEL_PARTS.length + LEVEL_PARTS.indexOf(part)
}

export function stepParts(step: unknown): { level: CefrLevel; part: LevelPart } {
  const value = clampStep(step)
  return { level: CEFR_LEVELS[Math.floor(value / LEVEL_PARTS.length)], part: LEVEL_PARTS[value % LEVEL_PARTS.length] }
}

export function stepFromScore(score: unknown) {
  return clampStep(Math.floor(clampScore(score) / STEP_SPAN))
}

/** The middle of a step, used when only the step is known. */
export function scoreOfStep(step: unknown) {
  return (clampStep(step) + 0.5) * STEP_SPAN
}

/** A step as a fraction of a step, for averaging observations that fall between steps. */
export function scoreOfExactStep(step: number) {
  return clampScore((Math.max(-0.5, Math.min(MAX_STEP + 0.5, finite(step, 0))) + 0.5) * STEP_SPAN)
}

/** `B1-`, `B1`, `B1+`: a compact code that reads the same in every language. */
export function stepCode(step: unknown) {
  const { level, part } = stepParts(step)
  return level + (part === 'low' ? '-' : part === 'high' ? '+' : '')
}

/** Reads `B1`, `b1+`, `B1-`, `B1 high`, `B1.low`. Returns undefined for anything that is not a level. */
export function parseLevel(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^\s*([ABC][12])\s*[.\s_]?\s*(\+|-|low|mid|high|lower|upper)?\s*$/iu.exec(value)
  if (!match) return undefined
  const level = match[1].toUpperCase() as CefrLevel
  const mark = (match[2] || '').toLowerCase()
  const part: LevelPart = mark === '+' || mark === 'high' || mark === 'upper' ? 'high' : mark === '-' || mark === 'low' || mark === 'lower' ? 'low' : 'mid'
  return stepOf(level, part)
}

/** How a level is written into a prompt. */
export function stepForPrompt(step: unknown) {
  const { level, part } = stepParts(step)
  return level + (part === 'low' ? ' (lower part of the level)' : part === 'high' ? ' (upper part of the level)' : '')
}

export function emptySkills(score: number): Record<ProficiencySkill, SkillEstimate> {
  return Object.fromEntries(PROFICIENCY_SKILLS.map((skill) => [skill, { score: clampScore(score), evidence: 0 }])) as Record<ProficiencySkill, SkillEstimate>
}

// ---------------------------------------------------------------------------------------------
// What one step asks of a reply

/** Languages written without spaces between words are measured in characters. */
export type LengthUnit = 'words' | 'characters'

const LENGTH_RULES: Record<string, { unit: LengthUnit; factor: number }> = {
  zh: { unit: 'characters', factor: 1.7 },
  ja: { unit: 'characters', factor: 2.3 },
  ko: { unit: 'words', factor: 0.75 },
  de: { unit: 'words', factor: 0.9 },
  hi: { unit: 'words', factor: 1.1 },
}

export function lengthRule(languageCode: string) {
  return LENGTH_RULES[languageCode.toLowerCase().split('-')[0]] || { unit: 'words' as LengthUnit, factor: 1 }
}

export interface DifficultyProfile {
  step: number
  unit: LengthUnit
  /** Longest sentence a reply should contain, in `unit`. */
  maxSentenceLength: number
  /** Most sentences in one reply. */
  maxSentences: number
  /** Words up to this frequency rank count as common. 0 means vocabulary is not limited. */
  commonRank: number
  /** Largest share of a reply's words that may fall outside `commonRank`. */
  rareShare: number
  /** Multiplier on the read-aloud rate when the learner has not set one. */
  speechRateFactor: number
  /** How much a learner at this level typically writes in one turn, in `unit`. */
  expectedTurnLength: number
  /** Errors that change the meaning, per 100 words, that are ordinary at this level. */
  expectedErrorsPer100: number
  /** Times per 10 partner replies that looking something up or asking again is ordinary at this level. */
  expectedStrainPer10: number
}

// One value per level, at the middle step of that level. Steps in between are interpolated.
const ANCHORS = {
  sentence: [8, 12, 17, 23, 30, 38],
  sentences: [2, 3, 4, 5, 6, 7],
  commonRank: [1_500, 2_500, 5_000, 10_000, 20_000, 30_000],
  rareShare: [0.3, 0.3, 0.27, 0.24, 0.22, 0.22],
  speechRate: [0.8, 0.88, 0.95, 1, 1.05, 1.1],
  turnLength: [4, 7, 11, 16, 22, 28],
  errorsPer100: [7, 5, 3, 2, 1.5, 1],
  strainPer10: [5, 4, 3, 2.5, 2, 1.5],
} as const

function between(values: readonly number[], step: number, logarithmic = false) {
  // The middle step of level n sits at position n.
  const position = Math.max(-1 / 3, Math.min(values.length - 1 + 1 / 3, (step - 1) / LEVEL_PARTS.length))
  const lower = Math.max(0, Math.min(values.length - 2, Math.floor(position)))
  const fraction = position - lower
  if (logarithmic) return Math.exp(Math.log(values[lower]) + (Math.log(values[lower + 1]) - Math.log(values[lower])) * fraction)
  return values[lower] + (values[lower + 1] - values[lower]) * fraction
}

export function difficultyProfile(step: unknown, languageCode: string): DifficultyProfile {
  const value = clampStep(step)
  const rule = lengthRule(languageCode)
  // From C2 on, nothing about vocabulary is held back.
  const limited = value < stepOf('C2', 'low')
  return {
    step: value,
    unit: rule.unit,
    maxSentenceLength: Math.max(4, Math.round(between(ANCHORS.sentence, value) * rule.factor)),
    maxSentences: Math.max(1, Math.round(between(ANCHORS.sentences, value))),
    commonRank: limited ? Math.round(between(ANCHORS.commonRank, value, true) / 100) * 100 : 0,
    rareShare: Number(between(ANCHORS.rareShare, value).toFixed(2)),
    speechRateFactor: Number(between(ANCHORS.speechRate, value).toFixed(2)),
    expectedTurnLength: Math.max(2, Math.round(between(ANCHORS.turnLength, value) * rule.factor)),
    expectedErrorsPer100: Number(between(ANCHORS.errorsPer100, value).toFixed(1)),
    expectedStrainPer10: Number(between(ANCHORS.strainPer10, value).toFixed(1)),
  }
}

// ---------------------------------------------------------------------------------------------
// Difficulty inside one conversation

/** A conversation never goes more than this far above or below the difficulty it started at. */
export const CONVERSATION_STEP_UP = 1
export const CONVERSATION_STEP_DOWN = 2
/** The first replies are one step easier, to warm up. */
export const WARM_UP_TURNS = 2

export interface ConversationDifficulty {
  /** The difficulty the conversation started at. */
  base: number
  /** Steps added or taken away since, from how the learner is doing. */
  offset: number
  /** Learner turns so far. */
  turns: number
  /** Learner turns in a row that were long, clean and needed no help. */
  easyTurns: number
}

export function startingDifficulty(base: unknown): ConversationDifficulty {
  return { base: clampStep(base), offset: 0, turns: 0, easyTurns: 0 }
}

export function normalizeConversationDifficulty(value: unknown, fallbackBase: number): ConversationDifficulty {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    base: clampStep(finite(source.base, fallbackBase)),
    offset: Math.max(-CONVERSATION_STEP_DOWN, Math.min(CONVERSATION_STEP_UP, Math.round(finite(source.offset, 0)))),
    turns: Math.max(0, Math.round(finite(source.turns, 0))),
    easyTurns: Math.max(0, Math.round(finite(source.easyTurns, 0))),
  }
}

/** The step the next reply is written at. */
export function replyStep(state: ConversationDifficulty) {
  const warmUp = state.turns < WARM_UP_TURNS ? 1 : 0
  const offset = Math.max(-CONVERSATION_STEP_DOWN, Math.min(CONVERSATION_STEP_UP, state.offset - warmUp))
  return clampStep(state.base + offset)
}
