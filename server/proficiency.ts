/**
 * How a learner's level is estimated and how difficulty moves. Everything here is a pure function
 * of its arguments: no model, no database, no clock.
 *
 * The numbers the rules compare against (shared/proficiency.ts) are a first table written from
 * experience, so the thresholds lean towards leaving the level alone.
 */
import {
  CONVERSATION_STEP_DOWN, CONVERSATION_STEP_UP, MAX_STEP, PROFICIENCY_SKILLS,
  clampScore, clampStep, difficultyProfile, lengthRule, scoreOfExactStep, scoreOfStep, stepFromScore,
  type ConversationDifficulty, type ConversationVerdict, type ProficiencyChangeReason,
  type ProficiencyConfidence, type ProficiencyProfile, type ProficiencySkill, type SkillEstimate,
} from '../shared/proficiency.js'

// ---------------------------------------------------------------------------------------------
// One turn

/** What is known about one exchange: the partner's line and the learner's answer to it. */
export interface TurnSignal {
  /** Length of the learner's answer, in the language's unit. 0 while the learner has not answered. */
  length: number
  meaningErrors: number
  naturalnessErrors: number
  /** The learner answered in another language. */
  nonTarget: boolean
  /** Words the learner looked up in the partner's line. */
  lookups: number
  /** The learner had the partner's line translated. */
  translated: boolean
  /** Times the learner asked for the line to be said more simply. */
  simpler: number
  slower: number
  hints: number
  /** The line was played with its text hidden. */
  heard?: boolean
  /** The learner asked to see the text of a line played that way. */
  revealed?: boolean
  /** Whether the learner answered. Lines without an answer still count as lines read. */
  answered: boolean
}

export type HelpKind = 'lookup' | 'translate' | 'simpler' | 'slower' | 'hint' | 'heard' | 'reveal'

/** Whether asking for this help on a line means the line was too hard, so the next one should be easier. */
export function helpLowersDifficulty(kind: HelpKind, signal: Pick<TurnSignal, 'lookups'>) {
  if (kind === 'simpler' || kind === 'translate') return true
  // One word looked up is ordinary reading; the second in the same line is not.
  return kind === 'lookup' && signal.lookups >= 2
}

function bounded(offset: number) {
  return Math.max(-CONVERSATION_STEP_DOWN, Math.min(CONVERSATION_STEP_UP, offset))
}

/** The learner could not follow a line: step down at once, and start counting easy turns again. */
export function lowerConversation(state: ConversationDifficulty): ConversationDifficulty {
  return { ...state, offset: bounded(state.offset - 1), easyTurns: 0 }
}

const EASY_TURNS_TO_RAISE = 3

/**
 * After the learner's answer. `alreadyLowered` is true when help on the partner's line has
 * lowered the difficulty already, so the same trouble is not counted twice.
 */
export function tuneConversation(state: ConversationDifficulty, signal: TurnSignal, languageCode: string, alreadyLowered = false): ConversationDifficulty {
  const next: ConversationDifficulty = { ...state, turns: state.turns + 1 }
  if (signal.nonTarget) {
    next.easyTurns = 0
    if (!alreadyLowered) next.offset = bounded(next.offset - 1)
    return next
  }
  const expected = difficultyProfile(state.base, languageCode).expectedTurnLength
  const easy = !alreadyLowered && signal.length >= expected && signal.meaningErrors === 0 &&
    signal.lookups === 0 && !signal.translated && signal.simpler === 0 && signal.hints === 0
  if (!easy) {
    next.easyTurns = 0
    return next
  }
  next.easyTurns += 1
  if (next.easyTurns >= EASY_TURNS_TO_RAISE) {
    next.offset = bounded(next.offset + 1)
    next.easyTurns = 0
  }
  return next
}

// ---------------------------------------------------------------------------------------------
// One conversation

