import { francAll } from 'franc-min'
import { normalizeUiLocale, type UiLocale } from '../../shared/locales.js'

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

const latinCodes = ['eng', 'spa', 'fra', 'deu', 'ita', 'por']

function words(list: string) {
  return new Set(list.split(/\s+/u).filter(Boolean))
}

// Everyday function words of each Latin-script language, plus the grammar vocabulary that short
// explanations are made of. A word that several languages share is listed under each of them and
// counts for each in proportion. Words that are ordinary English as well (car, hat, war, pure,
// comment, chose) are left out of the other lists so that they never count against English.
const latinWords: Record<string, Set<string>> = {
  eng: words(`a about after again all almost also always am an and another any anything are around as at away
    back be because been before being between both but by can come could day did do does doing done down due
    each even ever every everyone everything few first for friend from get give go going good got great had has
    have having he hello her here hey hi him his home house how i if in into is it its just know last let like
    little look love made make man many may maybe me might more morning most much must my need never new next
    nice night no not nothing now of off often ok okay on once one only or other our out over own people per
    please plus pretty quite ready really right same say see shall she should since so solo some someone
    something sorry still such sure take tell than thank thanks that the their them then there these they thing
    think this those though through time to today together tomorrow tonight too two under until up us very want
    was way we week welcome well were what when where which while who why will with without would year yes
    yesterday yet you your
    don didn doesn isn aren wasn weren won wouldn couldn shouldn haven hasn ll ve re d m s t
    adjective adverb common conversation custom daily developer engineer formal friendly informal manager means
    noun past plural present regional singular spelling study travel usage use used verb word work`),
  spa: words(`a al algo algún alguna allí ahora antes aquí así aunque bien bueno buena buenos buenas cada casi
    claro como cómo con contra cosa cual cuál cuando cuándo de del desde después día días donde dónde dos
    durante el él ella ellas ellos en entre era eres es esa ese eso esta está están estar estás este esto
    estoy fue gracias gusta ha hace hacer hacia han has hasta hay he hola hoy la las le les lista listo lo los
    más mañana me mi mí mientras mis mucha mucho muy nada ni no noche nos nosotros nuestra nuestro nunca o
    otra otro para pero poco por porque puede puedes puedo pues que qué quien quién quiero se ser si sí
    siempre sin sobre solo sólo somos son soy su sus también tan tanto tarde te tengo tiene tienes toda todas
    todo todos tu tú tus un una unas uno unos usted ustedes va vamos vez voy y ya yo año años ayer
    adjetivo adverbio charla común formal forma genial hablar informal palabra pasado plural presente
    significa singular sustantivo uso verbo`),
  fra: words(`a à ai alors après au aujourd aussi autre aux avant avec avez avoir beaucoup bien bienvenue bon
    bonne bonjour bonsoir ça ce cela ces cet cette chez comme dans de déjà demain depuis des deux donc du elle
    elles en encore entre es est et été être eu faire fait faut fois hier hui ici il ils jamais je jour là la
    le les leur leurs lui ma mais matin me même merci mes moi moins mon ne ni non nos notre nous nuit on ont
    ou où oui par parce pas peu peut peux plus pour pourquoi prêt prête quand que quel quelle quelque qui quoi
    sa salut sans se ses si soir son sont suis sur ta te tes toi ton toujours tous tout toute toutes très trop
    tu un une va vais veux voici voilà vos votre vous y c d j l m n qu s t
    adjectif adverbe conversation courant forme formel génial informel mot nom passé pluriel présent signifie
    singulier usage verbe`),
  deu: words(`ab abend aber alle alles als also am an auch auf aus bei bereit bis bist bitte da damit danke dann
    das dass dein deine dem den denn der des dich die dies diese diesem diesen dieser dieses dir doch du durch
    ein eine einem einen einer eines er es etwas euch für ganz gar gegen genau gibt gut guten hab habe haben
    hallo hast hatte heute hier ich ihm ihn ihnen ihr ihre im immer in ins ist ja jahr jetzt kann kannst kein
    keine können machen mal man mehr mein meine mich mir mit morgen muss nach nacht natürlich nein nicht nichts
    noch nun nur ob oder ohne schon schön sehr sein seine sich sie sind so soll über um und uns unser unter
    viel viele vielleicht vom von vor warum was weil wenn wer werden wie wieder will willkommen wir wird wo
    woche wollen zu zum zur zwei zwischen
    adjektiv adverb bedeutet formell gespräch substantiv umgangssprachlich verb verwendet wort`),
  ita: words(`a abbiamo ad adesso al alla alle allo allora anche ancora anno avere bene benvenuta benvenuto buon
    buona buonasera buongiorno c che chi ci ciao come con cosa così cui d da dal dalla davvero dei del della
    delle dello di domani dopo dove due e è ecco ed era essere fa fra già giorno gli grazie ha hai hanno ho i
    ieri il in io l la le lei li lo loro lui ma mai me mi mia mio molto ne nei nel nella nelle no noi non
    nostra nostro notte o oggi ogni ora per perché però più po poco poi prego pronta pronto proprio qualche
    quando quanto quella quello questa questo qui quindi se sei sempre senza sera si sì sia siamo solo sono
    sta stai sto su sua sul sulla suo tra tu tua tuo tutta tutti tutto un una uno va vi voi volta vuoi
    aggettivo avverbio comune conversazione forma formale indica informale ottimo parola plurale significa
    singolare sostantivo uso verbo`),
  por: words(`a à agora ainda algo algum alguma ali amanhã ano antes ao aos aqui as às assim até bem boa bom cada
    coisa com como da das de depois desde dia do dois dos duas e é ela elas ele eles em então entre era essa
    esse esta está estão estar este estou eu faz fazer foi há hoje isso isto já lá lhe mais mas me mesmo meu
    minha muita muito na não nas nem no noite nos nós nossa nosso num numa nunca o obrigada obrigado oi olá
    onde ontem os ou para pela pelo pode por porque pouco pra pronta pronto quando que quê quem quer quero se
    seja sem sempre ser seu seus só sobre somos sou sua suas são também tão tarde te tem têm tenho ter toda
    todo todos tu tudo um uma umas uns vai vamos vez vinda vindo você vocês vou
    adjetivo advérbio comum conversa forma formal informal ótimo palavra plural significa singular
    substantivo uso verbo`),
}

