/**
 * Measures a piece of text in the learning language: how long its sentences are and how many
 * of its words fall outside the common ones. Works from packaged word-frequency lists
 * (resources/wordfreq, see the README there) and the platform's own word and sentence segmenter.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { DifficultyProfile } from '../shared/proficiency.js'
import { lengthRule } from '../shared/proficiency.js'

const lists = new Map<string, Map<string, number> | null>()

function baseCode(languageCode: string) {
  return String(languageCode || '').toLowerCase().split(/[-_]/u)[0]
}

function wordListRoot() {
  return process.env.LLC_WORDFREQ_DIR || path.resolve(process.cwd(), 'resources/wordfreq')
}

/** Word to frequency rank (1 is the most common), or null when no list is packaged for the language. */
export function wordRanks(languageCode: string): Map<string, number> | null {
  const code = baseCode(languageCode)
  if (!/^[a-z]{2,3}$/u.test(code)) return null
  const key = wordListRoot() + '|' + code
  if (lists.has(key)) return lists.get(key) || null
  let ranks: Map<string, number> | null = null
  try {
    const file = path.join(wordListRoot(), code + '.txt')
    if (existsSync(file)) {
      ranks = new Map()
      let rank = 0
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const word = line.trim()
        if (!word) continue
        rank += 1
        if (!ranks.has(word)) ranks.set(word, rank)
      }
      if (ranks.size < 1000) ranks = null
    }
  } catch {
    ranks = null
  }
  lists.set(key, ranks)
  return ranks
}

const segmenters = new Map<string, Intl.Segmenter>()

function segmenter(languageCode: string, granularity: 'word' | 'sentence') {
  const key = granularity + ':' + baseCode(languageCode)
  let value = segmenters.get(key)
  if (!value) {
    try {
      value = new Intl.Segmenter(baseCode(languageCode) || 'en', { granularity })
    } catch {
      value = new Intl.Segmenter('en', { granularity })
    }
    segmenters.set(key, value)
  }
  return value
}

export interface TextToken {
  /** As written. */
  text: string
  /** Lower-cased and normalised, for looking up. */
  key: string
  /** First word of its sentence. */
  first: boolean
}

export function sentencesOf(text: string, languageCode: string) {
  const value = String(text || '').trim()
  if (!value) return []
  return [...segmenter(languageCode, 'sentence').segment(value)]
    .map((item) => item.segment.trim())
    .filter((item) => /[\p{L}\p{N}]/u.test(item))
}

export function wordsOf(sentence: string, languageCode: string): TextToken[] {
  const tokens: TextToken[] = []
  for (const item of segmenter(languageCode, 'word').segment(sentence)) {
    if (!item.isWordLike) continue
    tokens.push({
      text: item.segment,
      key: item.segment.normalize('NFC').toLowerCase().replace(/[\u2019\u02bc]/gu, "'"),
      first: tokens.length === 0,
    })
  }
  return tokens
}

/** Length in the unit the language is measured in: words, or characters where words are not spaced. */
export function textLength(text: string, languageCode: string) {
  if (lengthRule(languageCode).unit === 'characters') return (String(text || '').match(/[\p{L}\p{N}]/gu) || []).length
  return sentencesOf(text, languageCode).reduce((total, sentence) => total + wordsOf(sentence, languageCode).length, 0)
}

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3

/** The same syllable without its final consonant: 샀 becomes 사. Verb endings fuse into the stem this way. */
function openSyllable(character: string) {
  const code = character.charCodeAt(0)
  if (code < HANGUL_START || code > HANGUL_END) return character
  return String.fromCharCode(code - ((code - HANGUL_START) % 28))
}

// The polite formal endings: 습니다 after a consonant, and ㅂ니다 fused into a stem that ends in a vowel (가 + ㅂ니다 = 갑니다).
const FINAL_BIEUP = 17

function formalStem(characters: string[]) {
  if (characters.length < 3) return ''
  const ending = characters.slice(-2).join('')
  if (ending !== '니다' && ending !== '니까') return ''
  const before = characters[characters.length - 3]
  const head = characters.slice(0, -3).join('')
  if (before === '습') return head
  const code = before.charCodeAt(0)
  if (code < HANGUL_START || code > HANGUL_END || (code - HANGUL_START) % 28 !== FINAL_BIEUP) return ''
  return head + openSyllable(before)
}