export interface ConversationStats {
  /** Answers the learner gave. */
  turns: number
  /** Partner lines the learner read. */
  lines: number
  /** Average length of an answer, in the language's unit. */
  averageLength: number
  /** Errors that change the meaning, per 100 words. */
  errorsPer100: number
  /** Times per 10 partner lines that the learner needed help to follow. */
  strainPer10: number
  /** Share of answers given in another language. */
  nonTargetShare: number
  meaningErrors: number
  naturalnessErrors: number
  lookups: number
  translations: number
  simpler: number
  slower: number
  hints: number
  /** Lines played with their text hidden. */
  heardLines: number
  /** How many of those the learner could not follow by ear: the text was asked for, or half a line when it was only played again slower. */
  heardTrouble: number
  /** Where the difficulty inside the conversation ended, relative to where it started. */
  finalOffset: number
}

export const MIN_VALID_TURNS = 5
/** Fewer lines listened to with the text hidden say nothing about listening. */
export const MIN_HEARD_LINES = 3
/** The share of such lines a learner at the right level needs the text for. */
export const HEARD_TROUBLE_NORM = 0.3

export function conversationStats(signals: TurnSignal[], languageCode: string, finalOffset = 0): ConversationStats {
  const answered = signals.filter((signal) => signal.answered)
  const inTarget = answered.filter((signal) => !signal.nonTarget)
  const sum = (pick: (signal: TurnSignal) => number, list = signals) => list.reduce((total, signal) => total + pick(signal), 0)
  const length = sum((signal) => signal.length, inTarget)
  // Rates are stated per word; languages counted in characters are converted first.
  const words = length / lengthRule(languageCode).factor
  const meaningErrors = sum((signal) => signal.meaningErrors, answered)
  const lookups = sum((signal) => signal.lookups)
  const translations = sum((signal) => (signal.translated ? 1 : 0))
  const simpler = sum((signal) => signal.simpler)
  const hints = sum((signal) => signal.hints)
  const lines = signals.length
  const heard = signals.filter((signal) => signal.heard)
  return {
    turns: answered.length,
    lines,
    averageLength: inTarget.length ? Number((length / inTarget.length).toFixed(1)) : 0,
    errorsPer100: words > 0 ? Number((meaningErrors / words * 100).toFixed(1)) : 0,
    strainPer10: lines ? Number(((lookups + translations + simpler + hints) / lines * 10).toFixed(1)) : 0,
    nonTargetShare: answered.length ? Number(((answered.length - inTarget.length) / answered.length).toFixed(2)) : 0,
    meaningErrors,
    naturalnessErrors: sum((signal) => signal.naturalnessErrors, answered),
    lookups,
    translations,
    simpler,
    slower: sum((signal) => signal.slower),
    hints,
    heardLines: heard.length,
    heardTrouble: sum((signal) => (signal.revealed ? 1 : signal.slower > 0 ? 0.5 : 0), heard),
    finalOffset,
  }
}

/** Whether a conversation held at `baseStep` was easy, about right, or hard for the learner. */
export function judgeConversation(stats: ConversationStats, baseStep: number, languageCode: string): { valid: boolean; verdict: ConversationVerdict } {
  const expected = difficultyProfile(baseStep, languageCode)
  const valid = stats.turns >= MIN_VALID_TURNS
  const hard =
    (stats.meaningErrors >= 3 && stats.errorsPer100 >= expected.expectedErrorsPer100 * 2) ||
    stats.strainPer10 >= expected.expectedStrainPer10 * 2 ||
    stats.nonTargetShare >= 0.3 ||
    stats.finalOffset <= -CONVERSATION_STEP_DOWN
  if (hard) return { valid, verdict: 'hard' }
  // In a longer conversation one slip or one word looked up does not stop it from being easy.
  const grace = stats.turns >= 8 ? 1 : 0
  const easy =
    (stats.meaningErrors <= grace || stats.errorsPer100 <= expected.expectedErrorsPer100 * 0.5) &&
    (stats.lookups + stats.translations + stats.simpler + stats.hints <= grace || stats.strainPer10 <= expected.expectedStrainPer10 * 0.3) &&
    stats.averageLength >= expected.expectedTurnLength &&
    stats.nonTargetShare === 0 &&
    stats.finalOffset >= 0
  return { valid, verdict: easy ? 'easy' : 'fit' }
}

