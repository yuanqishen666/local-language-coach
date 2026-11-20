import { z } from 'zod'
import { getConfig } from '../services/config.js'
import { localeMeta, normalizeUiLocale } from '../../shared/locales.js'
import { CEFR_LEVELS, LEVEL_PARTS, stepOf, type CefrLevel, type LevelPart } from '../../shared/proficiency.js'
import type { PlacementEvidence } from '../../shared/placement.js'
import { getModelClient, getReviewClient } from './provider.js'
import { generateListInSteps, generateStructured, listFromAnswer, withOutputLimitDetails, type ListRequestStep } from './engine.js'
import { joinedLanguageMatches, matchesExpectedLanguage } from './language.js'
import {
  expressionCeiling, itemProblems, itemSpec,
  type ExpressionBand, type ExpressionTask, type ItemSpec, type PlacementItem,
} from '../placement.js'

/** The open questions as the grader reads them. The learner sees them in the interface language. */
export const EXPRESSION_QUESTIONS: Record<ExpressionTask, Record<ExpressionBand, string>> = {
  recent: {
    low: 'What did you do yesterday? Write two or three sentences.',
    mid: 'Tell about something that happened to you recently and stayed with you: what happened, and what you thought at the time.',
    high: 'Tell about a time you changed your mind about something: what you thought before, and what changed it.',
  },
  opinion: {
    low: 'What food do you like? Why?',
    mid: 'Is it better to work from home or to go to an office? Give your reasons.',
    high: 'Some people say social media makes people lonelier. Do you agree? Give your reasons and answer one argument from the other side.',
  },
  hypothetical: {
    low: 'If you had a free day tomorrow, what would you like to do?',
    mid: 'If you could live in another country for a year, where would you go and how would you spend the year?',
    high: 'Suppose your city banned private cars from the centre. What would change, and would you support it?',
  },
}

export interface PlacementLanguage {
  languageCode: string
  languageName: string
  interfaceLocale: string
}

// Room one item takes in an answer: its text, at the most tokens a word or character is likely to cost, and the question with its choices.
const TOKENS_PER_UNIT = 1.6
const QUESTION_OUTPUT_TOKENS = 120
const ENVELOPE_OUTPUT_TOKENS = 80

/** How many of the items, taken in order, one answer can hold under the output limit. Always at least the first. */
export function itemsThatFit(specs: ItemSpec[], maxOutputTokens: number) {
  const room = Math.floor(maxOutputTokens * 0.75) - ENVELOPE_OUTPUT_TOKENS
  let used = 0
  let count = 0
  for (const spec of specs) {
    used += Math.round(spec.maxLength * TOKENS_PER_UNIT) + QUESTION_OUTPUT_TOKENS
    if (count > 0 && used > room) break
    count += 1
  }
  return Math.max(1, count)
}

const placementItemsSchema = z.object({
  items: z.array(z.object({
    level: z.string(),
    text: z.string(),
    question: z.string(),
    options: z.array(z.string()),
    answer: z.number(),
  })),
})

const placementGradeSchema = z.object({
  answers: z.array(z.object({
    id: z.string(),
    level: z.enum(CEFR_LEVELS),
    part: z.enum(LEVEL_PARTS),
    vocabulary: z.enum(CEFR_LEVELS),
    grammar: z.enum(CEFR_LEVELS),
  })),
  evidence: z.array(z.object({ quote: z.string(), comment: z.string() })),
})

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
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

/** Models give the right choice as an index, a letter, or the choice itself. */
function answerIndex(value: unknown, options: string[]) {
  if (typeof value === 'number') return value
  const written = text(value)
  if (/^\d+$/u.test(written)) return Number(written)
  if (/^[A-Da-d]$/u.test(written)) return written.toUpperCase().charCodeAt(0) - 65
  return options.indexOf(written)
}

async function requestSetup(language: PlacementLanguage) {
  const config = await getConfig()
  const locale = normalizeUiLocale(language.interfaceLocale, config.ui.locale)
  const provider = config.providers.find((item) => item.id === config.llm.defaultProvider)
  return {
    locale,
    interfaceName: localeMeta(locale).promptName,
    interfaceVoice: localeMeta(locale).voice,
    maxOutputTokens: provider?.maxOutputTokens || 2_000,
  }
}

function specLine(spec: ItemSpec) {
  const unit = spec.unit === 'characters' ? 'characters' : 'words'
  return `- ${spec.level}: the text is ${spec.minLength} to ${spec.maxLength} ${unit} long, with no sentence longer than about ${spec.maxSentenceLength} ${unit}; it uses ${spec.structures}; its subject comes from ${spec.topics}; the question asks for ${spec.focus}.`
}