// Text inside quotation marks is something being talked about, typically a word or sentence of the
// language being learned, so it says nothing about the language the writer is using.
const quotedSpans = /“[^”\n]{1,240}”|„[^“”\n]{1,240}[“”]|«[^»\n]{1,240}»|「[^」\n]{1,240}」|『[^』\n]{1,240}』|《[^》\n]{1,240}》|‘[^’\n]{1,240}’(?!\p{L})|"[^"\n]{1,240}"|(?<![\p{L}\p{N}])'[^'\n]{1,240}'(?![\p{L}\p{N}])|`[^`\n]{1,240}`/gu

interface ScriptCounts { han: number; kana: number; hangul: number; devanagari: number; latin: number }

function scriptCounts(value: string): ScriptCounts {
  const counts = { han: 0, kana: 0, hangul: 0, devanagari: 0, latin: 0 }
  for (const character of value) {
    if (/\p{Script=Han}/u.test(character)) counts.han += 1
    else if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character)) counts.kana += 1
    else if (/\p{Script=Hangul}/u.test(character)) counts.hangul += 1
    else if (/\p{Script=Devanagari}/u.test(character)) counts.devanagari += 1
    else if (/\p{Script=Latin}/u.test(character)) counts.latin += 1
  }
  return counts
}

function letterCount(value: string) {
  return (value.match(/\p{L}/gu) || []).length
}