// ---------------------------------------------------------------------------------------------
// Across conversations

export interface AssessedConversation {
  conversationId: string
  /** The difficulty it was held at. */
  baseStep: number
  /** The estimate at the time. */
  estimateStep: number
  verdict: ConversationVerdict
  /** The level the model read from the learner's own lines, when a recap was made. */
  expressionStep: number | null
  assessedAt: string
}

export interface LevelChange {
  kind: 'estimate' | 'difficulty'
  fromStep: number
  toStep: number
  reason: ProficiencyChangeReason
  evidence: Record<string, number | string>
}

export const EASY_STREAK = 3
export const HARD_STREAK = 2
export const SUSTAINED_CONVERSATIONS = 3
/** Without the model's reading of the learner's lines, more conversations are asked for. */
export const SUSTAINED_WITHOUT_EXPRESSION = 5
/** The difficulty never runs further ahead of the estimate than this. */
export const MAX_AHEAD = 1
/** Once the difficulty has fallen this far below the estimate, the estimate follows it down. */
export const FOLLOW_DOWN_GAP = 2

export interface AdjustmentInput {
  profile: Pick<ProficiencyProfile, 'score' | 'step' | 'workingStep' | 'locked'>
  /** Valid conversations in this language, newest first. */
  assessments: AssessedConversation[]
  /** When the difficulty last changed, for any reason. Conversations before it are spent. */
  difficultyChangedAt: string | null
  /** When the estimate last changed. */
  estimateChangedAt: string | null
}

function since<T extends { assessedAt: string }>(items: T[], moment: string | null) {
  return moment ? items.filter((item) => item.assessedAt > moment) : items
}

/**
 * What should change after a conversation has been assessed. Moves one step at a time, comes
 * down faster than it goes up, and every change uses up the conversations it rested on.
 */
export function decideAdjustment(input: AdjustmentInput): LevelChange[] {
  const { profile } = input
  if (profile.locked) return []
  const changes: LevelChange[] = []
  let step = clampStep(profile.step)
  let working = clampStep(profile.workingStep)

  const sustained = since(input.assessments, input.estimateChangedAt)
  const rated = sustained.slice(0, SUSTAINED_CONVERSATIONS)
  const above = (list: AssessedConversation[]) => list.every((item) => item.baseStep > step && item.verdict !== 'hard')
  const expressions = rated.flatMap((item) => (item.expressionStep === null ? [] : [item.expressionStep]))
  let raised = false
  if (step < MAX_STEP) {
    if (rated.length >= SUSTAINED_CONVERSATIONS && above(rated) && expressions.length > 0) {
      const expression = expressions.reduce((total, value) => total + value, 0) / expressions.length
      // The learner's own lines have to read above the middle of the current step.
      if (expression >= step + 0.5) {
        changes.push({ kind: 'estimate', fromStep: step, toStep: step + 1, reason: 'sustained_above', evidence: { conversations: rated.length, expression: Number(expression.toFixed(1)) } })
        raised = true
      }
    } else if (expressions.length === 0) {
      const longer = sustained.slice(0, SUSTAINED_WITHOUT_EXPRESSION)
      if (longer.length >= SUSTAINED_WITHOUT_EXPRESSION && above(longer)) {
        changes.push({ kind: 'estimate', fromStep: step, toStep: step + 1, reason: 'sustained_above', evidence: { conversations: longer.length } })
        raised = true
      }
    }
  }
  if (raised) step += 1

  const recent = since(input.assessments, input.difficultyChangedAt)
  const hard = recent.slice(0, HARD_STREAK)
  const easy = recent.slice(0, EASY_STREAK)
  if (hard.length >= HARD_STREAK && hard.every((item) => item.verdict === 'hard') && working > 0) {
    changes.push({ kind: 'difficulty', fromStep: working, toStep: working - 1, reason: 'hard_streak', evidence: { conversations: hard.length } })
    working -= 1
  } else if (easy.length >= EASY_STREAK && easy.every((item) => item.verdict === 'easy') && working < Math.min(MAX_STEP, step + MAX_AHEAD)) {
    changes.push({ kind: 'difficulty', fromStep: working, toStep: working + 1, reason: 'easy_streak', evidence: { conversations: easy.length } })
    working += 1
  }

  if (!raised && step - working >= FOLLOW_DOWN_GAP) {
    changes.push({ kind: 'estimate', fromStep: step, toStep: working + 1, reason: 'follow_difficulty', evidence: { difficulty: working } })
  }
  return changes
}

