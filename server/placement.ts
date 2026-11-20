import {
  CEFR_LEVELS, MAX_STEP, clampStep, difficultyProfile, lengthRule, stepOf, stepParts,
  type CefrLevel, type LengthUnit,
} from '../shared/proficiency.js'
import { EXPRESSION_BANDS, EXPRESSION_TASKS, type ExpressionBand, type ExpressionTask, type PlacementKind, type PlacementMode } from '../shared/placement.js'
import { checkReplyDifficulty, sentencesOf, textLength } from './proficiency-text.js'

export { EXPRESSION_BANDS, EXPRESSION_TASKS }
export type { ExpressionBand, ExpressionTask, PlacementKind, PlacementMode }

/**
 * The order of a test. Comprehension comes first, because the open questions are pitched at
 * the level the choices point to. Without a voice to read aloud, listening gives its place to reading.
 */
export function placementPlan(mode: PlacementMode, listening: boolean): PlacementKind[] {
  const heard: PlacementKind = listening ? 'listening' : 'reading'
  if (mode === 'quick') return ['reading', 'reading', heard, 'reading', 'expression']
  return ['reading', 'reading', heard, 'reading', 'reading', heard, 'reading', 'expression', 'expression', 'expression']
}

/** Open questions go from the concrete to the abstract. A short check asks for one opinion. */
export function expressionTaskAt(mode: PlacementMode, position: number): ExpressionTask {
  if (mode === 'quick') return 'opinion'
  return EXPRESSION_TASKS[Math.max(0, Math.min(EXPRESSION_TASKS.length - 1, position))]
}

export function expressionBand(step: number): ExpressionBand {
  const value = clampStep(Math.round(step))
  if (value <= stepOf('A2', 'high')) return 'low'
  if (value <= stepOf('B2', 'high')) return 'mid'
  return 'high'
}

/** The level the next choice question is written for. A short check stays within a level of where it started. */
export function itemLevel(ability: number, mode: PlacementMode, startStep: number): CefrLevel {
  const index = CEFR_LEVELS.indexOf(stepParts(clampStep(Math.round(ability))).level)
  if (mode !== 'quick') return CEFR_LEVELS[index]
  const start = CEFR_LEVELS.indexOf(stepParts(clampStep(startStep)).level)
  return CEFR_LEVELS[Math.max(start - 1, Math.min(start + 1, index))]
}

/** The step an item written for a level counts as. */
export function itemStep(level: CefrLevel) {
  return stepOf(level, 'mid')
}

/** The levels to write in one request: the one needed now first, then the ones the test is most likely to move to. */
export function levelsToPrepare(level: CefrLevel, most = 3): CefrLevel[] {
  const index = CEFR_LEVELS.indexOf(level)
  return [index, index + 1, index - 1, index + 2, index - 2]
    .filter((value) => value >= 0 && value < CEFR_LEVELS.length)
    .slice(0, Math.max(1, most))
    .map((value) => CEFR_LEVELS[value])
}

const READING_WORDS: Record<CefrLevel, [number, number]> = {
  A1: [20, 40], A2: [35, 60], B1: [55, 90], B2: [80, 120], C1: [100, 150], C2: [120, 170],
}
const LISTENING_WORDS: Record<CefrLevel, [number, number]> = {
  A1: [5, 10], A2: [9, 16], B1: [14, 24], B2: [20, 32], C1: [26, 40], C2: [30, 46],
}
const TOPICS: Record<CefrLevel, string> = {
  A1: 'the learner’s immediate world: family, food, home, the time, shopping, a daily routine',
  A2: 'everyday errands and plans: a trip to the shop, a simple past event, directions, a weekend plan, a short message to a friend',
  B1: 'familiar matters with some detail: work, school, travel, an experience and how it felt, a plain opinion with a reason',
  B2: 'matters of general interest: a current issue, an argument with reasons on both sides, a problem at work and how it was handled',
  C1: 'demanding subjects: a nuanced argument, a professional or academic matter, a text whose writer’s attitude has to be read between the lines',
  C2: 'anything an educated native reader would read: dense or literary prose, irony, understatement, fine shades of meaning',
}
const FOCUS: Record<CefrLevel, string> = {
  A1: 'one fact the text states outright',
  A2: 'one fact the text states, said in other words in the right answer',
  B1: 'the main point, or a detail that needs two sentences put together',
  B2: 'the reason behind something or what is implied, not just what is stated',
  C1: 'the writer’s or speaker’s attitude or an inference the text never states',
  C2: 'a subtle implication, irony or shade of meaning that a careless reader would miss',
}
const STRUCTURES: Record<CefrLevel, string> = {
  A1: 'short main clauses, the present, the most basic words',
  A2: 'simple sentences joined by and, but, because; everyday past and future',
  B1: 'common subordinate clauses and the ordinary tenses; everyday words with a few less common ones',
  B2: 'longer sentences with relative and conditional clauses; a wide everyday and general vocabulary',
  C1: 'complex sentences, varied connectors, precise and sometimes abstract vocabulary',
  C2: 'whatever a skilled native writer would use, including idiom and rare words',
}