function koreanRank(key: string, ranks: Map<string, number>): number | undefined {
  const whole = ranks.get(key)
  // A verb in the formal style is as common as its stem, however rarely that exact form was counted.
  const formal = ranks.get(formalStem([...key]))
  if (formal) return whole ? Math.min(whole, formal) : formal
  // The list holds stems and particles, and some whole words; running text has stems and endings joined.
  // Take the longest stem found, and the better of it and the word as written.
  const characters = [...key]
  for (let length = characters.length - 1; length >= 1; length -= 1) {
    const stem = characters.slice(0, length).join('')
    const open = characters.slice(0, length - 1).join('') + openSyllable(characters[length - 1])
    // 드러냈 is listed, and so is 드러내 it comes from: the word is as common as the more common of the two.
    const closed = ranks.get(stem)
    const opened = open !== stem ? ranks.get(open) : undefined
    const rank = closed && opened ? Math.min(closed, opened) : closed || opened
    if (!rank) continue
    // One syllable says too little about a word of three or more, or about one the list knows as written.
    if (length === 1 && (characters.length >= 3 || whole)) return whole
    return whole ? Math.min(whole, rank) : rank
  }
  return whole
}

function chineseRank(key: string, ranks: Map<string, number>): number | undefined {
  const whole = ranks.get(key)
  if (whole) return whole
  const characters = [...key]
  if (characters.length < 2) return undefined
  let worst = 0
  for (const character of characters) {
    const rank = ranks.get(character)
    if (!rank) return undefined
    worst = Math.max(worst, rank)
  }
  return worst
}

const KANA_ONLY = /^[\p{Script=Hiragana}\u30fc]+$/u
const HAS_HAN = /\p{Script=Han}/u

function japaneseRank(key: string, next: string | undefined, ranks: Map<string, number>): number | undefined {
  const whole = ranks.get(key)
  // Inflected stems are listed with the first sound of their ending: 言 is found as 言っ, 買 as 買い.
  const joined = HAS_HAN.test(key) && next && KANA_ONLY.test(next) ? ranks.get(key + [...next][0]) : undefined
  if (whole && joined) return Math.min(whole, joined)
  if (whole || joined) return whole || joined
  // Endings and particles written in hiragana are grammar, not vocabulary.
  if (KANA_ONLY.test(key)) return 1
  return undefined
}

