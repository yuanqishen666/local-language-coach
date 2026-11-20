/**
 * What is written after a conversation: the recap the learner reads, the short practice built
 * on their mistakes, and the marking of the one practice answer that cannot be checked locally.
 */
import { z } from 'zod'
import { getConfig } from '../services/config.js'
import { localeMeta, normalizeUiLocale } from '../../shared/locales.js'
import { CEFR_LEVELS, clampStep, stepOf, type CefrLevel, type LevelPart } from '../../shared/proficiency.js'
import { isErrorCategory, type ErrorCategory } from '../../shared/memory.js'
import { expressionCeiling } from '../placement.js'
import { getReviewClient } from './provider.js'
import { generateStructured, listFromAnswer, withOutputLimitDetails } from './engine.js'
import { matchesExpectedConversationLanguage, matchesExpectedLanguage } from './language.js'
import { materialDifficultyRule } from './level.js'
import { PRACTICE_GAP } from '../../shared/recap.js'

export interface Mistake {
  category: string
  severity: string
  original: string
  improved: string
}

export interface RecapDraft {
  good: { quote: string; comment: string } | null
  pattern: { category: ErrorCategory; comment: string } | null
  takeaway: { original: string; improved: string; meaning: string; comment: string } | null
  expression: { step: number; reason: string } | null
}

export interface GapItem {
  kind: 'gap'
  category: ErrorCategory
  /** The sentence with ___ where the answer goes. */
  sentence: string
  options: string[]
  answer: number
  explanation: string
}

export const GAP = PRACTICE_GAP

const recapSchema = z.object({
  good: z.object({ quote: z.string(), comment: z.string() }),
  pattern: z.object({ category: z.string(), comment: z.string() }),
  takeaway: z.object({ original: z.string(), improved: z.string(), meaning: z.string(), comment: z.string() }),
  expression: z.object({ level: z.string(), part: z.string(), reason: z.string() }),
})

const practiceItemsSchema = z.object({
  items: z.array(z.object({
    category: z.string(),
    sentence: z.string(),
    options: z.array(z.string()),
    answer: z.number(),
    explanation: z.string(),
  })),
})

const practiceGradeSchema = z.object({ right: z.boolean(), improved: z.string(), comment: z.string() })

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

export function plain(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[\s\u3000]+/gu, ' ').replace(/[.!?。！？।]+$/u, '').trim()
}

function levelOf(value: unknown): CefrLevel | '' {
  const found = text(value).toUpperCase().match(/[ABC][12]/u)?.[0]
  return CEFR_LEVELS.includes(found as CefrLevel) ? found as CefrLevel : ''
}

function partOf(value: unknown): LevelPart {
  const part = text(value).toLowerCase()
  if (part === 'low' || part === 'lower' || part === '-') return 'low'
  if (part === 'high' || part === 'upper' || part === '+') return 'high'
  return 'mid'
}

export interface RequestLanguage {
  languageCode: string
  languageName: string
  interfaceLocale?: string
}

export async function requestSetup(language: RequestLanguage) {
  const config = await getConfig()
  const locale = normalizeUiLocale(language.interfaceLocale, config.ui.locale)
  const provider = config.providers.find((item) => item.id === config.llm.defaultProvider)
  return {
    locale,
    interfaceName: localeMeta(locale).promptName,
    interfaceVoice: localeMeta(locale).voice,
    maxOutputTokens: provider?.maxOutputTokens || 1_200,
  }
}

export function recapSystem(input: { languageName: string; interfaceName: string; interfaceVoice: string }) {
  const { languageName: language, interfaceName: ui } = input
  return [
    'Write the recap of one practice conversation for the learner who had it. They read it straight after the conversation.',
    `The conversation was in ${language}. Lines marked learner are theirs; lines marked partner are the other speaker’s. Judge only the learner’s lines.`,
    `Write every comment, meaning and reason in ${ui}. ${input.interfaceVoice} Speak to the learner directly and plainly: no praise for its own sake, no marks or scores. Quotes and improved wording stay in ${language}.`,
    'Return four parts:',
    `- good: one thing the learner did well in ${language} — a word well chosen, a structure used correctly, a natural turn of phrase. quote is copied exactly from one of the learner’s lines; comment says in one sentence what is good about it.`,
    '- pattern: the one kind of mistake most worth their attention. category is one of the categories in the corrections supplied; prefer one that is also listed under recurring. comment says in one or two sentences what goes wrong and how to get it right, pointing at their own examples. When no corrections are supplied, category and comment are empty strings.',
    `- takeaway: one expression worth keeping beyond this conversation. original is something the learner said or tried to say, copied from their line; improved is how a native speaker would put it in ${language}; meaning is what improved means, in ${ui}; comment says in one sentence when to use it.`,
    '- expression: the CEFR level the learner’s own lines show. level is one of A1, A2, B1, B2, C1, C2; part is low, mid or high; reason says in one sentence what they can already do and what is still missing for the next level. Go by the range of words and structures, how accurate they are, and how ideas are joined. A learner who wrote little cannot be placed high.',
    'Return JSON: {"good":{"quote":"","comment":""},"pattern":{"category":"","comment":""},"takeaway":{"original":"","improved":"","meaning":"","comment":""},"expression":{"level":"B1","part":"mid","reason":""}}',
  ].join('\n')
}

