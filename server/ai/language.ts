import { francAll } from 'franc-min'
import { normalizeUiLocale, type UiLocale } from '../../shared/locales.js'

const languageCodes = ['cmn', 'eng', 'spa', 'fra', 'jpn', 'deu', 'kor', 'ita', 'por', 'hin']

const localeLanguage: Record<UiLocale, string> = {
  'zh-CN': 'cmn',
  'en-US': 'eng',
  'es-419': 'spa',
  'fr-FR': 'fra',
  'ja-JP': 'jpn',
  'de-DE': 'deu',
  'ko-KR': 'kor',
  'it-IT': 'ita',
  'pt-BR': 'por',
  'hi-IN': 'hin',
}

const targetLanguage: Record<string, string> = {
  zh: 'cmn', en: 'eng', es: 'spa', fr: 'fra', ja: 'jpn',
  de: 'deu', ko: 'kor', it: 'ita', pt: 'por', hi: 'hin',
}

const latinMarkers: Record<string, Set<string>> = {
  eng: new Set(['a', 'adjective', 'adverb', 'an', 'and', 'are', 'as', 'at', 'common', 'custom', 'daily', 'does', 'for', 'formal', 'from', 'friendly', 'great', 'hello', 'hi', 'in', 'informal', 'is', 'it', 'means', 'noun', 'of', 'okay', 'on', 'or', 'past', 'plural', 'present', 'regional', 'singular', 'study', 'sure', 'thanks', 'the', 'this', 'to', 'travel', 'use', 'used', 'verb', 'with', 'work', 'yes', 'you']),
  spa: new Set(['adjetivo', 'adverbio', 'al', 'bien', 'charla', 'como', 'común', 'con', 'de', 'del', 'el', 'en', 'es', 'esta', 'este', 'formal', 'forma', 'genial', 'gracias', 'hablar', 'hola', 'informal', 'la', 'las', 'los', 'para', 'pasado', 'plural', 'por', 'presente', 'que', 'se', 'significa', 'singular', 'sí', 'sustantivo', 'una', 'un', 'uso', 'verbo', 'y']),
  fra: new Set(['adjectif', 'adverbe', 'bien', 'bonjour', 'ce', 'cette', 'conversation', 'courant', 'dans', 'de', 'des', 'du', 'en', 'est', 'et', 'forme', 'formel', 'génial', 'informel', 'la', 'le', 'les', 'merci', 'mot', 'nom', 'oui', 'par', 'passé', 'pluriel', 'pour', 'présent', 'que', 'se', 'signifie', 'singulier', 'une', 'un', 'usage', 'verbe']),
  deu: new Set(['adjektiv', 'adverb', 'als', 'bedeutet', 'das', 'danke', 'dem', 'den', 'der', 'die', 'dieses', 'ein', 'eine', 'formell', 'für', 'gespräch', 'hallo', 'im', 'in', 'ist', 'ja', 'man', 'mit', 'oder', 'substantiv', 'toll', 'umgangssprachlich', 'und', 'verwendet', 'verb', 'von', 'wort', 'zu']),
  ita: new Set(['aggettivo', 'avverbio', 'bene', 'che', 'ciao', 'come', 'comune', 'con', 'conversazione', 'del', 'della', 'di', 'e', 'è', 'formale', 'forma', 'grazie', 'i', 'il', 'in', 'indica', 'informale', 'la', 'le', 'lo', 'nel', 'ottimo', 'parola', 'per', 'plurale', 'si', 'significa', 'singolare', 'sì', 'sostantivo', 'una', 'un', 'uso', 'verbo']),
  por: new Set(['adjetivo', 'advérbio', 'a', 'ao', 'bem', 'com', 'comum', 'conversa', 'da', 'das', 'de', 'do', 'e', 'em', 'esta', 'formal', 'forma', 'informal', 'na', 'no', 'o', 'obrigado', 'obrigada', 'olá', 'os', 'ótimo', 'para', 'palavra', 'plural', 'por', 'que', 'se', 'significa', 'singular', 'sim', 'substantivo', 'uma', 'um', 'uso', 'verbo', 'você']),
}

function scriptCount(value: string, expression: RegExp) {
  return [...value].filter((character) => expression.test(character)).length
}

function expectedCode(language: string) {
  if (Object.hasOwn(targetLanguage, language.toLowerCase())) return targetLanguage[language.toLowerCase()]
  return localeLanguage[normalizeUiLocale(language)]
}

/**
 * Deterministic guard for model-written user-facing text. Script checks catch
 * even very short cross-language leaks; franc handles the six Latin-script
 * interface languages once there is enough text to classify reliably.
 */
