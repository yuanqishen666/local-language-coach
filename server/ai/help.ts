/**
 * What the learner can ask for when one of the partner's lines went past them:
 * the same line said more simply, or a hint that stops short of translating it.
 */
import { z } from 'zod'
import { getConfig } from '../services/config.js'
import { localeMeta, normalizeUiLocale } from '../../shared/locales.js'
import { clampStep, difficultyProfile } from '../../shared/proficiency.js'
import type { ConversationSetup, LearningLanguage } from '../types.js'
import { checkReplyDifficulty, textLength, wordKeys } from '../proficiency-text.js'
import { getModelClient } from './provider.js'
import { generateStructured, withOutputLimitDetails } from './engine.js'
import { matchesExpectedConversationLanguage, matchesExpectedLanguage } from './language.js'
import { replyDifficultyRules } from './level.js'

const simplerLineSchema = z.object({ text: z.string() })
const lineHintSchema = z.object({ hint: z.string() })

const HINT_MAX_LENGTH = 400

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function plain(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()
}

function speaker(setup: ConversationSetup | null) {
  if (!setup) return { role: 'a friendly conversation partner', tone: 'warm and natural' }
  return {
    setting: setup.setting,
    name: setup.partnerName,
    role: setup.partnerRole,
    relationship: setup.relationship,
    tone: setup.tone,
    localStyle: setup.localStyle,
  }
}

async function outputLimit() {
  const config = await getConfig()
  return config.providers.find((item) => item.id === config.llm.defaultProvider)?.maxOutputTokens || 1_200
}

export function simplerLineSystem(input: { learning: LearningLanguage; step: number; setup: ConversationSetup | null }) {
  const language = input.learning.targetLanguage
  return [
    'Say one line of a conversation again, more simply. A language learner did not follow it and asked the speaker to put it more simply.',
    `The line is in ${language}. It was said by the learner’s conversation partner: ${JSON.stringify(speaker(input.setup))}.`,
    ...replyDifficultyRules({ learning: { ...input.learning, proficiency: '', difficultyStep: input.step } }).map((rule) => rule.replaceAll('roleReply', 'text')),
    'Rules:',
    '- Say the same thing. Keep every fact, name and number, the feeling, and the question if the line asks one. Drop a side remark before you drop the point.',
    '- Change how it is said: shorter sentences, the most common words, nothing the learner would have to guess. It must be plainly easier than the line as it stands, not the same difficulty in other words.',
    '- It is still the same person talking, in the same relationship and tone, the way people do repeat themselves when they were not understood. Never explain the line, never add a translation or a note, never speak to the learner as a learner.',
    `- Write only in ${language}.`,
    'Return JSON: {"text":""}',
  ].join('\n')
}

/** The partner's line, said again at an easier step. Throws when the model gives nothing usable. */
export async function simplifyLine(input: {
  line: string
  /** What the learner said just before the line, so the easier version still answers it. */
  before?: string
  /** Everything the learner has written here: words they used themselves are not hard for them. */
  learnerText?: string
  setup: ConversationSetup | null
  learning: LearningLanguage
  step: number
}) {
  const code = input.learning.targetLanguageCode
  const step = clampStep(input.step)
  const profile = difficultyProfile(step, code)
  const known = input.learnerText ? wordKeys(input.learnerText, code) : undefined
  const original = plain(input.line)
  const issuesOf = (value: string) => checkReplyDifficulty(value, code, profile, known).issues.length
  const before = issuesOf(input.line)
  const length = textLength(input.line, code)
  const said = (value: string) => Boolean(value) && plain(value) !== original && matchesExpectedConversationLanguage(value, code)
  const maxOutputTokens = await outputLimit()
  const client = await getModelClient()
  try {
    const result = await generateStructured(client, [
      { role: 'system', content: simplerLineSystem({ learning: input.learning, step, setup: input.setup }) },
      { role: 'user', content: JSON.stringify({ ...(input.before ? { learnerSaid: input.before } : {}), line: input.line }) },
    ], {
      name: 'simpler_line',
      schema: simplerLineSchema,
      hint: '{"text":""}',
      temperature: 0.3,
      attempts: 2,
      maxOutputTokens,
      retryHint: `Return the easier line in text, written only in ${input.learning.targetLanguage}, and different from the line you were given.`,
      normalize(value) {
        const source = record(value)
        return { text: text(source.text || source.line || source.roleReply) }
      },
      usable: (value) => said(value.text) && issuesOf(value.text) === 0,
      // Still a little over the limits, but no harder and no longer than what the learner could not follow.
      acceptable: (value) => said(value.text) && issuesOf(value.text) <= before && textLength(value.text, code) <= Math.ceil(length * 1.2),
    })
    return result.text
  } catch (error) {
    throw withOutputLimitDetails(error, maxOutputTokens)
  }
}

export function lineHintSystem(input: { languageName: string; interfaceName: string; interfaceVoice: string; sameLanguage: boolean }) {
  return [
    'Help a language learner follow one line they did not understand, without translating it for them.',
    `The line is in ${input.languageName}, said by their conversation partner. Write the hint in ${input.sameLanguage ? `very simple ${input.languageName}` : input.interfaceName}. ${input.interfaceVoice}`,
    '- One sentence, two at most. Say what the speaker is doing with the line — asking about something, offering, refusing, joking, changing the subject — and what it is about.',
    input.sameLanguage
      ? '- Then explain at most two words or phrases from the line that carry its meaning, each in a few easier words.'
      : `- Then give the meaning of at most two words or phrases from the line that carry its meaning, each written as: word = meaning. Leave those words in ${input.languageName}; everything else is in ${input.interfaceName}.`,
    '- Do not translate the whole line, and do not answer it for the learner.',
    'Return JSON: {"hint":""}',
  ].join('\n')
}

/** One or two sentences in the interface language that point the learner at what a line means. */
export async function hintForLine(input: {
  line: string
  before?: string
  learning: LearningLanguage
  interfaceLocale?: string
}) {
  const config = await getConfig()
  const locale = normalizeUiLocale(input.interfaceLocale, config.ui.locale)
  const meta = localeMeta(locale)
  const sameLanguage = locale.split('-')[0] === input.learning.targetLanguageCode
  const original = plain(input.line)
  const given = (value: string) => Boolean(value) && value.length <= HINT_MAX_LENGTH && plain(value) !== original
  const maxOutputTokens = await outputLimit()
  const client = await getModelClient()
  try {
    const result = await generateStructured(client, [
      { role: 'system', content: lineHintSystem({ languageName: input.learning.targetLanguage, interfaceName: meta.promptName, interfaceVoice: meta.voice, sameLanguage }) },
      { role: 'user', content: JSON.stringify({ ...(input.before ? { learnerSaid: input.before } : {}), line: input.line }) },
    ], {
      name: 'line_hint',
      schema: lineHintSchema,
      hint: '{"hint":""}',
      temperature: 0.2,
      attempts: 2,
      maxOutputTokens,
      retryHint: `Return one short hint in hint, written in ${meta.promptName}. It is not a translation of the line.`,
      normalize(value) {
        const source = record(value)
        return { hint: text(source.hint || source.text) }
      },
      usable: (value) => given(value.hint) && matchesExpectedLanguage(value.hint, locale),
      // The words it explains are in the other language, which can tip the check; a hint is still better than an error.
      acceptable: (value) => given(value.hint),
    })
    return { hint: result.hint, interfaceLocale: locale }
  } catch (error) {
    throw withOutputLimitDetails(error, maxOutputTokens)
  }
}
