import type { ArrangedWord } from './wordbook.js'
// What the recap of a conversation and the short practice after it look like to the pages.

/** A recap is written once the learner has said this many things in the conversation. */
export const RECAP_MIN_TURNS = 3

/** Where the missing part of a gap question stands in its sentence. */
export const PRACTICE_GAP = '___'

/** How often the learner asked for each kind of help during the conversation. */
export interface RecapHelp {
  lookups: number
  translations: number
  simpler: number
  slower: number
  hints: number
}

export interface Recap {
  conversationId: string
  languageCode: string
  createdAt: string
  /** The conversation went on after the recap was written. */
  stale: boolean
  /** Saved words this conversation made room for, and what became of each. */
  arranged: ArrangedWord[]
  /** Something the learner said well, in their own words. */
  good: { quote: string; comment: string } | null
  /** The kind of mistake that mattered most this time. */
  pattern: {
    category: string
    comment: string
    examples: Array<{ original: string; improved: string }>
    /** Made in earlier conversations as well. */
    recurring: boolean
    /** The learner asked for it to be watched. */
    noted: boolean
  } | null
  /** One expression worth keeping. */
  takeaway: { original: string; improved: string; meaning: string; comment: string; wordId: string | null } | null
  /** The level the learner's own lines were at. */
  expression: { step: number; reason: string } | null
  /** How the conversation went at the difficulty it was held at. */
  session: {
    startStep: number
    endStep: number
    verdict: 'easy' | 'fit' | 'hard' | null
    turns: number
    help: RecapHelp
  } | null
  /** Whether there are mistakes to practise. */
  practice: boolean
}

export interface PracticeResult {
  right: boolean
  /** What the learner answered. */
  given: string
  /** The sentence as it should be. */
  answer: string
  explanation: string
}

interface PracticeItemBase {
  id: string
  category: string
  sentence: string
  /** Null until the question is answered; an answer stands once given. */
  result: PracticeResult | null
}

export type PracticeItem =
  | (PracticeItemBase & { kind: 'gap'; options: string[] })
  | (PracticeItemBase & { kind: 'rewrite'; task: 'fix' | 'rephrase' })

export interface Practice {
  id: string
  conversationId: string
  languageCode: string
  items: PracticeItem[]
  done: boolean
  right: number
}
