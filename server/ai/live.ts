/**
 * After the learner has talked with a real person: their notes on what they could not say and
 * what was corrected, completed for the learning record. What the other person corrected is
 * kept as the learner wrote it; the model only names what it is about and says why.
 */
import { z } from 'zod'
import { ERROR_CATEGORIES, isErrorCategory, type ErrorCategory } from '../../shared/memory.js'
import { clampStep } from '../../shared/proficiency.js'
import { variantPromptName } from '../../shared/variants.js'
import { getReviewClient } from './provider.js'
import { generateStructured, withOutputLimitDetails } from './engine.js'
import { matchesExpectedConversationLanguage, matchesExpectedLanguage } from './language.js'
import { materialDifficultyRule } from './level.js'
import { requestSetup, type RequestLanguage } from './recap.js'

const debriefSchema = z.object({
  said: z.array(z.object({ index: z.number(), improved: z.string() })),
  corrected: z.array(z.object({ index: z.number(), category: z.string(), explanation: z.string() })),
})

export interface LiveNotes {
  /** Things the learner wanted to say and could not, in any language. */
  stuck: string[]
  /** What they said, and what the other person told them it should be. */
  corrected: Array<{ said: string; right: string }>
}

export interface LiveDebrief {
  gaps: Array<{ original: string; improved: string }>
  errors: Array<{ original: string; improved: string; explanation: string; category: ErrorCategory }>
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function position(value: unknown) {
  const index = typeof value === 'number' ? value : Number(text(value))
  return Number.isInteger(index) ? index : -1
}

export function liveDebriefSystem(input: { languageName: string; languageCode: string; variant?: string; interfaceName: string; interfaceVoice: string; step: number }) {
  const { languageName: language, interfaceName: ui } = input
  const level = { learning: { targetLanguage: language, targetLanguageCode: input.languageCode, proficiency: '', difficultyStep: input.step } }
  return [
    'A language learner has just talked with a real person, a teacher or a language partner, and has written down what happened. Complete their notes for their learning record.',
    `The learner is learning ${variantPromptName(input.languageCode, input.variant) || language}. Explanations are in ${ui}. ${input.interfaceVoice}`,
    `said: things the learner wanted to say and could not, written in any language. For each, give improved: one natural way to say it in ${language}, the way a person says it in conversation. ${materialDifficultyRule(level, 'Every improved sentence')}`,
    `corrected: what the learner said (said) and what the other person told them it should be (right). The correction is the other person’s and is not to be changed or judged. For each, give category, what the correction is about, one of: ${ERROR_CATEGORIES.join(', ')}; and explanation, one short sentence in ${ui} on why right is the way to say it.`,
    'index is the position of the note in its list, counting from 0. Answer every note once, in order, and add none.',
    'Return JSON: {"said":[{"index":0,"improved":""}],"corrected":[{"index":0,"category":"","explanation":""}]}',
  ].join('\n')
}

/**
 * One request for the whole debrief. A note the model gave no usable wording for is left out of
 * the gaps; a correction always stays, under "other" when the model named no kind for it.
 */
export async function writeLiveDebrief(input: RequestLanguage & LiveNotes & { step: number; variant?: string }): Promise<LiveDebrief> {
  const withoutModel = (): LiveDebrief => ({
    gaps: [],
    errors: input.corrected.map((item) => ({ original: item.said, improved: item.right, explanation: '', category: 'other' as ErrorCategory })),
  })
  if (!input.stuck.length && !input.corrected.length) return withoutModel()
  const setup = await requestSetup(input)
  const client = await getReviewClient()

  const improvedFor = (value: z.output<typeof debriefSchema>, index: number) => {
    const improved = value.said.find((item) => item.index === index)?.improved || ''
    return improved && matchesExpectedConversationLanguage(improved, input.languageCode) ? improved : ''
  }

  try {
    const result = await generateStructured(client, [
      { role: 'system', content: liveDebriefSystem({ languageName: input.languageName, languageCode: input.languageCode, variant: input.variant, interfaceName: setup.interfaceName, interfaceVoice: setup.interfaceVoice, step: clampStep(input.step) }) },
      { role: 'user', content: JSON.stringify({ said: input.stuck, corrected: input.corrected }) },
    ], {
      name: 'live_debrief',
      schema: debriefSchema,
      hint: '{"said":[{"index":0,"improved":""}],"corrected":[{"index":0,"category":"","explanation":""}]}',
      temperature: 0.3,
      attempts: 2,
      maxOutputTokens: setup.maxOutputTokens,
      retryHint: `Give improved for every note in said, in ${input.languageName} only, and a category and an explanation in ${setup.interfaceName} for every note in corrected.`,
      normalize(value) {
        const source = record(value)
        return {
          said: (Array.isArray(source.said) ? source.said : []).map((raw, at) => {
            const item = record(raw)
            return { index: item.index === undefined ? at : position(item.index), improved: text(item.improved) }
          }),
          corrected: (Array.isArray(source.corrected) ? source.corrected : []).map((raw, at) => {
            const item = record(raw)
            return { index: item.index === undefined ? at : position(item.index), category: text(item.category).toLowerCase(), explanation: text(item.explanation) }
          }),
        }
      },
      usable: (value) => input.stuck.every((_, index) => improvedFor(value, index)) &&
        input.corrected.every((_, index) => value.corrected.some((item) => item.index === index && isErrorCategory(item.category))),
      acceptable: (value) => !input.stuck.length || input.stuck.some((_, index) => improvedFor(value, index)),
    })
    return {
      gaps: input.stuck.flatMap((original, index) => {
        const improved = improvedFor(result, index)
        return improved ? [{ original, improved }] : []
      }),
      errors: input.corrected.map((item, index) => {
        const found = result.corrected.find((entry) => entry.index === index)
        return {
          original: item.said,
          improved: item.right,
          explanation: found?.explanation && matchesExpectedLanguage(found.explanation, setup.locale) ? found.explanation : '',
          category: found && isErrorCategory(found.category) ? found.category : 'other',
        }
      }),
    }
  } catch (error) {
    throw withOutputLimitDetails(error, setup.maxOutputTokens)
  }
}