export interface ItemSpec {
  level: CefrLevel
  kind: 'reading' | 'listening'
  unit: LengthUnit
  minLength: number
  maxLength: number
  maxSentenceLength: number
  topics: string
  focus: string
  structures: string
}

/** What an item for one level has to look like in one language. */
export function itemSpec(level: CefrLevel, kind: 'reading' | 'listening', languageCode: string): ItemSpec {
  const rule = lengthRule(languageCode)
  const [low, high] = (kind === 'reading' ? READING_WORDS : LISTENING_WORDS)[level]
  return {
    level,
    kind,
    unit: rule.unit,
    minLength: Math.max(3, Math.round(low * rule.factor)),
    maxLength: Math.round(high * rule.factor),
    maxSentenceLength: difficultyProfile(stepOf(level, 'high'), languageCode).maxSentenceLength,
    topics: TOPICS[level],
    focus: FOCUS[level],
    structures: STRUCTURES[level],
  }
}

export interface PlacementItem {
  /** What is read or heard, in the language being learned. */
  text: string
  /** The question and the four choices, in the interface language. */
  question: string
  options: string[]
  /** Index of the right choice. It never leaves the server. */
  answer: number
}

export type ItemProblem = 'empty' | 'options' | 'answer' | 'length' | 'sentence_length' | 'vocabulary'

function sameChoice(a: string, b: string) {
  const plain = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
  return plain(a) === plain(b)
}

/** What is wrong with an item as written. An item with any problem is thrown away. */
export function itemProblems(item: PlacementItem, spec: ItemSpec, languageCode: string): ItemProblem[] {
  const problems: ItemProblem[] = []
  if (!item.text.trim() || !item.question.trim()) problems.push('empty')
  const options = item.options.map((option) => option.trim())
  const distinct = options.every((option, index) => option && options.every((other, at) => at === index || !sameChoice(option, other)))
  if (options.length !== 4 || !distinct) problems.push('options')
  if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= options.length) problems.push('answer')
  const length = textLength(item.text, languageCode)
  // Models count loosely, so the range is held loosely too.
  if (length < spec.minLength * 0.6 || length > spec.maxLength * 1.5) problems.push('length')
  const own = difficultyProfile(stepOf(spec.level, 'high'), languageCode)
  // A text has a subject, and the nouns of a subject are rarer than their level: words are held to the level above.
  const above = difficultyProfile(stepOf(CEFR_LEVELS[Math.min(CEFR_LEVELS.length - 1, CEFR_LEVELS.indexOf(spec.level) + 1)], 'high'), languageCode)
  const sentences = sentencesOf(item.text, languageCode).length + 1
  if (checkReplyDifficulty(item.text, languageCode, { ...own, maxSentences: sentences }).issues.some((issue) => issue.kind === 'sentence_length')) problems.push('sentence_length')
  if (checkReplyDifficulty(item.text, languageCode, { ...above, maxSentences: sentences }).issues.some((issue) => issue.kind === 'vocabulary')) problems.push('vocabulary')
  return problems
}

/** Puts the choices in a random order, so that no position is right more often than another. */
export function shuffleItem(item: PlacementItem, random: () => number = Math.random): PlacementItem {
  const order = item.options.map((_, index) => index)
  for (let index = order.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[order[index], order[other]] = [order[other], order[index]]
  }
  return { ...item, options: order.map((index) => item.options[index]), answer: order.indexOf(item.answer) }
}

// A few words cannot show a high level, however well chosen. Lengths are in words, scaled per language.
const LENGTH_CEILINGS: Array<[number, CefrLevel]> = [[5, 'A1'], [12, 'A2'], [25, 'B1'], [45, 'B2'], [70, 'C1']]

/** The highest step an answer of this length can be given. */
export function expressionCeiling(text: string, languageCode: string) {
  const rule = lengthRule(languageCode)
  const length = textLength(text, languageCode)
  for (const [words, level] of LENGTH_CEILINGS) {
    if (length < Math.round(words * rule.factor)) return stepOf(level, 'high')
  }
  return MAX_STEP
}