function spacedRank(key: string, ranks: Map<string, number>): number | undefined {
  const whole = ranks.get(key)
  if (!/['-]/u.test(key)) return whole
  // j'ai, committee's, well-known: judge by the parts that carry meaning,
  // so that a possessive is as common as the word it is made from.
  let worst = 0
  let counted = 0
  for (const part of key.split(/['-]/u)) {
    if (!part) continue
    const rank = ranks.get(part) || ranks.get(part + "'")
    if (!rank) {
      if ([...part].length <= 2) continue
      return whole
    }
    worst = Math.max(worst, rank)
    counted += 1
  }
  if (!counted) return whole
  return whole ? Math.min(whole, worst) : worst
}

/** Frequency rank of a word as it appears in running text. Undefined when the list does not know it. */
export function rankOf(token: string, languageCode: string, next?: string): number | undefined {
  const ranks = wordRanks(languageCode)
  if (!ranks) return undefined
  const key = token.normalize('NFC').toLowerCase().replace(/[\u2019\u02bc]/gu, "'")
  const code = baseCode(languageCode)
  if (code === 'ko') return koreanRank(key, ranks)
  if (code === 'zh') return chineseRank(key, ranks)
  if (code === 'ja') return japaneseRank(key, next, ranks)
  return spacedRank(key, ranks)
}

export interface TextMeasure {
  sentences: number
  /** Length of the longest sentence, in the language's unit. */
  longestSentence: number
  /** Total length, in the language's unit. */
  length: number
  /** Words that were judged for how common they are. */
  judgedWords: number
  /** Words outside the common range, each once, in order of appearance. */
  rareWords: string[]
  /** Occurrences of words outside the common range, over the judged words. */
  rareShare: number
  /** Whether a word list was available, so that the vocabulary numbers mean something. */
  vocabularyChecked: boolean
}

export interface MeasureOptions {
  /** Words up to this rank are common. 0 skips the vocabulary check. */
  commonRank: number
  /** Words that do not count as rare whatever their rank: the learner's own, the scene's. */
  known?: Set<string>
}

function isName(token: TextToken, languageCode: string) {
  // German capitalises every noun, so capitals say nothing there.
  if (token.first || baseCode(languageCode) === 'de') return false
  const first = [...token.text][0]
  return first !== first.toLowerCase() && first === first.toUpperCase()
}

export function measureText(text: string, languageCode: string, options: MeasureOptions): TextMeasure {
  const characters = lengthRule(languageCode).unit === 'characters'
  const ranks = options.commonRank > 0 ? wordRanks(languageCode) : null
  const korean = baseCode(languageCode) === 'ko'
  let longestSentence = 0
  let length = 0
  let judged = 0
  let rare = 0
  const rareWords: string[] = []
  const sentences = sentencesOf(text, languageCode)
  for (const sentence of sentences) {
    const tokens = wordsOf(sentence, languageCode)
    const size = characters ? (sentence.match(/[\p{L}\p{N}]/gu) || []).length : tokens.length
    longestSentence = Math.max(longestSentence, size)
    length += size
    if (!ranks) continue
    tokens.forEach((token, index) => {
      if (!/\p{L}/u.test(token.key) || isName(token, languageCode)) return
      if (options.known?.has(token.key)) {
        judged += 1
        return
      }
      const rank = rankOf(token.key, languageCode, tokens[index + 1]?.key)
      // Korean words the stems cannot place are left out rather than called rare.
      if (rank === undefined && korean) return
      judged += 1
      if (rank !== undefined && rank <= options.commonRank) return
      rare += 1
      if (!rareWords.includes(token.text)) rareWords.push(token.text)
    })
  }
  return {
    sentences: sentences.length,
    longestSentence,
    length,
    judgedWords: judged,
    rareWords,
    rareShare: judged ? Number((rare / judged).toFixed(3)) : 0,
    vocabularyChecked: Boolean(ranks),
  }
}

/** The words of a text as lookup keys, for telling the check which words the learner already uses. */
export function wordKeys(text: string, languageCode: string) {
  const keys = new Set<string>()
  for (const sentence of sentencesOf(text, languageCode)) {
    for (const token of wordsOf(sentence, languageCode)) keys.add(token.key)
  }
  return keys
}

export type DifficultyIssue =
  | { kind: 'sentence_length'; longest: number; limit: number; unit: 'words' | 'characters' }
  | { kind: 'sentence_count'; sentences: number; limit: number }
  | { kind: 'vocabulary'; words: string[]; share: number; limit: number }

// A reply is only sent back for rewriting when it is clearly over, not for a word or two.
const LENGTH_SLACK = 1.3
const SENTENCE_SLACK = 1
const MIN_RARE_WORDS = 3

export function difficultyIssues(measure: TextMeasure, profile: DifficultyProfile): DifficultyIssue[] {
  const issues: DifficultyIssue[] = []
  if (measure.longestSentence > Math.ceil(profile.maxSentenceLength * LENGTH_SLACK)) {
    issues.push({ kind: 'sentence_length', longest: measure.longestSentence, limit: profile.maxSentenceLength, unit: profile.unit })
  }
  if (measure.sentences > profile.maxSentences + SENTENCE_SLACK) {
    issues.push({ kind: 'sentence_count', sentences: measure.sentences, limit: profile.maxSentences })
  }
  if (measure.vocabularyChecked && profile.commonRank > 0 && measure.rareWords.length >= MIN_RARE_WORDS && measure.rareShare > profile.rareShare) {
    issues.push({ kind: 'vocabulary', words: measure.rareWords.slice(0, 8), share: measure.rareShare, limit: profile.rareShare })
  }
  return issues
}

export function checkReplyDifficulty(text: string, languageCode: string, profile: DifficultyProfile, known?: Set<string>) {
  const measure = measureText(text, languageCode, { commonRank: profile.commonRank, known })
  return { measure, issues: difficultyIssues(measure, profile) }
}