/** The recap of one conversation. A part the model got wrong is left out rather than shown. */
export async function writeRecap(input: RequestLanguage & {
  scene: string
  lines: Array<{ who: 'learner' | 'partner'; text: string }>
  mistakes: Mistake[]
  /** Kinds of mistake the learner also made in earlier conversations. */
  recurring: string[]
}): Promise<RecapDraft> {
  const setup = await requestSetup(input)
  const client = await getReviewClient()
  const learnerLines = input.lines.filter((line) => line.who === 'learner').map((line) => line.text)
  const written = learnerLines.map(plain)
  const quoted = (quote: string) => plain(quote).length >= 2 && written.some((line) => line.includes(plain(quote)))
  const attempts = [...written, ...input.mistakes.map((mistake) => plain(mistake.original))]
  const inInterface = (value: string) => Boolean(value) && matchesExpectedLanguage(value, setup.locale)
  const categories = new Set(input.mistakes.map((mistake) => mistake.category).filter(isErrorCategory))
  const ceiling = expressionCeiling(learnerLines.join('\n'), input.languageCode)

  function parts(value: z.output<typeof recapSchema>): RecapDraft {
    const level = levelOf(value.expression.level)
    const improved = value.takeaway.improved
    const original = attempts.some((line) => line.includes(plain(value.takeaway.original))) ? value.takeaway.original : ''
    return {
      good: quoted(value.good.quote) && inInterface(value.good.comment) ? { quote: value.good.quote, comment: value.good.comment } : null,
      pattern: isErrorCategory(value.pattern.category) && categories.has(value.pattern.category)
        ? { category: value.pattern.category, comment: inInterface(value.pattern.comment) ? value.pattern.comment : '' }
        : null,
      takeaway: improved && matchesExpectedConversationLanguage(improved, input.languageCode) && plain(improved) !== plain(original) && inInterface(value.takeaway.meaning)
        ? { original, improved, meaning: value.takeaway.meaning, comment: inInterface(value.takeaway.comment) ? value.takeaway.comment : '' }
        : null,
      expression: level
        ? { step: Math.min(stepOf(level, partOf(value.expression.part)), ceiling), reason: inInterface(value.expression.reason) ? value.expression.reason : '' }
        : null,
    }
  }

  try {
    const result = await generateStructured(client, [
      { role: 'system', content: recapSystem({ languageName: input.languageName, interfaceName: setup.interfaceName, interfaceVoice: setup.interfaceVoice }) },
      {
        role: 'user',
        content: JSON.stringify({
          ...(input.scene ? { scene: input.scene } : {}),
          conversation: input.lines,
          corrections: input.mistakes.map((mistake) => ({ category: mistake.category, original: mistake.original, improved: mistake.improved })),
          recurring: input.recurring,
        }),
      },
    ], {
      name: 'conversation_recap',
      schema: recapSchema,
      hint: '{"good":{"quote":"","comment":""},"pattern":{"category":"","comment":""},"takeaway":{"original":"","improved":"","meaning":"","comment":""},"expression":{"level":"B1","part":"mid","reason":""}}',
      temperature: 0.2,
      attempts: 2,
      maxOutputTokens: setup.maxOutputTokens,
      retryHint: `Return all four parts. Copy good.quote exactly from a learner line, write takeaway.improved in ${input.languageName}, and write every comment, meaning and reason only in ${setup.interfaceName}.`,
      normalize(value) {
        const source = record(value)
        const good = record(source.good)
        const pattern = record(source.pattern)
        const takeaway = record(source.takeaway)
        const expression = record(source.expression)
        return {
          good: { quote: text(good.quote), comment: text(good.comment) },
          pattern: { category: text(pattern.category).toLowerCase(), comment: text(pattern.comment) },
          takeaway: { original: text(takeaway.original), improved: text(takeaway.improved), meaning: text(takeaway.meaning), comment: text(takeaway.comment) },
          expression: { level: text(expression.level), part: text(expression.part), reason: text(expression.reason) },
        }
      },
      usable(value) {
        const draft = parts(value)
        return Boolean(draft.good && draft.takeaway && draft.expression?.reason && (categories.size === 0 || draft.pattern?.comment))
      },
      // Something worth reading is left even when a part is missing or in the wrong language.
      acceptable(value) {
        const draft = parts(value)
        return Boolean(draft.expression && (draft.good || draft.takeaway))
      },
    })
    return parts(result)
  } catch (error) {
    throw withOutputLimitDetails(error, setup.maxOutputTokens)
  }
}