export function placementItemsSystem(input: {
  languageName: string
  interfaceName: string
  kind: 'reading' | 'listening'
  specs: ItemSpec[]
  step: ListRequestStep
}) {
  const { languageName, interfaceName, kind } = input
  const specs = input.step.count === 1 ? input.specs.slice(0, 1) : input.specs.slice(0, input.step.count)
  return [
    `Write placement test items for a learner of ${languageName}. Each item tests understanding at one CEFR level.`,
    kind === 'reading'
      ? `Each item is a short text in ${languageName} for the learner to read, one question about it, and four answer choices.`
      : `Each item is something a person says aloud in ${languageName}, which the learner hears once and never sees, one question about what was said, and four answer choices. Write it as speech: a remark, a message left on a phone, an announcement. No headings, lists, or stage directions.`,
    `text is written only in ${languageName}, in its normal script, the way a native speaker would write or say it. question and options are written only in ${interfaceName}, and never quote the text in ${languageName}.`,
    `Judge every level by the grammar and vocabulary of ${languageName} itself, not by how the same thing would be said in another language.`,
    'Exactly one choice is right. The three wrong ones are believable to someone who understood only part of the text, are about as long as the right one, and cannot be ruled out without the text. The question cannot be answered from general knowledge.',
    'answer is the position of the right choice counting from 0. Put it in a different position from one item to the next.',
    'Each item is about a different subject. Use ordinary adult life; no item is about learning a language or taking a test.',
    'level repeats the level the item was written for.',
    specs.length === 1 ? 'Write exactly 1 item, at this level:' : `Write exactly ${specs.length} items, one at each of these levels, in this order:`,
    ...specs.map(specLine),
    ...(input.step.compact ? ['The previous answer was cut off or incomplete. Write only the one item asked for, complete, with every field present exactly once.'] : []),
    ...(input.step.rejected ? [`An earlier answer was turned down. Keep text only in ${languageName} and within the stated length, keep question and options only in ${interfaceName}, and give four different choices with one right answer.`] : []),
  ].join('\n')
}

/**
 * Writes choice questions for the given levels, the first being the one needed now. Only items
 * that pass every check come back; the caller asks again when the level it needs is missing.
 */
export async function generatePlacementItems(input: PlacementLanguage & {
  kind: 'reading' | 'listening'
  levels: CefrLevel[]
  /** Openings of texts already in use, so that new ones are about something else. */
  avoid?: string[]
}): Promise<Array<{ level: CefrLevel; item: PlacementItem }>> {
  const setup = await requestSetup(input)
  const client = await getModelClient()
  const specs = input.levels.map((level) => itemSpec(level, input.kind, input.languageCode))
  const batch = itemsThatFit(specs, setup.maxOutputTokens)
  const good = (entry: { level: CefrLevel | ''; item: PlacementItem }): entry is { level: CefrLevel; item: PlacementItem } => {
    const spec = specs.find((candidate) => candidate.level === entry.level)
    return Boolean(spec) &&
      itemProblems(entry.item, spec!, input.languageCode).length === 0 &&
      matchesExpectedLanguage(entry.item.text, input.languageCode) &&
      joinedLanguageMatches(setup.locale, [entry.item.question, entry.item.options])
  }
  try {
    const items = await generateListInSteps({
      steps: batch > 1 ? [{ count: batch, compact: false }, { count: 1, compact: true }] : [{ count: 1, compact: false }, { count: 1, compact: true }],
      request: async (step) => (await generateStructured(client, [
        { role: 'system', content: placementItemsSystem({ languageName: input.languageName, interfaceName: setup.interfaceName, kind: input.kind, specs, step }) },
        { role: 'user', content: JSON.stringify({ kind: input.kind, levels: specs.slice(0, step.count).map((spec) => spec.level), subjectsAlreadyUsed: (input.avoid || []).slice(0, 8) }) },
      ], {
        name: 'placement_items',
        schema: placementItemsSchema,
        hint: '{"items":[{"level":"B1","text":"","question":"","options":["","","",""],"answer":0}]}',
        temperature: 0.8,
        maxOutputTokens: setup.maxOutputTokens,
        listKey: 'items',
        normalize(value) {
          return {
            items: listFromAnswer(value, 'items').map((raw) => {
              const item = record(raw)
              const options = Array.isArray(item.options) ? item.options.map(text) : []
              return {
                level: levelOf(item.level) || (specs.length === 1 || step.count === 1 ? specs[0].level : ''),
                text: text(item.text || item.passage || item.audio),
                question: text(item.question),
                options,
                answer: answerIndex(item.answer ?? item.answerIndex ?? item.correct, options),
              }
            }),
          }
        },
        usable: (value) => value.items.length > 0,
      })).items.map((item) => ({
        level: levelOf(item.level),
        item: { text: item.text, question: item.question, options: item.options, answer: item.answer },
      })),
      preferred: good,
    })
    return items.filter(good)
  } catch (error) {
    throw withOutputLimitDetails(error, setup.maxOutputTokens)
  }
}