/** How sure the estimate is: a test and agreeing conversations both add to it. */
export function confidenceFor(input: { tested: boolean; testAgreed: boolean; validConversations: number }): ProficiencyConfidence {
  if ((input.tested && input.testAgreed) || input.validConversations >= 10 || (input.tested && input.validConversations >= 4)) return 'high'
  if (input.tested || input.validConversations >= 4) return 'medium'
  return 'low'
}

/** Folds one observation into a skill. A single conversation moves it a little; a test replaces it. */
export function observeSkill(current: SkillEstimate, observedStep: number, weight: number): SkillEstimate {
  const observed = scoreOfExactStep(observedStep)
  const share = current.evidence === 0 ? Math.max(weight, 0.5) : weight
  return { score: Number(clampScore(current.score * (1 - share) + observed * share).toFixed(1)), evidence: current.evidence + 1 }
}

export const CONVERSATION_SKILL_WEIGHT = 0.15

/**
 * What one valid conversation says about each skill, as a step. Doing better than the level
 * expects reads as a step above the difficulty it was held at; doing worse, a step or two below.
 */
export function skillObservations(stats: ConversationStats, baseStep: number, languageCode: string): Partial<Record<ProficiencySkill, number>> {
  const expected = difficultyProfile(baseStep, languageCode)
  const against = (value: number, norm: number) => {
    if (value <= norm * 0.5) return baseStep + 1
    if (value <= norm * 1.25) return baseStep
    if (value <= norm * 2) return baseStep - 1
    return baseStep - 2
  }
  const lookupsPer10 = stats.lines ? stats.lookups / stats.lines * 10 : 0
  const helpPer10 = stats.lines ? (stats.translations + stats.simpler + stats.hints) / stats.lines * 10 : 0
  return {
    grammar: against(stats.errorsPer100, expected.expectedErrorsPer100),
    vocabulary: against(lookupsPer10, expected.expectedStrainPer10 * 0.6),
    reading: against(helpPer10, expected.expectedStrainPer10 * 0.4),
    ...(stats.heardLines >= MIN_HEARD_LINES ? { listening: against(stats.heardTrouble / stats.heardLines, HEARD_TROUBLE_NORM) } : {}),
  }
}

export function mergeSkills(skills: Record<ProficiencySkill, SkillEstimate>, observations: Partial<Record<ProficiencySkill, number>>, weight: number) {
  const next = { ...skills }
  for (const skill of PROFICIENCY_SKILLS) {
    const observed = observations[skill]
    if (observed === undefined || !Number.isFinite(observed)) continue
    next[skill] = observeSkill(skills[skill], observed, weight)
  }
  return next
}

// ---------------------------------------------------------------------------------------------
// The placement test

export interface PlacementAnswer {
  /** The step the item was written for. */
  step: number
  correct: boolean
}

// Four options: a learner far below the item still gets one in four right.
const GUESS = 0.25
const SLOPE = 0.7

function chance(ability: number, itemStep: number) {
  return GUESS + (1 - GUESS) / (1 + Math.exp(-SLOPE * (ability - itemStep)))
}

/**
 * Moves the running estimate after one answer. The first answers move it by about a level,
 * later ones by less, so that it settles instead of swinging.
 */