export function practiceItemsSystem(input: { languageName: string; languageCode: string; interfaceName: string; interfaceVoice: string; step: number; count: number }) {
  const { languageName: language, interfaceName: ui } = input
  const level = { learning: { targetLanguage: language, targetLanguageCode: input.languageCode, proficiency: '', difficultyStep: input.step } }
  return [
    'Write short gap-fill exercises for a language learner, built on mistakes they made.',
    `The learner is learning ${language}. Sentences and options are in ${language}; explanations are in ${ui}. ${input.interfaceVoice}`,
    materialDifficultyRule(level, 'Every sentence'),
    `Write ${input.count} item${input.count === 1 ? '' : 's'}, each on a different mistake from the list, taken in the order given:`,
    `- sentence: a new everyday sentence that needs the same point of language as the mistake, with that part replaced by ${GAP} (three underscores, exactly once). Never reuse the learner’s own sentence.`,
    `- options: four short ways to fill the gap, in ${language}. Exactly one is right; the others are what a learner would really write there by mistake, and none of them may also be acceptable.`,
    '- answer: the position of the right option, counting from 0. Put it in a different position from one item to the next.',
    '- category: the category of the mistake the item practises, copied from the list.',
    `- explanation: one sentence in ${ui} on why the right option is right.`,
    'Return JSON: {"items":[{"category":"","sentence":"","options":["","","",""],"answer":0,"explanation":""}]}',
  ].join('\n')
}

/** Models give the right choice as a position, a letter, or the choice itself. */
function answerIndex(value: unknown, options: string[]) {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  const given = text(value)
  if (/^\d+$/u.test(given)) return Number(given)
  if (/^[a-d]$/iu.test(given)) return given.toLowerCase().charCodeAt(0) - 97
  return options.findIndex((option) => plain(option) === plain(given))
}

/** Gap-fill items on the learner's mistakes. Items the model got wrong are dropped; throws when none is left. */
export async function writePracticeItems(input: RequestLanguage & { mistakes: Mistake[]; step: number; count: number }): Promise<GapItem[]> {
  const setup = await requestSetup(input)
  const client = await getReviewClient()
  const step = clampStep(input.step)
  const own = new Set(input.mistakes.flatMap((mistake) => [plain(mistake.original), plain(mistake.improved)]))

  function valid(items: z.output<typeof practiceItemsSchema>['items']): GapItem[] {
    const seen = new Set<string>()
    return items.flatMap((item): GapItem[] => {
      const sentence = item.sentence.replace(/_{2,}/gu, GAP)
      const options = item.options.map((option) => option.trim()).filter(Boolean)
      const filled = sentence.replace(GAP, options[item.answer] || '')
      if (sentence.split(GAP).length !== 2) return []
      if (options.length < 3 || options.length > 4 || new Set(options.map(plain)).size !== options.length) return []
      if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= options.length) return []
      if (!matchesExpectedConversationLanguage(filled, input.languageCode)) return []
      if (own.has(plain(filled)) || seen.has(plain(sentence))) return []
      seen.add(plain(sentence))
      return [{
        kind: 'gap',
        category: isErrorCategory(item.category) ? item.category : 'other',
        sentence,
        options,
        answer: item.answer,
        explanation: item.explanation && matchesExpectedLanguage(item.explanation, setup.locale) ? item.explanation : '',
      }]
    })
  }

  try {
    const result = await generateStructured(client, [
      { role: 'system', content: practiceItemsSystem({ languageName: input.languageName, languageCode: input.languageCode, interfaceName: setup.interfaceName, interfaceVoice: setup.interfaceVoice, step, count: input.count }) },
      { role: 'user', content: JSON.stringify({ mistakes: input.mistakes.map((mistake) => ({ category: mistake.category, original: mistake.original, improved: mistake.improved })) }) },
    ], {
      name: 'practice_items',
      schema: practiceItemsSchema,
      hint: '{"items":[{"category":"","sentence":"","options":["","","",""],"answer":0,"explanation":""}]}',
      temperature: 0.4,
      attempts: 2,
      maxOutputTokens: setup.maxOutputTokens,
      listKey: 'items',
      retryHint: `Each sentence has ${GAP} exactly once and four different options in ${input.languageName}, one of them right. Write each explanation only in ${setup.interfaceName}.`,
      normalize(value) {
        return {
          items: listFromAnswer(value, 'items').map((raw) => {
            const item = record(raw)
            const options = (Array.isArray(item.options) ? item.options : []).map(text)
            return {
              category: text(item.category).toLowerCase(),
              sentence: text(item.sentence),
              options,
              answer: answerIndex(item.answer, options),
              explanation: text(item.explanation),
            }
          }),
        }
      },
      usable: (value) => valid(value.items).length >= input.count && valid(value.items).every((item) => item.explanation),
      acceptable: (value) => valid(value.items).length >= 1,
    })
    return valid(result.items).slice(0, input.count)
  } catch (error) {
    throw withOutputLimitDetails(error, setup.maxOutputTokens)
  }
}