export function placementGradeSystem(input: { languageName: string; interfaceName: string; interfaceVoice: string }) {
  const { languageName, interfaceName } = input
  return [
    `Grade a placement test in ${languageName}. The learner answered open questions in writing. Judge only what the learner wrote.`,
    `For each answer, level is the CEFR level its ${languageName} shows, from A1 to C2, and part says where in that level it sits: low, mid, or high. Weigh the range of words, accuracy, how well the sentences hang together, and whether the answer does what the question asked.`,
    `Judge by the grammar of ${languageName} itself. Do not reward length for its own sake and do not guess above what is on the page: a few simple sentences are A1 or A2 however correct they are, and a long answer full of basic errors is not advanced.`,
    'vocabulary is the level of the range and precision of the words alone. grammar is the level of the range and accuracy of the structures alone.',
    'Return one entry in answers for every id you were given, with the same id.',
    `evidence has 2 or 3 entries taken from across the answers. quote is copied character for character from what the learner wrote, mistakes included: a phrase or one sentence, never the question. comment is one short sentence in ${interfaceName} that tells the learner what the quote shows: something they can already do, or what is holding them back, with the better wording when there is a mistake.`,
    `comment speaks to the learner directly and plainly. ${input.interfaceVoice} Write comment only in ${interfaceName}; the quoted words stay as the learner wrote them.`,
  ].join('\n')
}

export interface ExpressionGrade {
  id: string
  step: number
  vocabulary: number
  grammar: number
}

function plain(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()
}

/** Rates open answers in one request. Every answer passed in must already be in the language being learned. */
export async function gradePlacementExpression(input: PlacementLanguage & {
  answers: Array<{ id: string; task: ExpressionTask; band: ExpressionBand; text: string }>
}): Promise<{ grades: ExpressionGrade[]; evidence: PlacementEvidence[] }> {
  if (!input.answers.length) return { grades: [], evidence: [] }
  const setup = await requestSetup(input)
  const client = await getReviewClient()
  const written = input.answers.map((answer) => plain(answer.text))
  const quoted = (quote: string) => plain(quote).length >= 2 && written.some((answer) => answer.includes(plain(quote)))
  const complete = (value: z.output<typeof placementGradeSchema>) => input.answers.every((answer) => value.answers.some((grade) => grade.id === answer.id))
  const shown = (value: z.output<typeof placementGradeSchema>) => value.evidence.filter((item) => quoted(item.quote) && item.comment && matchesExpectedLanguage(item.comment, setup.locale))
  try {
    const result = await generateStructured(client, [
      { role: 'system', content: placementGradeSystem({ languageName: input.languageName, interfaceName: setup.interfaceName, interfaceVoice: setup.interfaceVoice }) },
      { role: 'user', content: JSON.stringify({ answers: input.answers.map((answer) => ({ id: answer.id, question: EXPRESSION_QUESTIONS[answer.task][answer.band], answer: answer.text })) }) },
    ], {
      name: 'placement_grade',
      schema: placementGradeSchema,
      hint: '{"answers":[{"id":"","level":"B1","part":"mid","vocabulary":"B1","grammar":"B1"}],"evidence":[{"quote":"","comment":""}]}',
      temperature: 0.1,
      attempts: 2,
      maxOutputTokens: setup.maxOutputTokens,
      retryHint: `Return one entry in answers for every id. Copy each quote exactly from the learner's answer, and write each comment only in ${setup.interfaceName}.`,
      normalize(value) {
        const source = record(value)
        return {
          answers: listFromAnswer(source.answers ?? value, 'answers').map((raw) => {
            const grade = record(raw)
            const level = levelOf(grade.level)
            return {
              id: text(grade.id),
              level: level as CefrLevel,
              part: partOf(grade.part),
              vocabulary: (levelOf(grade.vocabulary) || level) as CefrLevel,
              grammar: (levelOf(grade.grammar) || level) as CefrLevel,
            }
          }),
          evidence: (Array.isArray(source.evidence) ? source.evidence : []).map((raw) => {
            const item = record(raw)
            return { quote: text(item.quote), comment: text(item.comment) }
          }),
        }
      },
      usable: (value) => complete(value) && shown(value).length >= 1,
      // The levels are what the result rests on; a comment in the wrong language is left out rather than shown.
      acceptable: complete,
    })
    const grades = input.answers.map((answer) => {
      const grade = result.answers.find((item) => item.id === answer.id)!
      const ceiling = expressionCeiling(answer.text, input.languageCode)
      return {
        id: answer.id,
        step: Math.min(stepOf(grade.level, grade.part), ceiling),
        vocabulary: Math.min(stepOf(grade.vocabulary, 'mid'), ceiling),
        grammar: Math.min(stepOf(grade.grammar, 'mid'), ceiling),
      }
    })
    return { grades, evidence: shown(result).slice(0, 3) }
  } catch (error) {
    throw withOutputLimitDetails(error, setup.maxOutputTokens)
  }
}
