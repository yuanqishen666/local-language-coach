/**
 * The wordbook beyond flashcards: saved words that come back in conversation, the story written
 * from them, pasted material turned into something to talk about, and what to talk about next.
 */
import type { ErrorCategory } from './memory.js'

/** Again, hard, good, easy. */
export type ReviewRating = 1 | 2 | 3 | 4

/** Where a review came from: a flashcard, or the word turning up in what the learner said. */
export type ReviewSource = 'card' | 'conversation'

/** Used and left alone by the corrections, or used and corrected. */
export type WordUse = 'right' | 'slip'

/** Saved words a conversation may have at one time waiting to be used. */
export const ARRANGED_AT_ONCE = 2

/** A saved word the partner was asked to make room for in a conversation. */
export interface ArrangedWord {
  wordId: string
  term: string
  meaning: string
  /** Null while the learner has not used it. */
  result: WordUse | null
}

/** A saved word the learner used in one message. */
export interface ReviewedWord {
  wordId: string
  term: string
  result: WordUse
}

export const STORY_MIN_WORDS = 3
export const STORY_MAX_WORDS = 8

export interface StoryWord {
  wordId: string
  term: string
  meaning: string
  /** The story has it. */
  used: boolean
  /** Still in the wordbook. */
  saved: boolean
}

export interface StorySentence {
  text: string
  /** The saved words in this sentence, as they are written in it. */
  marks: Array<{ wordId: string; surface: string }>
}

export interface Story {
  id: string
  languageCode: string
  step: number
  title: string
  sentences: StorySentence[]
  words: StoryWord[]
  /** The conversation started from it, if any. */
  conversationId: string | null
  createdAt: string
}

/** Pasted text shorter than this is not enough to rewrite. */
export const IMPORT_MIN_LENGTH = 80
/** What the page accepts in one paste. */
export const IMPORT_MAX_LENGTH = 20_000
export const IMPORT_QUESTIONS = 3

export interface ImportedContent {
  id: string
  languageCode: string
  step: number
  /** Title of the rewritten text, in the learning language. */
  title: string
  /** The material retold at the learner's difficulty. */
  summary: string
  questions: string[]
  /** Words worth keeping from the retelling. wordId is set once a word is in the wordbook. */
  words: Array<{ term: string; meaning: string; wordId: string | null }>
  source: { kind: 'text' | 'url'; url: string | null; title: string }
  createdAt: string
}

export interface ImportedContentSummary {
  id: string
  languageCode: string
  title: string
  source: { kind: 'text' | 'url'; url: string | null; title: string }
  createdAt: string
}

export const PATH_ITEMS = 3

/** One conversation worth having next. */
export interface PathItem {
  id: string
  title: string
  setting: string
  partnerRole: string
  topic: string
  step: number
  /** Saved words due for review that fit this conversation. */
  words: Array<{ wordId: string; term: string; meaning: string }>
  /** The kind of mistake this conversation naturally works on. */
  mistake: ErrorCategory | null
  /** Set once the learner started it. */
  conversationId: string | null
}

export interface LearningPath {
  id: string
  languageCode: string
  createdAt: string
  items: PathItem[]
}