export function practiceGradeSystem(input: { languageName: string; interfaceName: string; interfaceVoice: string }) {
  const { languageName: language, interfaceName: ui } = input
  return [
    'Mark one answer to a short language exercise.',
    `The learner was shown a sentence in ${language} that has a fault and was asked to write it as it should be. Decide whether their answer does that.`,
    `- right is true when the answer is correct, natural ${language} that keeps the meaning and no longer has the fault. It does not have to match the model answer: any other good wording is right too. Ignore capital letters and final punctuation.`,
    '- improved is the answer as it should read: their own wording when it is right, otherwise their wording with the least change that makes it right.',
    `- comment says in one sentence, in ${ui}, what made it right or what is still wrong. ${input.interfaceVoice}`,
    'Return JSON: {"right":true,"improved":"","comment":""}',
  ].join('\n')
}

function truth(value: unknown) {
  if (typeof value === 'boolean') return value
  const given = text(value).toLowerCase()
  return given === 'true' || given === 'yes' || given === 'right' || given === 'correct'
}

/** Marks a rewritten sentence. Every answer passed in is in the language being learned and differs from the model answer. */
export async function gradeRewrite(input: RequestLanguage & { sentence: string; model: string; answer: string }) {
  const setup = await requestSetup(input)
  const client = await getReviewClient()
  const inTarget = (value: string) => Boolean(value) && matchesExpectedConversationLanguage(value, input.languageCode)
  try {
    const result = await generateStructured(client, [
      { role: 'system', content: practiceGradeSystem({ languageName: input.languageName, interfaceName: setup.interfaceName, interfaceVoice: setup.interfaceVoice }) },
      { role: 'user', content: JSON.stringify({ sentence: input.sentence, modelAnswer: input.model, learnerAnswer: input.answer }) },
    ], {
      name: 'practice_grade',
      schema: practiceGradeSchema,
      hint: '{"right":true,"improved":"","comment":""}',
      temperature: 0.1,
      attempts: 2,
      maxOutputTokens: setup.maxOutputTokens,
      retryHint: `Return right as true or false, improved in ${input.languageName}, and comment only in ${setup.interfaceName}.`,
      normalize(value) {
        const source = record(value)
        const verdict = source.right ?? source.correct
        // Without a verdict there is nothing to go on: the schema turns the answer down and it is asked for again, rather than marked wrong.
        return { right: (verdict === undefined || verdict === null ? undefined : truth(verdict)) as boolean, improved: text(source.improved), comment: text(source.comment) }
      },
      usable: (value) => inTarget(value.improved) && Boolean(value.comment) && matchesExpectedLanguage(value.comment, setup.locale),
      // The verdict is what counts; wording in the wrong language is left out below.
      acceptable: () => true,
    })
    return {
      right: result.right,
      improved: inTarget(result.improved) ? result.improved : input.model,
      comment: result.comment && matchesExpectedLanguage(result.comment, setup.locale) ? result.comment : '',
    }
  } catch (error) {
    throw withOutputLimitDetails(error, setup.maxOutputTokens)
  }
}