function matchesExpectedLanguageUnit(value: string, language: string) {
  const text = value.normalize('NFC').replace(/https?:\/\/\S+/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (!text) return true

  const expected = expectedCode(language)
  const han = scriptCount(text, /[\p{Script=Han}]/u)
  const kana = scriptCount(text, /[\p{Script=Hiragana}\p{Script=Katakana}]/u)
  const hangul = scriptCount(text, /[\p{Script=Hangul}]/u)
  const devanagari = scriptCount(text, /[\p{Script=Devanagari}]/u)
  const latin = scriptCount(text, /[\p{Script=Latin}]/u)
  const visibleLetters = han + kana + hangul + devanagari + latin

  if (expected === 'cmn') return han >= 2 && kana === 0 && hangul === 0 && devanagari === 0 && latin <= Math.max(8, han / 2)
  if (expected === 'jpn') return kana >= 2 && hangul === 0 && devanagari === 0 && latin <= Math.max(8, (han + kana) / 2)
  if (expected === 'kor') return hangul >= 2 && kana === 0 && devanagari === 0 && latin <= Math.max(8, hangul / 2)
  if (expected === 'hin') return devanagari >= 2 && han + kana + hangul === 0 && latin <= Math.max(8, devanagari / 2)

  // Latin-language explanations may legitimately quote one target-language
  // term. They must not be predominantly written in another script.
  if (han + kana + hangul + devanagari > 0) return false
  const tokens = text.toLocaleLowerCase().match(/[\p{Script=Latin}]+/gu) || []
  if (visibleLetters < 18 || text.length < 24) {
    const expectedMarkers = latinMarkers[expected]
    if (!expectedMarkers) return true
    if (tokens.some((token) => expectedMarkers.has(token))) return true
    const otherLanguageAppears = Object.entries(latinMarkers)
      .some(([code, markers]) => code !== expected && tokens.some((token) => markers.has(token)))
    return tokens.length > 1 && !otherLanguageAppears
  }

  const ranked = francAll(text, { only: languageCodes, minLength: 10 })
  const top = ranked[0]
  if (!top || top[0] === 'und') return false

  // franc often ranks Portuguese, Spanish, and Italian in the wrong order.
  // Count only markers unique to one supported Latin language before using
  // its trigram ranking; this also rejects a complete response in a nearby
  // language instead of admitting it as a near match.
  const exclusiveScores = Object.fromEntries(Object.keys(latinMarkers).map((code) => [code, 0])) as Record<string, number>
  for (const token of tokens) {
    const owners = Object.entries(latinMarkers).filter(([, markers]) => markers.has(token)).map(([code]) => code)
    if (owners.length === 1) exclusiveScores[owners[0]] += 1
  }
  const expectedScore = exclusiveScores[expected] || 0
  const otherScore = Math.max(0, ...Object.entries(exclusiveScores).filter(([code]) => code !== expected).map(([, score]) => score))
  if (otherScore >= 2) return false
  if (expectedScore >= 2) return true
  return top[0] === expected
}

export function matchesExpectedLanguage(value: string, language: string) {
  const text = value.normalize('NFC').replace(/https?:\/\/\S+/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (!text) return true
  const sentences = text.split(/(?<=[.!?。！？])|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => scriptCount(sentence, /[\p{L}]/u) >= 4)
  if (sentences.length > 1 && sentences.some((sentence) => !matchesExpectedLanguageUnit(sentence, language))) return false
  return matchesExpectedLanguageUnit(text, language)
}

/**
 * Conversation turns can naturally be a single uncommon word, so they cannot
 * use the definition-grade short-text rule above. Cross-script leaks and
 * recognizable foreign function words are still rejected; longer turns use
 * the full detector.
 */
export function matchesExpectedConversationLanguage(value: string, language: string) {
  const text = value.normalize('NFC').replace(/https?:\/\/\S+/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (!text) return true
  if (text.length >= 24 || scriptCount(text, /[\p{L}]/u) >= 18) return matchesExpectedLanguage(text, language)

  const expected = expectedCode(language)
  const han = scriptCount(text, /[\p{Script=Han}]/u)
  const kana = scriptCount(text, /[\p{Script=Hiragana}\p{Script=Katakana}]/u)
  const hangul = scriptCount(text, /[\p{Script=Hangul}]/u)
  const devanagari = scriptCount(text, /[\p{Script=Devanagari}]/u)
  const latin = scriptCount(text, /[\p{Script=Latin}]/u)

  if (expected === 'cmn') return han >= 1 && kana === 0 && hangul === 0 && devanagari === 0
  if (expected === 'jpn') return kana + han >= 1 && hangul === 0 && devanagari === 0
  if (expected === 'kor') return hangul >= 1 && kana === 0 && devanagari === 0
  if (expected === 'hin') return devanagari >= 1 && han + kana + hangul === 0
  if (han + kana + hangul + devanagari > Math.max(1, latin / 5)) return false

  const tokens = text.toLocaleLowerCase().match(/[\p{Script=Latin}]+/gu) || []
  const expectedMarkers = latinMarkers[expected]
  if (expectedMarkers && tokens.some((token) => expectedMarkers.has(token))) return true
  return !Object.entries(latinMarkers)
    .some(([code, markers]) => code !== expected && tokens.some((token) => markers.has(token)))
}

export function joinedLanguageMatches(language: string, values: unknown[]) {
  const text = values.flatMap((value) => {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
    return []
  }).filter(Boolean).join('\n')
  return matchesExpectedLanguage(text, language)
}
