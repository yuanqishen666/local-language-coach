/**
 * Whether a saved word turns up in a piece of text, and whether the learner got it right.
 *
 * Inflection is handled by a few plain rules per language. They lean towards missing a form
 * rather than seeing one that is not there: a missed use only goes uncounted, while a use that
 * never happened would push a word's next review away.
 */
import type { WordUse } from '../shared/wordbook.js'

export interface SavedTerm {
  term: string
  lemma?: string | null
}

export interface FoundUse {
  /** The word as it is written in the text. */
  surface: string
  index: number
}

interface Token {
  text: string
  key: string
  index: number
}

function baseCode(languageCode: string) {
  return String(languageCode || '').toLowerCase().split('-')[0]
}

function norm(value: string) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\u2019\u02bc]/gu, "'").trim()
}

function tokens(text: string): Token[] {
  const found: Token[] = []
  for (const match of String(text || '').matchAll(/[\p{L}\p{M}\p{N}'\u2019]+/gu)) {
    found.push({ text: match[0], key: norm(match[0]), index: match.index })
  }
  return found
}

function points(value: string) {
  return [...value]
}

const ENGLISH_ENDING = /^(s|es|ed|d|ing|er|est|ly|'s)$/u

function englishForm(token: string, part: string) {
  if (part.length < 2) return false
  if (token.startsWith(part)) {
    const rest = token.slice(part.length)
    if (ENGLISH_ENDING.test(rest)) return true
    // stop → stopped, run → running
    if (rest[0] === part.at(-1) && /^(ed|ing|er|est)$/u.test(rest.slice(1))) return true
  }
  // make → making, nice → nicer
  if (part.endsWith('e') && part.length >= 3 && token.startsWith(part.slice(0, -1)) && /^(ing|ed|er|est)$/u.test(token.slice(part.length - 1))) return true
  // carry → carried, happy → happier
  if (part.endsWith('y') && part.length >= 3 && token.startsWith(part.slice(0, -1) + 'i') && /^(ed|es|er|est|ly)$/u.test(token.slice(part.length))) return true
  return false
}

/** Endings a verb drops when it is conjugated. */
const INFINITIVE: Record<string, RegExp> = {
  es: /(ar|er|ir)(se)?$/u,
  pt: /(ar|er|ir|or)$/u,
  it: /(are|ere|ire|arsi|ersi|irsi)$/u,
  fr: /(er|ir|re)$/u,
  de: /(en|n)$/u,
}

function stemForm(token: string, part: string, code: string) {
  const size = points(part).length
  if (size <= 4) return token.startsWith(part) && points(token).length <= size + 2
  const cut = part.replace(INFINITIVE[code] || /$^/u, '')
  const stem = cut !== part && points(cut).length >= 4 ? cut : points(part).slice(0, -1).join('')
  if (points(token).length > size + 4) return false
  if (token.startsWith(stem)) return true
  // machen → gemacht
  return code === 'de' && cut !== part && token.startsWith('ge') && token.slice(2).startsWith(stem)
}

const HINDI_VERB_ENDING = /^(ता|ती|ते|ा|ी|े|ें|ो|ूँ|ूं|या|यी|ये|ई|ए|िए|िये|कर|ने|नी|ेगा|ेगी|ेंगे|ूँगा|ूंगा|ूँगी|ूंगी|ोगे|ोगी)$/u

function hindiForm(token: string, part: string) {
  // करना → करता, करेंगे, किया is irregular and missed
  if (part.endsWith('ना') && points(part).length >= 4) {
    const stem = part.slice(0, -2)
    if (token.startsWith(stem) && HINDI_VERB_ENDING.test(token.slice(stem.length))) return true
  }
  // लड़का → लड़के, लड़कों
  if (part.endsWith('ा') && points(part).length >= 3) {
    const stem = part.slice(0, -1)
    if (token.startsWith(stem) && /^(े|ी|ों|ो)$/u.test(token.slice(stem.length))) return true
  }
  return token.startsWith(part) && points(token).length <= points(part).length + 2
}

const HANGUL_FIRST = 0xac00
const HANGUL_LAST = 0xd7a3

function syllable(char: string) {
  const code = char.codePointAt(0) || 0
  if (code < HANGUL_FIRST || code > HANGUL_LAST) return null
  const offset = code - HANGUL_FIRST
  return { lead: Math.floor(offset / 588), vowel: Math.floor((offset % 588) / 28), tail: offset % 28 }
}

/** The vowels a stem's last vowel may turn into when an ending fuses with it: 오 → 와, 시 → 셔, 하 → 해. */
const FUSED_VOWELS: Record<number, number[]> = { 0: [0, 1], 8: [8, 9], 13: [13, 14], 20: [20, 6], 18: [18, 4, 0], 11: [11, 10] }
const KOREAN_SHORT_ENDING = /(요|다|서|고|면|죠|지만|는데|니까)$/u

function koreanVerbForm(token: string, stem: string) {
  if (!stem) return false
  const before = stem.slice(0, -1)
  if (!token.startsWith(before) || token.length <= before.length) return false
  if (token.length > stem.length + 5) return false
  const last = syllable(stem.at(-1) || '')
  const next = syllable(token[before.length])
  if (!last || !next || next.lead !== last.lead) return false
  // A stem that ends in a consonant keeps its last syllable as it is.
  if (last.tail) return token[before.length] === stem.at(-1)
  if (!(FUSED_VOWELS[last.vowel] || [last.vowel]).includes(next.vowel)) return false
  // A one-syllable stem looks like the start of many nouns, so the ending has to be a verb's.
  if (stem.length === 1) return token.length <= 5 && token.length > 1 && KOREAN_SHORT_ENDING.test(token)
  return true
}

function koreanForm(token: string, part: string) {
  if (part.endsWith('하다') && part.length >= 4) return token.startsWith(part.slice(0, -2)) && token.length <= part.length + 4
  if (part.endsWith('다') && part.length >= 2) return koreanVerbForm(token, part.slice(0, -1))
  return part.length >= 2 && token.startsWith(part) && token.length <= part.length + 3
}

function sameWord(token: string, part: string, code: string) {
  if (token === part) return true
  if (code === 'en') return englishForm(token, part)
  if (code === 'ko') return koreanForm(token, part)
  if (code === 'hi') return hindiForm(token, part)
  return stemForm(token, part, code)
}

/** How far apart the words of a saved phrase may stand: give it up, sich sehr freuen. */
const PHRASE_GAP = 3

function spacedUse(text: string, form: string, code: string): FoundUse | null {
  const parts = tokens(form).map((token) => token.key)
  if (!parts.length) return null
  const words = tokens(text)
  for (let start = 0; start < words.length; start += 1) {
    if (!sameWord(words[start].key, parts[0], code)) continue
    let at = start
    let whole = true
    for (const part of parts.slice(1)) {
      let next = -1
      for (let index = at + 1; index <= Math.min(words.length - 1, at + PHRASE_GAP); index += 1) {
        if (sameWord(words[index].key, part, code)) { next = index; break }
      }
      if (next < 0) { whole = false; break }
      at = next
    }
    if (!whole) continue
    const first = words[start]
    const last = words[at]
    // A phrase used with nothing in between is shown whole; one that was split shows its first word.
    const joined = at - start === parts.length - 1
    return { surface: joined ? text.slice(first.index, last.index + last.text.length) : first.text, index: first.index }
  }
  return null
}

const KANA = /[\u3041-\u3096]/u
const KANJI = /[\u4e00-\u9fff\u3005]/u

/** What may follow the stem of a verb or adjective, by the kana its dictionary form ends in. */
const JAPANESE_ROWS: Record<string, string> = {
  う: 'わいうえおっ', く: 'かきくけこいっ', ぐ: 'がぎぐげごい', す: 'さしすせそ', つ: 'たちつてとっ', ぬ: 'なにぬねのん',
  ぶ: 'ばびぶべぼん', む: 'まみむめもん', る: 'らりるれろっまたてなよ', い: 'いかくけさ',
}

function plainFind(text: string, form: string): FoundUse | null {
  const direct = text.toLowerCase().indexOf(form.toLowerCase())
  if (direct >= 0) return { surface: text.slice(direct, direct + form.length), index: direct }
  const index = norm(text).indexOf(norm(form))
  return index >= 0 ? { surface: form, index } : null
}

function japaneseUse(text: string, form: string): FoundUse | null {
  const whole = plainFind(text, form)
  if (whole) return whole
  const last = form.at(-1) || ''
  const row = JAPANESE_ROWS[last]
  if (!row || !KANJI.test(form)) return null
  const stem = form.slice(0, -1)
  for (let index = text.indexOf(stem); index >= 0; index = text.indexOf(stem, index + 1)) {
    const next = text[index + stem.length] || ''
    // 食べる → 食べます: a stem that already ends in kana is enough on its own.
    if (stem.length >= 2 && KANA.test(stem.at(-1) || '') && KANA.test(next)) return { surface: stem, index }
    if (next && row.includes(next)) return { surface: stem + next, index }
  }
  return null
}

/** Where the saved word is used in the text, in any of the forms the rules know. */
export function wordUse(text: string, word: SavedTerm, languageCode: string): FoundUse | null {
  const code = baseCode(languageCode)
  const forms = [...new Set([word.term, word.lemma || ''].map((value) => String(value || '').trim()).filter(Boolean))]
  for (const form of forms) {
    const found = code === 'zh' ? plainFind(text, form)
      : code === 'ja' ? japaneseUse(text, form)
      : spacedUse(text, norm(form), code)
    if (found) return found
  }
  return null
}

/** Whether a form stands in the text as a word of its own, not as part of a longer one. */
function hasForm(text: string, form: string) {
  // Chinese and Japanese are not spaced, so there a form is simply looked for.
  if (/[\u3040-\u30ff\u4e00-\u9fff]/u.test(form)) return norm(text).includes(norm(form))
  const words = (value: string) => ' ' + tokens(value).map((token) => token.key).join(' ') + ' '
  return words(text).includes(words(form))
}

/** A used word counts as a slip when a correction took that very form out of the sentence. */
export function useResult(surface: string, corrections: Array<{ original: string; improved: string }>): WordUse {
  if (!norm(surface)) return 'right'
  return corrections.some((item) => hasForm(item.original, surface) && !hasForm(item.improved, surface)) ? 'slip' : 'right'
}