function expectedCode(language: string) {
  if (Object.hasOwn(targetLanguage, language.toLowerCase())) return targetLanguage[language.toLowerCase()]
  return localeLanguage[normalizeUiLocale(language)]
}

function ownScript(expected: string, counts: ScriptCounts) {
  if (expected === 'cmn') return counts.han
  if (expected === 'jpn') return counts.han + counts.kana
  if (expected === 'kor') return counts.hangul
  return counts.devanagari
}

/** Chinese, Japanese, Korean and Hindi are told apart by script; embedded foreign terms are expected. */
/** The expected language's own punctuation placed straight after a Latin word: the writer was punctuating in that language. */
const ownPunctuationAfterLatin: Record<string, RegExp> = {
  cmn: /\p{Script=Latin}[\s"'”’)]*[，。、；：！？]/u,
  jpn: /\p{Script=Latin}[\s"'”’)]*[、。！？]/u,
  hin: /\p{Script=Latin}[\s"'”’)]*[।॥]/u,
}

/**
 * Whether the words around the Latin material are in the expected script: the text opens in it,
 * closes in it (verb-final languages end on their own verb), or is punctuated in it.
 * One or two trailing letters are not enough; that is what a quoted particle looks like.
 */
function framedInOwnScript(text: string, expected: string) {
  if (ownPunctuationAfterLatin[expected]?.test(text)) return true
  const parts = text.split(/\p{Script=Latin}+/u)
  return ownScript(expected, scriptCounts(parts[0])) >= 2 ||
    ownScript(expected, scriptCounts(parts[parts.length - 1])) >= 3
}

function ownScriptMatches(expected: string, counts: ScriptCounts, text: string) {
  const own = ownScript(expected, counts)
  if (own < 1) return false
  const otherScripts = counts.han + counts.kana + counts.hangul + counts.devanagari - own
  if (expected === 'cmn') {
    // Japanese is written with Han characters too; what gives it away is how much kana surrounds them.
    if (counts.kana * 2 > counts.han || counts.hangul + counts.devanagari > counts.han) return false
  } else if (expected === 'jpn') {
    // A short kanji-only label is ordinary Japanese; a whole sentence without kana is Chinese.
    if ((counts.kana === 0 && counts.han > 8) || otherScripts > own) return false
  } else if (otherScripts > own) {
    return false
  }
  if (counts.latin <= Math.max(24, own * 4)) return true
  // An explanation of a Latin-script language can quote far more of it than it says in its own
  // words. What shows it was written in the expected language is the frame around the quotations.
  return own >= 2 && counts.latin <= own * 16 && framedInOwnScript(text, expected)
}

interface LatinTokens { plain: string[]; compound: string[] }

function latinTokens(value: string): LatinTokens {
  const plain: string[] = []
  const compound: string[] = []
  for (const match of value.toLowerCase().matchAll(/[\p{Script=Latin}]+(?:-[\p{Script=Latin}]+)*/gu)) {
    const parts = match[0].split('-')
    if (parts.length === 1) plain.push(parts[0])
    else compound.push(...parts)
  }
  return { plain, compound }
}

function latinScores(tokens: LatinTokens, expected: string) {
  const scores: Record<string, number> = Object.fromEntries(latinCodes.map((code) => [code, 0]))
  for (const token of tokens.plain) {
    const owners = latinCodes.filter((code) => latinWords[code].has(token))
    for (const owner of owners) scores[owner] += 1 / owners.length
  }
  // The halves of a hyphenated compound ("non-native", "peut-être") only count for the expected language.
  for (const token of tokens.compound) {
    const owners = latinCodes.filter((code) => latinWords[code].has(token))
    if (owners.includes(expected)) scores[expected] += 1 / owners.length
  }
  const own = scores[expected] || 0
  const other = Math.max(0, ...latinCodes.filter((code) => code !== expected).map((code) => scores[code]))
  return { own, other }
}

/**
 * The six Latin-script languages are told apart by their everyday words. Text is rejected on
 * evidence of another language, never for lack of evidence: a name, a single uncommon word or a
 * list of technical terms proves nothing either way.
 */
function latinMatches(text: string, expected: string, counts: ScriptCounts) {
  const otherScripts = counts.han + counts.kana + counts.hangul + counts.devanagari
  if (otherScripts > 0 && (counts.latin < 4 || otherScripts * 2 > counts.latin)) return false
  const tokens = latinTokens(text)
  const { own, other } = latinScores(tokens, expected)
  if (own > 0 && own >= other) return true
  if (other >= own + 1.5) return false

  const sentenceLike = tokens.plain.length + tokens.compound.length >= 4 && counts.latin >= 18
  if (!sentenceLike) {
    const expectedWords = latinWords[expected]
    const contrary = tokens.plain.some((token) => token.length >= 3 && !expectedWords.has(token) &&
      latinCodes.some((code) => code !== expected && latinWords[code].has(token)))
    return !(contrary && own < other)
  }
  if (own === 0 && other === 0) return true
  // Close calls between related languages go to the trigram statistics.
  const top = francAll(text, { only: latinCodes, minLength: 10 })[0]
  return !top || top[0] === 'und' || top[0] === expected
}

/** A whole sentence in another language, sitting inside text that is otherwise fine. */
function sentenceContradicts(sentence: string, expected: string) {
  const counts = scriptCounts(sentence)
  const nonLatin = counts.han + counts.kana + counts.hangul + counts.devanagari
  if (!latinCodes.includes(expected)) {
    const own = ownScript(expected, counts)
    if (own > 0) return false
    return nonLatin >= 4 || (sentence.match(/[\p{Script=Latin}]{2,}/gu) || []).length >= 4
  }
  if (counts.latin < 2) return nonLatin >= 2
  const { own, other } = latinScores(latinTokens(sentence), expected)
  return other >= own + 2
}

/**
 * Deterministic guard for model-written text. It answers one question: is there clear evidence
 * that this was written in a language other than the expected one? Quoted material, names,
 * technical terms and words of the language being learned are all normal inside such text.
 */
export function matchesExpectedLanguage(value: string, language: string) {
  const original = value.normalize('NFC').replace(/https?:\/\/\S+/gu, ' ').replace(/[^\S\n]+/gu, ' ').trim()
  if (!original) return true
  const unquoted = original.replace(quotedSpans, ' ').trim()
  const text = letterCount(unquoted) >= 2 ? unquoted : original
  if (letterCount(text) === 0) return true

  const expected = expectedCode(language)
  const parts = text.split(/(?<=[.!?。！？])|\n+/u).map((sentence) => sentence.trim()).filter(Boolean)
  // A sentence that a colon introduces is being shown, not said: "the correct form is:" and then the form.
  const sentences = parts.filter((sentence, index) => letterCount(sentence) >= 4 && !/[:：]$/u.test(parts[index - 1] || ''))
  if (sentences.length > 1 && sentences.some((sentence) => sentenceContradicts(sentence, expected))) return false
  const counts = scriptCounts(text)
  return latinCodes.includes(expected) ? latinMatches(text, expected, counts) : ownScriptMatches(expected, counts, text)
}

/** Conversation turns and short labels are judged by the same evidence as longer text. */
export function matchesExpectedConversationLanguage(value: string, language: string) {
  return matchesExpectedLanguage(value, language)
}

/**
 * Learner input in a Latin-script language that carries words in another script. Model output
 * may quote such words; in a learner's own message they are the part they could not say.
 */
export function mixesAnotherScript(value: string, language: string) {
  if (!latinCodes.includes(expectedCode(language))) return false
  const counts = scriptCounts(value)
  return counts.han + counts.kana + counts.hangul + counts.devanagari >= 2
}

export function joinedLanguageMatches(language: string, values: unknown[]) {
  const text = values.flatMap((value) => {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
    return []
  }).filter(Boolean).join('\n')
  return matchesExpectedLanguage(text, language)
}
