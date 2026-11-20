import type { ProficiencyConfidence, ProficiencyProfile, ProficiencySkill } from './proficiency.js'

export type PlacementKind = 'reading' | 'listening' | 'expression'
export type PlacementMode = 'full' | 'quick'

export const EXPRESSION_TASKS = ['recent', 'opinion', 'hypothetical'] as const
export type ExpressionTask = (typeof EXPRESSION_TASKS)[number]

export const EXPRESSION_BANDS = ['low', 'mid', 'high'] as const
export type ExpressionBand = (typeof EXPRESSION_BANDS)[number]

/** One question as the page receives it. The right answer is never part of it. */
export interface PlacementQuestion {
  id: string
  kind: PlacementKind
  /** Reading: the passage to show. Listening: the sentence to read aloud, which the page does not show. */
  text?: string
  question?: string
  options?: string[]
  /** Listening: multiplier on the read-aloud rate for the level of the item. */
  speechRateFactor?: number
  /** Open questions: which prompt to show. The wording comes from the interface copy. */
  task?: ExpressionTask
  band?: ExpressionBand
}

export interface PlacementProgress {
  sessionId: string
  languageCode: string
  mode: PlacementMode
  /** How many questions have been answered or passed over. */
  index: number
  total: number
  question: PlacementQuestion | null
  done: boolean
}

/** Something the learner wrote, with what it shows. */
export interface PlacementEvidence {
  quote: string
  comment: string
}

export interface PlacementResult {
  sessionId: string
  languageCode: string
  mode: PlacementMode
  /** The learner stopped before the last question. */
  partial: boolean
  step: number
  score: number
  confidence: ProficiencyConfidence
  /** The step each part came out at; null when the part was not taken. */
  parts: { reading: number | null; listening: number | null; expression: number | null }
  skills: Partial<Record<ProficiencySkill, number>>
  answered: number
  total: number
  evidence: PlacementEvidence[]
  /** The estimate before this test, when there was one. */
  previousStep: number | null
  /** Requests made to the model for this test. */
  modelCalls: number
  profile: ProficiencyProfile | null
}