export function updateAbility(ability: number, answer: PlacementAnswer, answered: number) {
  const gain = Math.max(1.2, 5 * 0.78 ** answered)
  const next = ability + gain * ((answer.correct ? 1 : 0) - chance(ability, answer.step)) / (1 - GUESS)
  return Math.max(-1, Math.min(MAX_STEP + 1, next))
}

/**
 * The level that best explains a set of answers: the most likely ability, held near the
 * starting point when there are few answers to go on.
 */
export function abilityFromAnswers(answers: PlacementAnswer[], startStep: number) {
  if (!answers.length) return clampStep(startStep)
  let best = startStep
  let bestScore = -Infinity
  for (let ability = -1; ability <= MAX_STEP + 1; ability += 0.25) {
    let score = -((ability - startStep) ** 2) / (2 * 6 ** 2)
    for (const answer of answers) {
      const p = chance(ability, answer.step)
      score += Math.log(answer.correct ? p : 1 - p)
    }
    if (score > bestScore) {
      bestScore = score
      best = ability
    }
  }
  return Math.max(0, Math.min(MAX_STEP, best))
}

export const PLACEMENT_WEIGHTS = { reading: 0.3, listening: 0.2, expression: 0.5 } as const

export interface PlacementParts {
  reading: PlacementAnswer[]
  listening: PlacementAnswer[]
  /** Steps the model gave each open answer. Unanswered prompts are left out. */
  expression: number[]
  /** Steps for range of words and for accuracy, read from the same answers. */
  vocabulary?: number[]
  grammar?: number[]
  startStep: number
  /** The learner stopped before the end. */
  partial?: boolean
}

export interface PlacementOutcome {
  score: number
  step: number
  confidence: ProficiencyConfidence
  /** The step each part came out at; null when the part was not taken. */
  parts: { reading: number | null; listening: number | null; expression: number | null }
  skills: Partial<Record<ProficiencySkill, number>>
  answered: number
}

function mean(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null
}

export function placementOutcome(input: PlacementParts): PlacementOutcome {
  const reading = input.reading.length ? abilityFromAnswers(input.reading, input.startStep) : null
  const listening = input.listening.length ? abilityFromAnswers(input.listening, reading ?? input.startStep) : null
  const expression = mean(input.expression.map((value) => Math.max(0, Math.min(MAX_STEP, value))))
  const parts = { reading, listening, expression }
  let total = 0
  let weight = 0
  for (const key of ['reading', 'listening', 'expression'] as const) {
    const value = parts[key]
    if (value === null) continue
    total += value * PLACEMENT_WEIGHTS[key]
    weight += PLACEMENT_WEIGHTS[key]
  }
  // Parts that were not taken give their weight to the others in proportion.
  const exact = weight > 0 ? total / weight : input.startStep
  const answered = input.reading.length + input.listening.length + input.expression.length
  const understood = mean([reading, listening].filter((value): value is number => value !== null))
  const agreed = understood !== null && expression !== null && Math.abs(understood - expression) <= 3
  const confidence: ProficiencyConfidence = input.partial || answered < 6 || expression === null || understood === null
    ? 'low'
    : agreed && answered >= 8 ? 'high' : 'medium'
  const skills: Partial<Record<ProficiencySkill, number>> = {}
  if (reading !== null) skills.reading = reading
  if (listening !== null) skills.listening = listening
  if (expression !== null) skills.expression = expression
  const vocabulary = mean(input.vocabulary || [])
  const grammar = mean(input.grammar || [])
  if (vocabulary !== null) skills.vocabulary = vocabulary
  if (grammar !== null) skills.grammar = grammar
  const score = Number(scoreOfExactStep(exact).toFixed(1))
  return { score, step: stepFromScore(score), confidence, parts, skills, answered }
}

/** A level picked by hand or at the start: every skill starts there, with nothing behind it yet. */
export function scoreForChosenStep(step: number) {
  return Number(scoreOfStep(step).toFixed(1))
}
