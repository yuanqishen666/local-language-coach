import type { ConversationMaterial } from '../types.js'
import { z } from 'zod'
import { getConfig } from '../services/config.js'
import { getModelClient, ProviderRequestError } from './provider.js'
import type { ModelClient, ModelMessage } from './provider.js'
import { parseModelJson } from '../utils/json.js'
import { coachSystem, episodeSummarySystem, interfaceValuesLocalizationSystem, lookupReplySystem, lookupSystem, memoryAnalysisSystem, memoryConsolidationSystem, repairReplySystem, setupCandidatesSystem, setupLocalizationSystem, translationSystem, turnAnalysisSystem } from './prompts.js'
import { coachTurnSchema, episodeSummarySchema, memoryAnalysisSchema, memoryConsolidationSchema, memoryLocalizationSchema, pathCandidatesSchema, responseJsonSchema, setupCandidateSchema, setupCandidatesSchema, termLookupSchema, translationSchema, turnAnalysisSchema } from './schemas.js'
import type { CoachingResponse, ConversationEpisode, ConversationSetup, ConversationState, DialoguePlan, DialoguePolicy, LearningLanguage, TurnLookupDecision } from '../types.js'
import { normalizeUiLocale } from '../../shared/locales.js'
import {
  analyzeRecentDialogue,
  approximateTokens,
  providerInputBudget,
  selectRecentHistory,
  selectRelevantEpisodes,
  selectRelevantMemories,
  type StoredConversationMessage,
} from './context.js'
import { runLookup } from '../lookup/router.js'
import { matchesExpectedConversationLanguage, matchesExpectedLanguage, mixesAnotherScript } from './language.js'
import { deriveDialoguePolicy, dialoguePolicyIssues, hasQuestion, isQuestionOnly, openerSimilarity } from './dialogue-policy.js'
import { normalizeMemorySemanticSlot } from '../memory-candidates.js'
import { memoryFrame } from '../memory-policy.js'
import {
  CONVERSATION_MEMORY_PROMPT_LIMIT, isErrorCategory, isMemoryKind,
  type ErrorCategory, type MemoryAbout, type MemoryDurability, type MemoryFrame, type MemoryKind,
} from '../../shared/memory.js'
import type { LearningFocus, SetupLearnerProfile, SetupPathInput } from './prompts.js'
import { difficultyIssueText, levelCode, requestDifficulty } from './level.js'
import { checkReplyDifficulty, textLength, wordKeys } from '../proficiency-text.js'
import { tuneConversation, type TurnSignal } from '../proficiency.js'
import { replyStep, type ConversationDifficulty } from '../../shared/proficiency.js'
import { countsAsError, normalizeCertainty } from '../../shared/variants.js'

const repairableOutputCodes = new Set(['PROVIDER_EMPTY_RESPONSE', 'PROVIDER_INVALID_RESPONSE'])

/** `learning` is the language a conversation recorded when it started; without it the current setting applies. */
async function getRequestConfig(interfaceLocale?: string, learning?: LearningLanguage) {
  const config = await getConfig()
  config.ui.locale = normalizeUiLocale(interfaceLocale, config.ui.locale)
  if (learning?.targetLanguage && learning.targetLanguageCode) {
    config.learning.targetLanguage = learning.targetLanguage
    config.learning.targetLanguageCode = learning.targetLanguageCode
  }
  if (typeof learning?.difficultyStep === 'number') config.learning.difficultyStep = learning.difficultyStep
  return config
}

function outputStrings(values: unknown[]): string[] {
  return values.flatMap((value): string[] => {
    if (typeof value === 'string') return value.trim() ? [value] : []
    if (Array.isArray(value)) return outputStrings(value)
    return []
  })
}

function interfaceOutputMatches(config: Awaited<ReturnType<typeof getConfig>>, values: unknown[]) {
  return outputStrings(values).every((value) => matchesExpectedLanguage(value, config.ui.locale))
}

/** Acronyms, level codes and single product names (HR, B2, CI/CD, TypeScript) read the same in every interface language. */
function interfaceNeutral(value: string) {
  return /^[\p{Lu}\d][\p{Lu}\d.+#/-]{1,9}$/u.test(value) || /^(?=\S*\p{Lu})[\p{L}\p{N}.+#_-]{2,24}$/u.test(value)
}

function interfaceAggregateMatches(config: Awaited<ReturnType<typeof getConfig>>, values: unknown[]) {
  const strings = outputStrings(values).filter((value) => !interfaceNeutral(value.trim()))
  return matchesExpectedLanguage(strings.join('\n'), config.ui.locale) &&
    strings.every((value) => matchesExpectedConversationLanguage(value, config.ui.locale))
}

function languageNeutral(value: string) {
  return /^[\p{Lu}\d]{2,10}$/u.test(value) ||
    /^\p{Lu}[\p{L}\p{M}'’_-]*(?:\s+\p{Lu}[\p{L}\p{M}'’_-]*){0,3}$/u.test(value) ||
    /^[\d+().,:/@_-]+$/u.test(value)
}

function targetOutputMatches(config: Awaited<ReturnType<typeof getConfig>>, values: unknown[]) {
  return outputStrings(values).every((value) => matchesExpectedConversationLanguage(value, config.learning.targetLanguageCode))
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []
}

function appendSystem(messages: ModelMessage[], extra: string) {
  return [...messages, { role: 'system' as const, content: extra }]
}

interface StructuredTask<T extends z.ZodType> {
  name: string
  schema: T
  hint: string
  temperature: number
  attempts?: 1 | 2 | 3
  retryHint?: string
  maxOutputTokens?: number
  normalize: (value: unknown) => z.input<T>
  /**
   * Opt-in for answers shaped like {"<listKey>":[...]}. When the provider cuts the answer
   * off, the list elements it had finished are kept and judged like a normal answer.
   */
  listKey?: string
  usable: (value: z.output<T>) => boolean
  /**
   * A complete answer with a blemish that is not worth failing for, such as a note in the wrong
   * language. It is still retried; when no attempt does better, the last such answer is returned.
   */
  acceptable?: (value: z.output<T>) => boolean
}

/** Whether an answer has the keys of the compact example, at every level the example spells out. */
export function hasExampleShape(value: unknown, example: unknown): boolean {
  if (Array.isArray(example)) {
    if (!Array.isArray(value)) return false
    const item = example[0]
    return item === undefined || value.every((entry) => hasExampleShape(entry, item))
  }
  if (example && typeof example === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const source = value as Record<string, unknown>
    return Object.entries(example).every(([key, expected]) => key in source &&
      (expected === null || typeof expected !== 'object' || source[key] === null || hasExampleShape(source[key], expected)))
  }
  return true
}

/**
 * The list a model meant to return. Outside strict schema mode some models drop the wrapper
 * and answer with the bare list, name it differently, or write the single item on its own.
 */
export function listFromAnswer(value: unknown, listKey: string): unknown[] {
  if (Array.isArray(value)) return value
  const source = record(value)
  if (Array.isArray(source[listKey])) return source[listKey]
  if (Object.keys(record(source[listKey])).length) return [source[listKey]]
  const values = Object.values(source)
  if (values.length === 1 && Array.isArray(values[0])) return values[0]
  return values.length > 1 ? [source] : []
}

/** The list elements a cut-off answer had finished writing. The one in progress is left out. */
export function completedListItems(partialContent: string, listKey: string): unknown[] {
  const opening =
    new RegExp('"' + listKey + '"\\s*:\\s*\\[').exec(partialContent) ||
    /^\s*(?:`{3}(?:json)?\s*)?(?:\{\s*"[^"]*"\s*:\s*)?\[/.exec(partialContent)
  if (!opening) return []
  const start = opening.index + opening[0].length
  let end = start
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < partialContent.length; index += 1) {
    const char = partialContent[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
    } else if (char === '"') {
      inString = true
    } else if (char === '{' || char === '[') {
      depth += 1
    } else if (char === '}' || char === ']') {
      if (depth === 0) break
      depth -= 1
      if (depth === 0) end = index + 1
    }
  }
  if (end === start) return []
  try {
    return parseModelJson<{ items: unknown[] }>('{"items":[' + partialContent.slice(start, end) + ']}').items
  } catch {
    return []
  }
}

function recoverTruncated<T extends z.ZodType>(task: StructuredTask<T>, partialContent: string | undefined): z.output<T> | undefined {
  if (!partialContent || !task.listKey) return undefined
  const items = completedListItems(partialContent, task.listKey)
  if (!items.length) return undefined
  try {
    const parsed = task.schema.safeParse(task.normalize({ [task.listKey]: items }))
    return parsed.success && task.usable(parsed.data) ? parsed.data : undefined
  } catch {
    return undefined
  }
}

// Pessimistic output cost of generated items, in tokens. Interface-language CJK text and
// nested objects are the expensive part; hidden reasoning also spends the same limit.
const LIST_ENVELOPE_OUTPUT_TOKENS = 80
export const SETUP_OUTPUT_TOKENS = 300
export const COMFORTABLE_LIST_OUTPUT_TOKENS = 2_000

/** How many items of a given size one answer can hold under the configured output limit. */
export function listBatchSize(maxOutputTokens: number, perItemTokens: number, most: number) {
  const room = Math.floor(maxOutputTokens * 0.75) - LIST_ENVELOPE_OUTPUT_TOKENS
  return Math.max(1, Math.min(most, Math.floor(room / perItemTokens)))
}

export interface ListRequestStep {
  count: number
  compact: boolean
  /** Set when an earlier answer arrived whole and none of its items was good enough to stop at. */
  rejected?: boolean
}

/** The first request fits the output limit; the second is the smallest request that still works. */
export function listRequestSteps(count: number): ListRequestStep[] {
  return [{ count: Math.max(1, count), compact: false }, { count: 1, compact: true }]
}

const shrinkableOutputCodes = new Set(['PROVIDER_TRUNCATED_RESPONSE', 'PROVIDER_INVALID_RESPONSE', 'PROVIDER_EMPTY_RESPONSE', 'PROVIDER_TIMEOUT'])

/**
 * Asks for a list in steps that get smaller. Items are judged one by one, so one weak
 * item never discards the others, and a cut-off or malformed answer leads to a smaller
 * request instead of a failure. Items that only pass `acceptable` are kept as a last resort.
 * When a whole answer is turned down, the next request says so (`step.rejected`), and the model
 * always gets one such corrected request before the failure is reported.
 */
export async function generateListInSteps<Item>(input: {
  steps: ListRequestStep[]
  request: (step: ListRequestStep) => Promise<Item[]>
  preferred: (item: Item) => boolean
  acceptable?: (item: Item) => boolean
  /** The error to report when answers arrived and no item in them could be used. */
  rejection?: () => unknown
}): Promise<Item[]> {
  const spare: Item[] = []
  const steps = [...input.steps]
  let lastError: unknown
  let truncated: unknown
  let rejected = false
  for (let index = 0; index < steps.length; index += 1) {
    const step: ListRequestStep = rejected ? { ...steps[index], rejected: true } : steps[index]
    try {
      const items = await input.request(step)
      const preferred = items.filter(input.preferred)
      if (preferred.length) return preferred
      if (input.acceptable) spare.push(...items.filter(input.acceptable))
      lastError = input.rejection?.() || new ProviderRequestError('模型返回的结构不完整。', 502, 'PROVIDER_INVALID_RESPONSE')
      if (!rejected && !spare.length && index === steps.length - 1) steps.push({ count: 1, compact: true })
      rejected = true
    } catch (error) {
      if (!(error instanceof ProviderRequestError) || !shrinkableOutputCodes.has(error.code)) throw error
      if (error.code === 'PROVIDER_TRUNCATED_RESPONSE') truncated = error
      lastError = error
    }
  }
  if (spare.length) return spare
  // A cut-off answer is the one cause the user can fix in settings, so it is the one to report.
  throw truncated || lastError
}

/** Adds the numbers the interface needs to tell the user which setting to change. */
export function withOutputLimitDetails(error: unknown, maxOutputTokens: number) {
  if (error instanceof ProviderRequestError && error.code === 'PROVIDER_TRUNCATED_RESPONSE') {
    error.details = {
      maxOutputTokens,
      recommendedMaxOutputTokens: maxOutputTokens < COMFORTABLE_LIST_OUTPUT_TOKENS ? COMFORTABLE_LIST_OUTPUT_TOKENS : maxOutputTokens * 2,
    }
  }
  return error
}

export async function generateStructured<T extends z.ZodType>(client: ModelClient, messages: ModelMessage[], task: StructuredTask<T>): Promise<z.output<T>> {
  const schema = responseJsonSchema(task.schema)
  const withExample = appendSystem(messages, 'Return one JSON object only. Compact example: ' + task.hint)
  let example: unknown
  try { example = JSON.parse(task.hint) } catch { example = undefined }
  let outputMode = client.outputMode
  let remaining: number = task.attempts || 1
  let retrying = false
  let rescued = false
  let lastError: unknown
  let fallback: z.output<T> | undefined

  // A provider can accept a schema without enforcing it, or refuse this particular schema. The
  // question is then asked once more as plain JSON with the example spelled out.
  const rescueAsPlainJson = () => {
    if (rescued || outputMode !== 'json_schema') return
    rescued = true
    outputMode = 'prompt_json'
    remaining = Math.max(remaining, 1)
  }

  while (remaining > 0) {
    remaining -= 1
    const mode = outputMode
    try {
      const base = mode === 'json_schema' ? messages : withExample
      const requestMessages = retrying
        ? appendSystem(base, task.retryHint || 'The previous JSON was incomplete. Return a shorter object that satisfies every required field exactly once.')
        : base
      const output = await client.generate(requestMessages, {
        structured: { name: task.name, schema },
        outputMode: mode,
        maxOutputTokens: task.maxOutputTokens,
        temperature: retrying ? 0 : task.temperature,
        timeoutMs: 30_000,
        retries: 0,
      })
      retrying = true
      if (mode === 'json_object') outputMode = 'prompt_json'
      lastError = new ProviderRequestError('模型返回的结构不完整。', 502, 'PROVIDER_INVALID_RESPONSE')
      let raw: unknown
      try {
        raw = parseModelJson<unknown>(output)
      } catch {
        rescueAsPlainJson()
        continue
      }
      const parsed = task.schema.safeParse(task.normalize(raw))
      if (parsed.success && task.usable(parsed.data)) return parsed.data
      if (parsed.success && task.acceptable?.(parsed.data)) fallback = parsed.data
      else if (example !== undefined && !hasExampleShape(raw, example)) rescueAsPlainJson()
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        if (error.code === 'PROVIDER_TRUNCATED_RESPONSE' && task.listKey) {
          const recovered = recoverTruncated(task, error.partialContent)
          if (recovered) return recovered
        } else if (error.code === 'PROVIDER_INVALID_REQUEST' && mode === 'json_schema' && !rescued) {
          lastError = error
          rescueAsPlainJson()
          continue
        } else if (!repairableOutputCodes.has(error.code)) {
          // The retry was for polish; an answer that is already good enough is not thrown away for it.
          if (fallback !== undefined) return fallback
          throw error
        }
      }
      lastError = error
      retrying = true
      if (mode === 'json_object') outputMode = 'prompt_json'
    }
  }

  if (fallback !== undefined) return fallback
  if (lastError instanceof ProviderRequestError) throw lastError
  throw new ProviderRequestError('模型没有返回可用的核心内容。', 502, 'PROVIDER_INVALID_RESPONSE')
}

export function normalizeLookupDecision(value: unknown): TurnLookupDecision {
  const lookup = record(value)
  const locator = record(lookup.locator)
  const locatorQuote = text(locator.quote)
  const locatorValue = text(locator.value, locatorQuote)
  return {
    action: (['reply', 'clarify', 'lookup'].includes(text(lookup.action)) ? text(lookup.action) : 'reply') as 'reply' | 'clarify' | 'lookup',
    parts: (Array.isArray(lookup.parts) ? lookup.parts : []).map((item) => {
      const part = record(item)
      const reason = text(part.reason)
      const needsLookup = Boolean(part.needsLookup)
      return {
        text: text(part.text || part.question || part.intent),
        needsLookup,
        reason: (['stable', 'changing', 'user_requested', 'user_location', 'unknown'].includes(reason) ? reason : needsLookup ? 'changing' : 'stable') as 'stable' | 'changing' | 'user_requested' | 'user_location' | 'unknown',
        subject: text(part.subject),
      }
    }).filter((item) => item.text || item.subject).slice(0, 8),
    query: text(lookup.query),
    locator: lookup.locator && locatorValue
      ? {
          kind: (['url', 'domain', 'platform', 'account', 'post', 'file'].includes(text(locator.kind || locator.type)) ? text(locator.kind || locator.type) : 'platform') as 'url' | 'domain' | 'platform' | 'account' | 'post' | 'file',
          value: locatorValue,
          domain: text(locator.domain),
          quote: locatorQuote,
        }
      : null,
  }
}

const ASIDE_MAX_LENGTH = 400

export function normalizeCoachResponse(value: unknown) {
  const source = record(value)
  const reconstruction = record(source.reconstruction)
  const correctionItems = Array.isArray(source.corrections) ? source.corrections : []
  const statePatch = record(source.statePatch)
  const reconstructionType = text(reconstruction.type)
  return {
    roleReply: text(source.roleReply || source.reply),
    aside: text(source.aside).slice(0, ASIDE_MAX_LENGTH),
    reconstruction: source.reconstruction && text(reconstruction.improved)
      ? {
          type: (['completion', 'translation', 'correction', 'optional'].includes(reconstructionType) ? reconstructionType : 'correction') as 'completion' | 'translation' | 'correction' | 'optional',
          original: text(reconstruction.original),
          improved: text(reconstruction.improved),
          explanation: text(reconstruction.explanation),
        }
      : null,
    corrections: correctionItems.map((item) => {
      const correction = record(item)
      const severity = text(correction.severity)
      return {
        original: text(correction.original),
        improved: text(correction.improved),
        explanation: text(correction.explanation),
        severity: (['meaning', 'naturalness', 'minor'].includes(severity) ? severity : 'naturalness') as 'meaning' | 'naturalness' | 'minor',
        category: errorCategory(correction.category),
        certainty: normalizeCertainty(correction.certainty),
      }
    }).filter((item) => item.improved),
    lookup: normalizeLookupDecision(source.lookup),
    statePatch: {
      currentTopic: text(statePatch.currentTopic),
      openedLoops: strings(statePatch.openedLoops).slice(0, 2),
      resolvedLoops: strings(statePatch.resolvedLoops).slice(0, 4),
      sceneFacts: strings(statePatch.sceneFacts).slice(0, 4),
      userFacts: (Array.isArray(statePatch.userFacts) ? statePatch.userFacts : []).map((item) => {
        const fact = record(item)
        return { key: text(fact.key), value: text(fact.value), quote: text(fact.quote), sensitive: Boolean(fact.sensitive) }
      }).filter((item) => item.key && item.value && item.quote).slice(0, 3),
    },
  }
}

export function normalizeTurnAnalysis(value: unknown, latestUser: string) {
  const source = record(value)
  const reconstruction = record(source.reconstruction)
  const reconstructionType = text(reconstruction.type)
  const sourceLanguageMatch = text(source.languageMatch)
  const corrections = (Array.isArray(source.corrections) ? source.corrections : []).map((item) => {
    const correction = record(item)
    const severity = text(correction.severity)
    return {
      original: text(correction.original),
      improved: text(correction.improved),
      explanation: text(correction.explanation),
      severity: (['meaning', 'naturalness', 'minor'].includes(severity) ? severity : 'naturalness') as 'meaning' | 'naturalness' | 'minor',
      category: errorCategory(correction.category),
      certainty: normalizeCertainty(correction.certainty),
    }
  }).filter((item) => item.original && latestUser.includes(item.original) && item.improved && item.improved !== item.original)
  const stringReconstruction = typeof source.reconstruction === 'string' && !/^(?:null|none)$/iu.test(source.reconstruction.trim())
    ? source.reconstruction.trim()
    : ''
  const reconstructionImproved = text(reconstruction.improved || stringReconstruction)
  const normalizedStringReconstruction = Boolean(stringReconstruction && !reconstruction.improved)
  const normalizedReconstruction = reconstructionImproved
    ? {
        type: (['completion', 'translation', 'correction', 'optional'].includes(reconstructionType)
          ? reconstructionType
          : normalizedStringReconstruction ? 'completion' : 'correction') as 'completion' | 'translation' | 'correction' | 'optional',
        original: normalizedStringReconstruction ? latestUser : text(reconstruction.original),
        improved: reconstructionImproved,
        explanation: normalizedStringReconstruction
          ? corrections[0]?.explanation || ''
          : text(reconstruction.explanation),
      }
    : null
  const languageMatch = (['target', 'non_target', 'mixed'].includes(sourceLanguageMatch)
    ? sourceLanguageMatch
    : normalizedReconstruction ? 'non_target' : undefined) as 'target' | 'non_target' | 'mixed'
  if (normalizedReconstruction && languageMatch !== 'target') normalizedReconstruction.original = latestUser
  return {
    languageMatch,
    lookup: normalizeLookupDecision(source.lookup),
    reconstruction: normalizedReconstruction,
    corrections,
  }
}

function errorCategory(value: unknown): ErrorCategory {
  const category = text(value)
  return isErrorCategory(category) ? category : 'other'
}

/**
 * `frame` fills in the judgements a model left out. Inside a scene the cautious reading is that
 * the learner spoke as the part they play, so an unlabelled statement stays with the conversation.
 */
export function normalizeMemoryAnalysis(value: unknown, latestUser: string, memoryKeys: string[], frame: MemoryFrame = 'direct') {
  const source = record(value)
  const allowedMemoryKeys = new Set(memoryKeys.map((key) => text(key)).filter(Boolean))
  const replyType = text(source.replyType)
  const planSource = record(source.dialoguePlan)
  const anchorCandidate = text(planSource.anchorQuote)
  const anchorQuote = anchorCandidate && latestUser.includes(anchorCandidate)
    ? anchorCandidate
    : latestUser.trim().slice(0, 120)
  const mode = text(planSource.mode)
  const move = text(planSource.move)
  const questionPolicy = text(planSource.questionPolicy)
  const previousMoveOutcome = text(planSource.previousMoveOutcome)
  const callbackCandidate = text(planSource.callbackMemoryKey)
  const callbackMemoryKey = allowedMemoryKeys.has(callbackCandidate) ? callbackCandidate : ''
  const normalizedMove = (['answer', 'react', 'observe', 'associate', 'callback', 'share', 'clarify'].includes(move) ? move : 'react') as DialoguePlan['move']
  const normalizedQuestionPolicy = (['none', 'optional', 'required'].includes(questionPolicy) ? questionPolicy : 'none') as DialoguePlan['questionPolicy']
  const dialoguePlan: DialoguePlan = {
    mode: (['casual', 'story', 'support', 'task', 'opinion', 'learning'].includes(mode) ? mode : 'casual') as DialoguePlan['mode'],
    anchorQuote,
    anchorMeaning: text(planSource.anchorMeaning, anchorQuote),
    move: normalizedMove === 'callback' && !callbackMemoryKey ? 'observe' : normalizedMove,
    topic: text(planSource.topic, 'general').toLocaleLowerCase().slice(0, 40),
    branch: text(planSource.branch).toLocaleLowerCase().slice(0, 60),
    contribution: text(planSource.contribution).slice(0, 280),
    questionPolicy: normalizedQuestionPolicy,
    questionPurpose: normalizedQuestionPolicy === 'none' ? '' : text(planSource.questionPurpose).slice(0, 180),
    previousMoveOutcome: (['continued', 'switched', 'rejected', 'corrected', 'unclear', 'none'].includes(previousMoveOutcome) ? previousMoveOutcome : 'none') as DialoguePlan['previousMoveOutcome'],
    callbackMemoryKey,
    reopenBranch: Boolean(planSource.reopenBranch),
  }
  const normalizedFacts = (Array.isArray(source.userFacts) ? source.userFacts : []).map((item) => {
    const fact = record(item)
    const memoryType = text(fact.memoryType)
    const normalizedMemoryType: MemoryKind = isMemoryKind(memoryType) ? memoryType : memoryType === 'episodic' ? 'plan' : 'profile'
    const about = text(fact.about)
    const durability = text(fact.durability)
    const validDays = Number(fact.validDays)
    const topic = text(fact.topic, 'general').toLocaleLowerCase().slice(0, 40)
    const key = text(fact.key)
    const semanticSlot = normalizeMemorySemanticSlot(fact.semanticSlot) ||
      normalizeMemorySemanticSlot(`new:${normalizedMemoryType}:${topic}:${key}`)
    return {
      key,
      semanticSlot,
      value: text(fact.value),
      quote: text(fact.quote),
      sensitive: Boolean(fact.sensitive),
      memoryType: normalizedMemoryType,
      topic,
      importance: Math.max(0, Math.min(1, Number(fact.importance) || 0.5)),
      suggestedTier: (text(fact.suggestedTier) === 'core' ? 'core' : 'long_term') as 'core' | 'long_term',
      about: (['user', 'persona', 'other'].includes(about) ? about : frame === 'scene' ? 'persona' : 'user') as MemoryAbout,
      durability: (['lasting', 'temporary', 'momentary'].includes(durability) ? durability : normalizedMemoryType === 'plan' ? 'temporary' : 'lasting') as MemoryDurability,
      validDays: Number.isFinite(validDays) && validDays > 0 ? Math.min(730, Math.round(validDays)) : 0,
      explicit: fact.explicit === true,
    }
  }).filter((item) => item.key && item.semanticSlot && item.value && item.quote && latestUser.includes(item.quote))
  const factsBySlot = new Map<string, typeof normalizedFacts[number]>()
  for (const fact of normalizedFacts) factsBySlot.set(fact.semanticSlot, fact)
  return {
    disposition: text(source.disposition) === 'remember' ? 'remember' as const : 'ignore' as const,
    userFacts: [...factsBySlot.values()].slice(0, 3),
    replyType: (['casual', 'recommendation', 'planning', 'learning', 'factual', 'support', 'other'].includes(replyType) ? replyType : 'other') as 'casual' | 'recommendation' | 'planning' | 'learning' | 'factual' | 'support' | 'other',
    relevantTopics: strings(source.relevantTopics).map((topic) => topic.toLocaleLowerCase().slice(0, 40)).slice(0, 8),
    relevantMemoryKeys: strings(source.relevantMemoryKeys).filter((key) => allowedMemoryKeys.has(key)).slice(0, 8),
    dialoguePlan,
  }
}

const durableClauseSignal = new RegExp([
  String.raw`\b(?:i\s+(?:prefer|like|love|hate|dislike|always|never|work\s+as|live\s+in|want\s+to\s+practice)|i(?:'m|\s+am)\s+allergic|my\s+(?:name|job|profession|occupation|goal)\s+is|call\s+me)\b`,
  String.raw`\b(?:i(?:'m|\s+am)\s+(?:an?\s+)?(?:software\s+)?(?:engineer|developer|manager|teacher|student|designer|doctor|nurse|lawyer|accountant|consultant|researcher|writer|artist|architect))\b`,
  String.raw`(?:我是|我叫|我喜欢|我偏好|我讨厌|我对.+过敏|我住在|我一直|我从不|我的.+目标)`,
  String.raw`(?:私は|僕は|わたしは|が好き|を好み|が嫌い|アレルギー|に住んで|いつも|決して)`,
  String.raw`(?:저는|나는|제가|좋아해|선호해|싫어해|알레르기|살고|항상|절대)`,
  String.raw`(?:prefiero|me\s+gusta|me\s+encanta|odio|al[eé]rgic|trabajo\s+como|vivo\s+en|me\s+llamo|siempre|nunca|quiero\s+practicar)`,
  String.raw`(?:je\s+préfère|j['’]aime|je\s+déteste|allerg|je\s+travaille\s+comme|j['’]habite|je\s+m['’]appelle|toujours|jamais|je\s+veux\s+pratiquer)`,
  String.raw`(?:ich\s+bevorzuge|ich\s+mag|ich\s+liebe|ich\s+hasse|allerg|ich\s+arbeite\s+als|ich\s+wohne|ich\s+heiße|immer|nie)`,
  String.raw`(?:preferisco|mi\s+piace|adoro|odio|allergic|lavoro\s+come|vivo\s+a|mi\s+chiamo|sempre|mai|voglio\s+esercitarmi)`,
  String.raw`(?:prefiro|eu\s+gosto|adoro|odeio|al[eé]rgic|trabalho\s+como|moro\s+em|me\s+chamo|sempre|nunca|quero\s+praticar)`,
  String.raw`(?:मुझे.+पसंद|मैं.+हूँ|मेरा\s+नाम|एलर्जी|मैं.+रहता|मैं.+रहती|हमेशा|कभी\s+नहीं|अभ्यास\s+करना)`,
].join('|'), 'iu')

export function explicitMemoryClauses(latestUser: string) {
  return latestUser.split(/(?<=[.!?。！？])|[;；\n]+/u)
    .map((clause) => clause.trim())
    .filter((clause) => clause && durableClauseSignal.test(clause))
    .slice(0, 3)
}

function memoryAnalysisCoversClauses(
  facts: Array<{ quote: string }>,
  clauses: string[],
) {
  return clauses.every((clause) => facts.some((fact) => clause.includes(fact.quote) || fact.quote.includes(clause)))
}

export function naturalReplyIssues(reply: string, messages: StoredConversationMessage[], lookupUsed: boolean, dialoguePolicy?: DialoguePolicy) {
  const issues: string[] = []
  const clean = reply.trim()
  if (!clean) return ['empty reply']
  if (isQuestionOnly(clean)) issues.push('the reply is only questions and contains no substantive statement')
  const questionCount = (clean.match(/[?？]/gu) || []).length
  if (questionCount > 1) issues.push('the reply asks more than one question')
  if (dialoguePolicy) issues.push(...dialoguePolicyIssues(clean, dialoguePolicy))
  if (/(根据(搜索|检索)结果|证据(表明|显示)|来源(表明|显示)|according to (the )?(search results|sources)|the evidence (shows|suggests)|as an ai)/iu.test(clean)) {
    issues.push('the reply uses report-like or AI-disclaimer language')
  }
  if (lookupUsed && /https?:\/\/|\[[^\]]+\]\([^)]+\)/u.test(clean)) issues.push('the conversational reply exposes URLs or citations')
  const previous = [...messages].reverse().find((message) => message.role === 'assistant')?.content.trim() || ''
  const opener = (value: string) => value.replace(/^[-—–"“'‘\s]+/u, '').slice(0, 18).toLocaleLowerCase()
  if (previous && opener(previous).length >= 8 && opener(previous) === opener(clean)) issues.push('the reply repeats the previous opening phrase')
  const currentOpening = clean.replace(/^[-—–"“'‘\s]+/u, '').slice(0, 48)
  const repeatedOpening = messages.filter((message) => message.role === 'assistant').slice(-6)
    .some((message) => currentOpening.length >= 8 && openerSimilarity(currentOpening, message.content.slice(0, 48)) >= 0.72)
  if (repeatedOpening && !issues.includes('the reply repeats the previous opening phrase')) {
    issues.push('the reply repeats a recent conversational opening pattern')
  }
  return issues
}

export function likelyNeedsTargetLanguageRescue(input: string, targetCode: string) {
  const normalized = input.normalize('NFC')
    .replace(/```[\s\S]*?```|`[^`]*`/gu, ' ')
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  return Boolean(normalized) && !languageNeutral(normalized) &&
    (!matchesExpectedConversationLanguage(normalized, targetCode) || mixesAnotherScript(normalized, targetCode))
}

/** The model answered in full, twice, and the opening line was still not in the language being practised. */
export function openingLanguageError(config: { learning: { targetLanguage: string; targetLanguageCode: string } }) {
  const error = new ProviderRequestError('模型没有用目标语言写开场白。', 502, 'PROVIDER_WRONG_LANGUAGE')
  error.details = { targetLanguage: config.learning.targetLanguage, targetLanguageCode: config.learning.targetLanguageCode }
  return error
}

export function languageFeedbackConsistent(
  value: { languageMatch: 'target' | 'non_target' | 'mixed'; reconstruction: unknown },
  nonTargetDetected = false,
) {
  if (nonTargetDetected && value.languageMatch === 'target') return false
  return value.languageMatch === 'target' ? !value.reconstruction : Boolean(value.reconstruction)
}

function turnAnalysisComplete(value: { lookup: TurnLookupDecision }) {
  return Boolean(
    value.lookup.parts.length > 0 &&
    value.lookup.parts.every((part) => part.subject && (part.reason !== 'unknown' || value.lookup.action === 'clarify')) &&
    (value.lookup.action !== 'lookup' || (value.lookup.parts.some((part) => part.needsLookup) && (value.lookup.query || value.lookup.locator))) &&
    (value.lookup.action !== 'reply' || value.lookup.parts.every((part) => !part.needsLookup)),
  )
}

function selectedProvider(config: Awaited<ReturnType<typeof getConfig>>) {
  const provider = config.providers.find((item) => item.id === config.llm.defaultProvider)
  if (!provider) throw Object.assign(new Error('Provider not found'), { statusCode: 409 })
  return provider
}

const PATH_SETUPS_HINT = '{"setups":[{"title":"","category":"","setting":"","partnerName":"","partnerRole":"","relationship":"","tone":"","personalityCues":[],"interests":[],"currentMood":"","topicSeed":"","openingLine":"","difficulty":"","practiceWords":[],"weakSpot":""}]}'

/** A suggested conversation. One asked for as a next step also says which saved words and which weak spot it suits. */
export type SuggestedSetup = ConversationSetup & { practiceWords?: string[]; weakSpot?: string }

export async function suggestSetups(input: { domain?: string; place?: string; detail?: string; interfaceLocale?: string; avoidRecent?: unknown[]; learner?: SetupLearnerProfile; difficultyStep?: number; path?: SetupPathInput; count?: number }): Promise<SuggestedSetup[]> {
  const config = await getRequestConfig(input.interfaceLocale)
  if (typeof input.difficultyStep === 'number') config.learning.difficultyStep = input.difficultyStep
  const level = levelCode(config)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  // Defaults for fields a model left out are plain English, and text copied from the learner's own
  // request is in whatever language they typed; neither says anything about the model's language use.
  const inherited = new Set([...setupFieldDefaults, input.domain, input.place, input.detail, config.learning.proficiency, level]
    .map((value) => text(value)).filter(Boolean))
  const written = (values: unknown[]) => values.filter((value) => typeof value !== 'string' || !inherited.has(value))
  const normalize = (value: unknown) => {
    const rawSetups = listFromAnswer(value, 'setups')
    return {
      setups: rawSetups.slice(0, 3).map((item) => {
        const setup = record(item)
        return {
          title: text(setup.title),
          category: text(setup.category, input.domain || 'custom'),
          setting: text(setup.setting, input.place || ''),
          partnerName: text(setup.partnerName),
          // Shown to the learner, so a missing one is left for the page to name in its own language.
          partnerRole: text(setup.partnerRole),
          relationship: text(setup.relationship, 'new acquaintance'),
          tone: text(setup.tone, 'warm and natural'),
          personalityCues: strings(setup.personalityCues).slice(0, 3),
          interests: strings(setup.interests).slice(0, 3),
          currentMood: text(setup.currentMood, 'open and attentive'),
          topicSeed: text(setup.topicSeed, input.detail || ''),
          openingLine: text(setup.openingLine),
          difficulty: level,
          practiceWords: input.path ? strings(setup.practiceWords).slice(0, 2) : [],
          weakSpot: input.path ? text(setup.weakSpot) : '',
        }
      }).filter((setup) => setup.title && setup.openingLine),
    }
  }
  try {
    return await generateListInSteps({
      steps: listRequestSteps(listBatchSize(provider.maxOutputTokens, SETUP_OUTPUT_TOKENS, Math.max(1, Math.min(3, input.count ?? 3)))),
      request: async (step) => (await generateStructured(client, [
        { role: 'system', content: setupCandidatesSystem(config, step, input.learner, input.path) },
        { role: 'user', content: (step.count === 1 ? 'Create exactly 1 open-ended conversation opening for: ' : `Create up to ${step.count} open-ended conversation openings for: `) + JSON.stringify(input) },
      ], {
        name: 'conversation_setups',
        schema: (input.path ? pathCandidatesSchema : setupCandidatesSchema) as typeof pathCandidatesSchema,
        hint: input.path ? PATH_SETUPS_HINT : '{"setups":[{"title":"","category":"","setting":"","partnerName":"","partnerRole":"","relationship":"","tone":"","personalityCues":[],"interests":[],"currentMood":"","topicSeed":"","openingLine":"","difficulty":""}]}',
        temperature: 0.7,
        maxOutputTokens: provider.maxOutputTokens,
        normalize,
        listKey: 'setups',
        usable: (value) => value.setups.length > 0,
      })).setups,
      preferred: (setup) => interfaceAggregateMatches(config, written([
        setup.title, setup.category, setup.setting, setup.partnerRole, setup.relationship,
        setup.tone, setup.personalityCues, setup.interests, setup.currentMood, setup.topicSeed,
      ])) && targetOutputMatches(config, [setup.openingLine]),
      // A description in the wrong language is a blemish; an opening in the wrong language is not usable.
      acceptable: (setup) => targetOutputMatches(config, [setup.openingLine]),
      rejection: () => openingLanguageError(config),
    })
  } catch (error) {
    throw withOutputLimitDetails(error, provider.maxOutputTokens)
  }
}

const setupFieldDefaults = new Set(['custom', 'Conversation partner', 'new acquaintance', 'warm and natural', 'open and attentive'])

export async function localizeConversationSetup(setup: ConversationSetup, interfaceLocale?: string): Promise<ConversationSetup> {
  const config = await getRequestConfig(interfaceLocale)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  return generateStructured(client, [
    { role: 'system', content: setupLocalizationSystem(config) },
    { role: 'user', content: JSON.stringify(setup) },
  ], {
    name: 'conversation_setup_localization',
    schema: setupCandidateSchema,
    hint: '{"title":"","category":"","setting":"","partnerName":"","partnerRole":"","relationship":"","tone":"","personalityCues":[],"interests":[],"currentMood":"","topicSeed":"","openingLine":"","difficulty":""}',
    temperature: 0.1,
    attempts: 2,
    maxOutputTokens: provider.maxOutputTokens,
    retryHint: `Translate only the interface-description fields into ${config.ui.locale}. Preserve partnerName, openingLine, and difficulty exactly.`,
    normalize(value) {
      const source = record(value)
      return {
        title: text(source.title),
        category: text(source.category),
        setting: text(source.setting),
        partnerName: text(source.partnerName),
        partnerRole: text(source.partnerRole),
        relationship: text(source.relationship),
        tone: text(source.tone),
        personalityCues: strings(source.personalityCues).slice(0, 3),
        interests: strings(source.interests).slice(0, 3),
        currentMood: text(source.currentMood),
        topicSeed: text(source.topicSeed),
        openingLine: text(source.openingLine),
        difficulty: text(source.difficulty),
        participants: setup.participants,
        localStyle: setup.localStyle,
        factPolicy: setup.factPolicy,
        initiativeMode: setup.initiativeMode,
        openingAct: setup.openingAct,
        encounterSummary: text(source.encounterSummary, setup.encounterSummary || ''),
        safetyClass: setup.safetyClass,
      }
    },
    usable: (value) => Boolean(value.title && value.partnerRole &&
      value.partnerName === setup.partnerName &&
      value.openingLine === setup.openingLine &&
      value.difficulty === setup.difficulty &&
      interfaceAggregateMatches(config, [
        value.title, value.category, value.setting, value.partnerRole, value.relationship,
        value.tone, value.personalityCues, value.interests, value.currentMood, value.topicSeed,
      ])),
    acceptable: (value) => Boolean(value.title && value.partnerRole &&
      value.partnerName === setup.partnerName &&
      value.openingLine === setup.openingLine &&
      value.difficulty === setup.difficulty),
  })
}

interface CoachTurnInput {
  setup: ConversationSetup | null
  messages: StoredConversationMessage[]
  /** Long-term memories this conversation is allowed to see. Scope is settled by the caller, before any scoring. */
  memories: Array<Record<string, unknown>>
  /** What the learner has said in this conversation and is kept with it. */
  conversationMemories?: Array<{ key: string; value: string }>
  /** Kinds of mistake this learner keeps making in this language. */
  learningFocus?: LearningFocus[]
  /** Saved words waiting to be used in this conversation; the partner leaves room for them. */
  reviewWords?: Array<{ term: string; meaning: string }>
  /** A story or pasted text the conversation is about. */
  material?: ConversationMaterial | null
  episodes: ConversationEpisode[]
  state: ConversationState
  interfaceLocale?: string
  learning?: LearningLanguage
  /** Where the difficulty of this conversation stands, and the help the learner asked for on the line being answered. */
  difficulty?: {
    state: ConversationDifficulty
    help?: { lookups: number; translated: boolean; simpler: number; slower: number; hints: number; lowered: boolean }
  }
}

/** What a turn says about how the learner is doing, and where it leaves the conversation's difficulty. */
export interface TurnLevel {
  /** The step the reply was written at. */
  step: number
  difficulty: ConversationDifficulty
  signal: Pick<TurnSignal, 'length' | 'meaningErrors' | 'naturalnessErrors' | 'nonTarget'>
  /** The reply was over the limits for this step and was sent back once to be rewritten. */
  rewritten: boolean
}

export async function coachTurn(input: CoachTurnInput): Promise<{ coaching: CoachingResponse; level?: TurnLevel; context: { tight: boolean; recentMessages: number; episodes: number; memories: number; memoryIds: string[]; usedMemories: Array<{ id: string; value: string; memoryType: string }>; dialoguePlan: DialoguePlan; dialoguePolicy: DialoguePolicy } }> {
  const config = await getRequestConfig(input.interfaceLocale, input.learning)
  // The learner's turn is read against the difficulty the conversation stands at; the reply may be written a step off it.
  if (input.difficulty) config.learning.difficultyStep = replyStep(input.difficulty.state)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  const latestUser = [...input.messages].reverse().find((message) => message.role === 'user')?.content || ''
  const nonTargetDetected = likelyNeedsTargetLanguageRescue(latestUser, config.learning.targetLanguageCode)
  const explicitDurableClauses = explicitMemoryClauses(latestUser)
  const memoryCatalog = input.memories.slice(0, 100)
  const memoryKeys = memoryCatalog.map((memory) => text(memory.key)).filter(Boolean)
  const analysisHistory = selectRecentHistory(input.messages, 1_400, 4)
  const dynamics = analyzeRecentDialogue(input.messages)
  const frame = memoryFrame(input.setup)
  let memoryAnalysis = normalizeMemoryAnalysis({}, latestUser, memoryKeys, frame)
  try {
    memoryAnalysis = await generateStructured(client, [
      { role: 'system', content: memoryAnalysisSystem(config, memoryCatalog, input.state, input.episodes, { setup: input.setup, today: new Date().toISOString().slice(0, 10) }) },
      ...analysisHistory,
    ], {
      name: 'memory_analysis',
      schema: memoryAnalysisSchema,
      hint: '{"disposition":"ignore","userFacts":[{"key":"occupation","semanticSlot":"profile.occupation","value":"software engineer","quote":"exact words","sensitive":false,"memoryType":"profile","topic":"work","importance":0.7,"suggestedTier":"long_term","about":"user","durability":"lasting","validDays":0,"explicit":false}],"replyType":"casual","relevantTopics":[],"relevantMemoryKeys":[],"dialoguePlan":{"mode":"casual","anchorQuote":"latest words","anchorMeaning":"meaning","move":"react","topic":"general","branch":"","contribution":"one useful reaction","questionPolicy":"none","questionPurpose":"","previousMoveOutcome":"none","callbackMemoryKey":"","reopenBranch":false}}',
      temperature: 0,
      attempts: 3,
      maxOutputTokens: Math.min(provider.maxOutputTokens, 800),
      retryHint: `Return the complete memory and dialogue-plan JSON. Every userFact needs semanticSlot. Write key and value entirely in ${config.ui.locale}; translate job titles instead of leaving them in English. anchorQuote must be copied from the latest learner message. Explicit durable likes, dislikes, preferences, recurring constraints, and personal background require disposition=remember and one grounded fact for every explicit durable clause. Clauses to cover: ${JSON.stringify(explicitDurableClauses)}. Copy matching catalog semanticSlot and key exactly.`,
      normalize: (value) => {
        const normalized = normalizeMemoryAnalysis(value, latestUser, memoryKeys, frame)
        normalized.userFacts = normalized.userFacts.filter((fact) =>
          matchesExpectedConversationLanguage(fact.key, config.ui.locale) &&
          matchesExpectedConversationLanguage(fact.value, config.ui.locale))
        return normalized
      },
      usable: (value) => (value.disposition === 'remember' ? value.userFacts.length > 0 : value.userFacts.length === 0) &&
        // A scene is full of likes and always that belong to the part being played; only a direct
        // conversation is asked again for a preference the first answer passed over.
        (frame === 'scene' || memoryAnalysisCoversClauses(value.userFacts, explicitDurableClauses)) &&
        Boolean(value.dialoguePlan.anchorQuote && latestUser.includes(value.dialoguePlan.anchorQuote)),
    })
  } catch (error) {
    if (!(error instanceof ProviderRequestError) || !repairableOutputCodes.has(error.code)) throw error
    // Memory extraction is valuable but auxiliary. A malformed memory-analysis
    // response must not discard an otherwise answerable conversation turn.
  }
  if (!input.setup && memoryAnalysis.dialoguePlan.move === 'share') {
    memoryAnalysis.dialoguePlan.move = 'observe'
  }
  const recentMemoryIds = new Set(input.state.recentMoves.slice(-3).flatMap((move) => move.memoryIds))
  const callbackMemory = memoryCatalog.find((memory) => text(memory.key) === memoryAnalysis.dialoguePlan.callbackMemoryKey)
  const lastMentionedAt = callbackMemory ? Date.parse(text(callbackMemory.lastMentionedAt)) : Number.NaN
  const explicitlyReopenedByUser = callbackMemory && [text(callbackMemory.key), text(callbackMemory.value)]
    .filter(Boolean)
    .some((value) => latestUser.toLocaleLowerCase().includes(value.toLocaleLowerCase()))
  const callbackCoolingDown = Number.isFinite(lastMentionedAt) && Date.now() - lastMentionedAt < 24 * 60 * 60 * 1_000
  if (callbackMemory && (recentMemoryIds.has(text(callbackMemory.id)) || (callbackCoolingDown && !explicitlyReopenedByUser))) {
    memoryAnalysis.dialoguePlan.callbackMemoryKey = ''
    if (memoryAnalysis.dialoguePlan.move === 'callback') memoryAnalysis.dialoguePlan.move = 'observe'
  }
  const relevantMemoryKeys = [...new Set([
    ...memoryAnalysis.relevantMemoryKeys,
    memoryAnalysis.dialoguePlan.callbackMemoryKey,
  ].filter(Boolean))]
  const cooldownMemoryIds = input.state.recentMoves.length
    ? input.state.recentMoves.slice(-3).flatMap((move) => move.memoryIds)
    : input.state.recentMemoryIds.slice(-8)
  const analysisRelevantMemories = selectRelevantMemories(
    input.memories,
    latestUser,
    input.state.currentTopic,
    4,
    relevantMemoryKeys,
    memoryAnalysis.relevantTopics,
    memoryAnalysis.replyType,
    cooldownMemoryIds,
    [memoryAnalysis.dialoguePlan.anchorMeaning, memoryAnalysis.dialoguePlan.topic, memoryAnalysis.dialoguePlan.branch].join(' '),
  )
  const turnAnalysis = await generateStructured(client, [
    { role: 'system', content: turnAnalysisSystem(config, nonTargetDetected, analysisRelevantMemories, input.learningFocus || []) },
    ...analysisHistory,
  ], {
    name: 'turn_analysis',
    schema: turnAnalysisSchema,
    hint: '{"languageMatch":"target","lookup":{"action":"reply","parts":[{"text":"learner intent","needsLookup":false,"reason":"stable","subject":"exact subject"}],"query":"","locator":null},"reconstruction":null,"corrections":[]}',
    temperature: 0,
    attempts: 3,
    maxOutputTokens: provider.maxOutputTokens,
    retryHint: `Return the complete language-and-lookup analysis JSON. Classify languageMatch against ${config.learning.targetLanguage}, not against the interface language. Any non-target or mixed turn requires a complete target-language reconstruction object with type, original, improved, and explanation. Recheck guessable spelling or word-choice errors and every information need.`,
    normalize: (value) => normalizeTurnAnalysis(value, latestUser),
    usable: (value) => Boolean(
      turnAnalysisComplete(value) &&
      languageFeedbackConsistent(value, nonTargetDetected) &&
      interfaceOutputMatches(config, [
        value.reconstruction?.explanation,
        value.corrections.map((correction) => correction.explanation),
      ]),
    ),
    // A note worded in the wrong language, or a language call that differs from the script check,
    // is retried and then kept. Neither is worth losing the learner's turn over.
    acceptable: (value) => turnAnalysisComplete(value) && languageFeedbackConsistent(value),
  })
  const rescueRequired = turnAnalysis.languageMatch !== 'target'
  // The answer is read before the reply is written, so that trouble in this turn already eases the next line.
  let level: TurnLevel | undefined
  if (input.difficulty) {
    const nonTarget = turnAnalysis.languageMatch === 'non_target'
    const signal = {
      length: nonTarget ? 0 : textLength(latestUser, config.learning.targetLanguageCode),
      meaningErrors: turnAnalysis.corrections.filter((correction) => correction.severity === 'meaning' && countsAsError(correction)).length,
      naturalnessErrors: turnAnalysis.corrections.filter((correction) => correction.severity === 'naturalness' && countsAsError(correction)).length,
      nonTarget,
    }
    const help = input.difficulty.help
    const difficulty = tuneConversation(input.difficulty.state, {
      ...signal, answered: true, lookups: help?.lookups || 0, translated: help?.translated || false,
      simpler: help?.simpler || 0, slower: help?.slower || 0, hints: help?.hints || 0,
    }, config.learning.targetLanguageCode, help?.lowered || false)
    level = { step: replyStep(difficulty), difficulty, signal, rewritten: false }
    config.learning.difficultyStep = level.step
  }
  const lookupDecision = turnAnalysis.lookup
  const dialoguePolicy = deriveDialoguePolicy(memoryAnalysis.dialoguePlan, dynamics, lookupDecision, input.state)

  const coachReplyComplete = (value: { roleReply: string; lookup: TurnLookupDecision; reconstruction: unknown }) => Boolean(
    value.roleReply.trim() &&
    value.lookup.parts.length > 0 &&
    (value.lookup.action !== 'lookup' || value.lookup.query || value.lookup.locator) &&
    (!rescueRequired || value.reconstruction),
  )

  const conversationItems = (input.conversationMemories || []).slice(0, CONVERSATION_MEMORY_PROMPT_LIMIT)
    .map((memory) => ({ scope: 'this-conversation', key: memory.key, value: memory.value }))

  const run = async (tight: boolean) => {
    const retrievalContext = [memoryAnalysis.dialoguePlan.anchorMeaning, memoryAnalysis.dialoguePlan.topic, dialoguePolicy.allowedBranch].join(' ')
    const relevantEpisodes = selectRelevantEpisodes(input.episodes, latestUser, input.state.currentTopic, tight ? 2 : 4, retrievalContext)
    const relevantMemories = selectRelevantMemories(
      input.memories,
      latestUser,
      input.state.currentTopic,
      tight ? 2 : 4,
      relevantMemoryKeys,
      memoryAnalysis.relevantTopics,
      memoryAnalysis.replyType,
      cooldownMemoryIds,
      retrievalContext,
    )
    const authoritativeAnalysis = { ...turnAnalysis, ...memoryAnalysis, dialoguePolicy }
    // Something said here and also kept for good is listed once.
    const alreadyListed = new Set(relevantMemories.map((memory) => text(memory.value)))
    const promptMemories = [...relevantMemories, ...conversationItems.filter((item) => !alreadyListed.has(item.value))]
    const system = coachSystem(config, input.setup, promptMemories, input.state, relevantEpisodes, rescueRequired, dynamics, dialoguePolicy, lookupDecision, authoritativeAnalysis, input.reviewWords || [], input.material || null)
    const historyBudget = Math.max(900, providerInputBudget(provider, tight) - approximateTokens(system) - 180)
    const history = selectRecentHistory(input.messages, historyBudget, tight ? 6 : 10)
    const generated = await generateStructured(client, [
      { role: 'system', content: system },
      ...history,
    ], {
      name: 'coach_turn',
      schema: coachTurnSchema,
      hint: rescueRequired
        ? '{"roleReply":"natural reply","reconstruction":{"type":"completion","original":"","improved":"","explanation":""},"corrections":[],"lookup":{"action":"reply","parts":[{"text":"learner intent","needsLookup":false,"reason":"stable","subject":"exact subject"}],"query":"","locator":null},"statePatch":{"currentTopic":"","openedLoops":[],"resolvedLoops":[],"sceneFacts":[],"userFacts":[]}}'
        : '{"roleReply":"natural reply","reconstruction":null,"corrections":[],"lookup":{"action":"reply","parts":[{"text":"learner intent","needsLookup":false,"reason":"stable","subject":"exact subject"}],"query":"","locator":null},"statePatch":{"currentTopic":"","openedLoops":[],"resolvedLoops":[],"sceneFacts":[],"userFacts":[]}}',
      temperature: 0.55,
      attempts: 3,
      maxOutputTokens: provider.maxOutputTokens,
      retryHint: (rescueRequired
        ? 'Return every required field. reconstruction must be non-null, roleReply must directly answer the learner, and lookup.parts must contain every learner intent. Keep the response concise.'
        : 'Return every required field. lookup.parts must contain every learner intent with the semantic lookup decision. Keep roleReply concise and use empty arrays in statePatch when nothing changed.') +
        ` Write roleReply only in ${config.learning.targetLanguage}.`,
      normalize(value) {
        const normalized = normalizeCoachResponse(value)
        normalized.lookup = lookupDecision
        normalized.reconstruction = turnAnalysis.reconstruction
        normalized.corrections = turnAnalysis.corrections
        normalized.statePatch.userFacts = memoryAnalysis.userFacts
        return normalized
      },
      usable: (value) => coachReplyComplete(value) && targetOutputMatches(config, [value.roleReply]),
      // The language check is a guard against a reply in the wrong language, and it can be wrong
      // about an unusual sentence. After the retries a complete reply is shown rather than an error.
      acceptable: coachReplyComplete,
    })
    return { generated, relevantEpisodes, relevantMemories, history }
  }

  let tight = false
  let output
  try {
    output = await run(false)
  } catch (error) {
    if (!(error instanceof ProviderRequestError) || error.code !== 'PROVIDER_CONTEXT_LIMIT') throw error
    tight = true
    output = await run(true)
  }

  let finalGenerated = output.generated
  let lookupUsed = false
  let grounding: CoachingResponse['grounding']
  let preserveGroundedText = false
  if (output.generated.lookup.action === 'lookup') {
    const outcome = await runLookup({
      decision: output.generated.lookup,
      latestUserMessage: latestUser,
      ordinaryLookupEnabled: config.webLookup.enabled,
      providerId: provider.id,
      targetLanguage: config.learning.targetLanguage,
      timeoutMs: config.webLookup.timeoutMs,
      maxResults: config.webLookup.maxResults,
    })
    lookupUsed = outcome.kind !== 'disabled'
    if (outcome.presentation?.text && outcome.presentation.preserveText &&
      matchesExpectedConversationLanguage(outcome.presentation.text, config.learning.targetLanguageCode)) {
      preserveGroundedText = true
      finalGenerated = {
        ...output.generated,
        roleReply: outcome.presentation.text,
        statePatch: {
          ...output.generated.statePatch,
          // These fields depend on the actual wording of roleReply. The first
          // structured draft never sees the grounded answer, so keeping them
          // would store invented follow-ups or facts.
          openedLoops: [],
          sceneFacts: [],
        },
      }
      grounding = {
        provider: outcome.presentation.provider,
        citations: outcome.presentation.citations,
        ...(outcome.presentation.searchSuggestionsHtml
          ? { searchSuggestionsHtml: outcome.presentation.searchSuggestionsHtml }
          : {}),
      }
    } else {
      const finalLookupConstraint = outcome.kind === 'disabled'
        ? 'FINAL CONTENT CONSTRAINT: lookup was disabled and no lookup happened. Do not state or calculate the requested current value. Say naturally that you cannot check it right now, while keeping any stable conversational reaction.'
        : 'FINAL CONTENT CONSTRAINT: use only the supplied lookup outcome for changing facts. Keep it conversational and do not expose URLs, citations, source names, or research-report language.'
      finalGenerated = await generateStructured(client, [
        { role: 'system', content: lookupReplySystem(config, input.setup, outcome, output.generated, [...output.relevantMemories, ...conversationItems]) },
        { role: 'user', content: latestUser },
        { role: 'system', content: finalLookupConstraint },
      ], {
        name: 'lookup_coach_turn',
        schema: coachTurnSchema,
        hint: '{"roleReply":"natural reply","reconstruction":null,"corrections":[],"lookup":{"action":"reply","parts":[],"query":"","locator":null},"statePatch":{"currentTopic":"","openedLoops":[],"resolvedLoops":[],"sceneFacts":[],"userFacts":[]}}',
        temperature: 0.45,
        attempts: 2,
        maxOutputTokens: provider.maxOutputTokens,
        normalize: normalizeCoachResponse,
        retryHint: `Write roleReply only in ${config.learning.targetLanguage}. Return every required JSON field without citations.`,
        usable: (value) => Boolean(value.roleReply.trim() &&
          targetOutputMatches(config, [value.roleReply]) &&
          (!rescueRequired || value.reconstruction)),
        acceptable: (value) => Boolean(value.roleReply.trim() && (!rescueRequired || value.reconstruction)),
      })
      finalGenerated.lookup = output.generated.lookup
    }
  }

  const issues = naturalReplyIssues(finalGenerated.roleReply, input.messages, lookupUsed, dialoguePolicy)
  // A reply built on looked-up material carries names and figures that a rewrite could lose, so it is not checked for difficulty.
  const learnerWords = level && !lookupUsed
    ? wordKeys(input.messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n'), config.learning.targetLanguageCode)
    : undefined
  const overLevel = (reply: string) => level && !lookupUsed
    ? checkReplyDifficulty(reply, config.learning.targetLanguageCode, requestDifficulty(config), learnerWords).issues
    : []
  const levelIssues = overLevel(finalGenerated.roleReply)
  issues.push(...levelIssues.map(difficultyIssueText))
  if (level && levelIssues.length) level.rewritten = true
  if (preserveGroundedText && issues.length) preserveGroundedText = false
  if (issues.length && !preserveGroundedText) {
    try {
      finalGenerated = await generateStructured(client, [
        { role: 'system', content: repairReplySystem(config, issues, finalGenerated) },
        { role: 'user', content: latestUser },
      ], {
        name: 'repair_coach_turn',
        schema: coachTurnSchema,
        hint: '{"roleReply":"natural reply","reconstruction":null,"corrections":[],"lookup":{"action":"reply","parts":[],"query":"","locator":null},"statePatch":{"currentTopic":"","openedLoops":[],"resolvedLoops":[],"sceneFacts":[],"userFacts":[]}}',
        temperature: 0.25,
        attempts: 2,
        maxOutputTokens: provider.maxOutputTokens,
        normalize: normalizeCoachResponse,
        retryHint: `Write roleReply only in ${config.learning.targetLanguage}. Preserve the metadata and return the complete JSON object.`,
        usable: (value) => Boolean(value.roleReply.trim() &&
          targetOutputMatches(config, [value.roleReply]) &&
          naturalReplyIssues(value.roleReply, input.messages, lookupUsed, dialoguePolicy).length === 0 &&
          // A rewrite that is still a little over is kept as long as it is no worse than the draft.
          overLevel(value.roleReply).length <= levelIssues.length &&
          (!rescueRequired || value.reconstruction)),
      })
    } catch {
      // Repair is a best-effort polish. A provider formatting failure here must
      // not discard an already valid conversational turn and its coaching data.
    }
  }

  // Rewrites and provider-native lookup presentations are allowed to change
  // the spoken reply, never the independently verified coaching metadata.
  finalGenerated.reconstruction = turnAnalysis.reconstruction
  finalGenerated.corrections = turnAnalysis.corrections
  finalGenerated.statePatch.userFacts = memoryAnalysis.userFacts
  if (!hasQuestion(finalGenerated.roleReply)) finalGenerated.statePatch.openedLoops = []
  // Written with the first draft; a rewrite of the reply does not change what the learner asked.
  const aside = rescueRequired && output.generated.aside !== finalGenerated.roleReply ? output.generated.aside : ''

  return {
    coaching: {
      interfaceLocale: config.ui.locale,
      roleReply: finalGenerated.roleReply,
      ...(aside ? { aside } : {}),
      reconstruction: finalGenerated.reconstruction,
      corrections: finalGenerated.corrections,
      lookup: finalGenerated.lookup,
      ...(grounding ? { grounding } : {}),
      statePatch: finalGenerated.statePatch,
      memoryCandidates: [],
    },
    ...(level ? { level } : {}),
    context: {
      tight,
      recentMessages: output.history.length,
      episodes: output.relevantEpisodes.length,
      memories: output.relevantMemories.length,
      memoryIds: output.relevantMemories.map((memory) => text(memory.id)).filter(Boolean),
      usedMemories: output.relevantMemories.map((memory) => ({ id: text(memory.id), value: text(memory.value), memoryType: text(memory.memoryType || memory.memory_type) })).filter((memory) => memory.id && memory.value),
      dialoguePlan: memoryAnalysis.dialoguePlan,
      dialoguePolicy,
    },
  }
}

export async function summarizeEpisode(messages: StoredConversationMessage[], interfaceLocale?: string) {
  const config = await getRequestConfig(interfaceLocale)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  const suppliedMessages = new Map(messages.map((message) => [message.id, message]))
  return generateStructured(client, [
    { role: 'system', content: episodeSummarySystem(config) },
    { role: 'user', content: messages.map((message) => `[${message.id}] ${message.role === 'user' ? 'User' : 'Partner'}: ${message.content}`).join('\n') },
  ], {
    name: 'conversation_episode',
    schema: episodeSummarySchema,
    hint: '{"thread":"","summary":"","facts":[],"openLoops":[],"keywords":[],"topicArcs":[],"interactionSignals":[]}',
    temperature: 0.15,
    attempts: 1,
    maxOutputTokens: Math.min(provider.maxOutputTokens, 1_000),
    normalize(value) {
      const source = record(value)
      return {
        thread: text(source.thread),
        summary: text(source.summary),
        facts: (Array.isArray(source.facts) ? source.facts : []).map((item) => {
          const fact = record(item)
          const factSource = text(fact.source)
          return {
            value: text(fact.value),
            quote: text(fact.quote),
            source: (['user', 'partner', 'scene'].includes(factSource) ? factSource : 'partner') as 'user' | 'partner' | 'scene',
            sourceMessageId: text(fact.sourceMessageId),
          }
        }).filter((fact) => {
          const source = suppliedMessages.get(fact.sourceMessageId)
          if (!source || !fact.value || !fact.quote || !source.content.includes(fact.quote)) return false
          return (fact.source === 'user' && source.role === 'user') || (fact.source === 'partner' && source.role === 'assistant')
        }),
        openLoops: strings(source.openLoops).slice(0, 8),
        keywords: strings(source.keywords).slice(0, 12),
        topicArcs: (Array.isArray(source.topicArcs) ? source.topicArcs : []).map((item) => {
          const arc = record(item)
          const status = text(arc.status)
          return {
            topic: text(arc.topic).toLocaleLowerCase().slice(0, 60),
            status: (['active', 'dormant', 'closed'].includes(status) ? status : 'active') as 'active' | 'dormant' | 'closed',
            sourceMessageIds: strings(arc.sourceMessageIds).filter((id) => suppliedMessages.has(id)).slice(0, 8),
          }
        }).filter((arc) => /^[a-z0-9][a-z0-9 -]*$/u.test(arc.topic) && arc.sourceMessageIds.length).slice(0, 8),
        interactionSignals: (Array.isArray(source.interactionSignals) ? source.interactionSignals : []).map((item) => {
          const signal = record(item)
          const kind = text(signal.kind)
          return {
            kind: (['engaged', 'topic_switch', 'topic_rejected', 'assistant_corrected', 'style_preference'].includes(kind) ? kind : 'engaged') as 'engaged' | 'topic_switch' | 'topic_rejected' | 'assistant_corrected' | 'style_preference',
            value: text(signal.value),
            sourceMessageId: text(signal.sourceMessageId),
            quote: text(signal.quote),
          }
        }).filter((signal) => {
          const source = suppliedMessages.get(signal.sourceMessageId)
          return Boolean(signal.value && signal.quote && source?.role === 'user' && source.content.includes(signal.quote))
        }).slice(0, 8),
      }
    },
    retryHint: `Write thread, summary, openLoops, keywords, topicArcs, and interactionSignals only in ${config.ui.locale}. Return the complete compact JSON object.`,
    usable: (value) => Boolean(value.thread && value.summary && interfaceAggregateMatches(config, [
      value.thread, value.summary, value.openLoops, value.keywords,
      value.interactionSignals.map((signal) => signal.value),
    ])),
  })
}

export async function lookupTerm(input: { term: string; sentence: string; previous?: string; setup?: unknown; interfaceLocale?: string; learning?: LearningLanguage }) {
  const config = await getRequestConfig(input.interfaceLocale, input.learning)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  return generateStructured(client, [
    { role: 'system', content: lookupSystem(config) },
    { role: 'user', content: 'Term: ' + input.term + '\nSentence: ' + input.sentence + '\nAdjacent turn: ' + (input.previous || '') + '\nConversation setup: ' + JSON.stringify(input.setup || {}) },
  ], {
    name: 'term_lookup',
    schema: termLookupSchema,
    hint: '{"term":"","lemma":"","partOfSpeech":"","pronunciation":"","contextMeaning":"","forms":[],"senses":[{"meaning":"","example":"","translation":""}],"collocations":[{"phrase":"","meaning":""}],"register":"","regionalNotes":""}',
    temperature: 0.2,
    attempts: 2,
    maxOutputTokens: provider.maxOutputTokens,
    normalize(value) {
      const source = record(value)
      const rawSenses = Array.isArray(source.senses) ? source.senses : []
      const rawForms = Array.isArray(source.forms) ? source.forms : []
      return {
        term: text(source.term, input.term),
        lemma: text(source.lemma, input.term),
        partOfSpeech: text(source.partOfSpeech),
        pronunciation: text(source.pronunciation),
        contextMeaning: text(source.contextMeaning || source.meaning),
        forms: rawForms.map((item) => ({ label: text(record(item).label), value: text(record(item).value) })).filter((item) => item.value),
        senses: rawSenses.map((item) => ({ meaning: text(record(item).meaning), example: text(record(item).example), translation: text(record(item).translation) })).filter((item) => item.meaning || item.example),
        collocations: (Array.isArray(source.collocations) ? source.collocations : []).map((item) => {
          if (typeof item === 'string') return { phrase: text(item), meaning: '' }
          const collocation = record(item)
          return {
            phrase: text(collocation.phrase || collocation.collocation || collocation.text),
            meaning: text(collocation.meaning || collocation.definition || collocation.translation),
          }
        }).filter((item) => item.phrase),
        register: text(source.register),
        regionalNotes: text(source.regionalNotes),
      }
    },
    retryHint: `Write every explanation, definition, collocation meaning, label, note, and example translation only in ${config.ui.locale}. Examples, collocation phrases, and the studied expression remain in ${config.learning.targetLanguage}. Every collocation must include both phrase and meaning.`,
    usable: (value) => Boolean(value.contextMeaning && interfaceOutputMatches(config, [
      value.partOfSpeech,
      value.contextMeaning,
      value.forms.map((form) => form.label),
      value.senses.flatMap((sense) => [sense.meaning, sense.translation]),
      value.collocations.map((collocation) => collocation.meaning),
      value.register,
      value.regionalNotes,
    ]) && value.collocations.every((collocation) => collocation.phrase && collocation.meaning) &&
      targetOutputMatches(config, value.collocations.map((collocation) => collocation.phrase))),
    acceptable: (value) => Boolean(value.contextMeaning && value.collocations.every((collocation) => collocation.phrase && collocation.meaning)),
  })
}

/** `source` is the language of the passage: a conversation's recorded language, or the bare code a saved word carries. */
export async function translateMessage(content: string, setup: ConversationSetup | null, interfaceLocale?: string, source?: string | LearningLanguage) {
  const config = await getRequestConfig(interfaceLocale, typeof source === 'string' ? undefined : source)
  const sourceLanguageCode = typeof source === 'string' ? source : ''
  if (normalizeUiLocale(config.ui.locale).split('-')[0] === (sourceLanguageCode || config.learning.targetLanguageCode)) return content.trim()
  const client = await getModelClient()
  const provider = selectedProvider(config)
  const result = await generateStructured(client, [
    { role: 'system', content: translationSystem(config) },
    { role: 'user', content: 'Conversation setup: ' + JSON.stringify(setup || {}) + '\nMessage: ' + content },
  ], {
    name: 'message_translation',
    schema: translationSchema,
    hint: '{"translation":""}',
    temperature: 0.1,
    attempts: 2,
    maxOutputTokens: provider.maxOutputTokens,
    normalize(value) { return { translation: text(record(value).translation || record(value).text) } },
    retryHint: `Return the translation only in ${config.ui.locale}. Do not use the learner's target language unless it is the same language.`,
    usable: (value) => Boolean(value.translation && (
      matchesExpectedLanguage(value.translation, config.ui.locale) ||
      (value.translation === content.trim() && languageNeutral(value.translation))
    )),
    // An echo of the original is not a translation; anything else is shown rather than an error.
    acceptable: (value) => Boolean(value.translation && value.translation !== content.trim()),
  })
  return result.translation
}

export async function localizeInterfaceValues(items: Array<{ id: string; value: string }>, interfaceLocale?: string) {
  if (!items.length) return []
  const config = await getRequestConfig(interfaceLocale)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  const localized: Array<{ id: string; value: string }> = []
  for (let offset = 0; offset < items.length; offset += 20) {
    const batch = items.slice(offset, offset + 20)
    const expectedIds = new Set(batch.map((item) => item.id))
    const result = await generateStructured(client, [
      { role: 'system', content: interfaceValuesLocalizationSystem(config) },
      { role: 'user', content: JSON.stringify({ items: batch }) },
    ], {
      name: 'memory_localization',
      schema: memoryLocalizationSchema,
      hint: '{"items":[{"id":"same-id","value":"localized value"}]}',
      temperature: 0.1,
      attempts: 2,
      maxOutputTokens: provider.maxOutputTokens,
      retryHint: `Return every supplied ID exactly once. Write every value only in ${config.ui.locale}.`,
      normalize(value) {
        const source = record(value)
        return {
          items: (Array.isArray(source.items) ? source.items : []).map((item) => ({
            id: text(record(item).id),
            value: text(record(item).value),
          })).filter((item) => expectedIds.has(item.id) && item.value),
        }
      },
      usable: (value) => value.items.length === expectedIds.size &&
        new Set(value.items.map((item) => item.id)).size === expectedIds.size &&
        value.items.every((item) => {
          const original = batch.find((source) => source.id === item.id)?.value || ''
          return matchesExpectedConversationLanguage(item.value, config.ui.locale) ||
            (item.value === original && (languageNeutral(item.value) || interfaceNeutral(item.value)))
        }),
      acceptable: (value) => value.items.length === expectedIds.size &&
        new Set(value.items.map((item) => item.id)).size === expectedIds.size,
    })
    localized.push(...result.items)
  }
  return localized
}

export const localizeMemoryValues = localizeInterfaceValues

export interface MemoryConsolidationInput {
  /** A short description of the scene, or empty for a direct conversation. */
  scene: string
  conversationMemories: Array<{ id: string; value: string; quote: string; about: string; durability: string }>
  saidElsewhere: Array<{ conversation: string; value: string; about: string }>
  memories: Array<{ id: string; layer: string; value: string; validTo: string }>
  interfaceLocale?: string
}

/**
 * One extra model call after a conversation, made only when the learner has switched it on.
 * Everything it returns is a proposal; ids that do not match what was supplied are dropped.
 */
export async function consolidateMemories(input: MemoryConsolidationInput) {
  const config = await getRequestConfig(input.interfaceLocale)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  const saidIds = new Set(input.conversationMemories.map((memory) => memory.id))
  const memoryIds = new Set(input.memories.map((memory) => memory.id))
  return generateStructured(client, [
    { role: 'system', content: memoryConsolidationSystem(config, { ...input, today: new Date().toISOString().slice(0, 10) }) },
    { role: 'user', content: 'Propose what, if anything, the learner should decide.' },
  ], {
    name: 'memory_consolidation',
    schema: memoryConsolidationSchema,
    hint: '{"promotions":[{"conversationMemoryId":"","value":"","memoryType":"preference","durability":"lasting","validDays":0,"note":""}],"conflicts":[{"memoryId":"","conversationMemoryId":"","value":"","note":""}],"stale":[{"memoryId":"","note":""}]}',
    temperature: 0,
    attempts: 2,
    maxOutputTokens: Math.min(provider.maxOutputTokens, 900),
    normalize(value) {
      const source = record(value)
      const list = (items: unknown) => (Array.isArray(items) ? items : []).map((item) => record(item))
      return {
        promotions: list(source.promotions).map((item) => {
          const memoryType = text(item.memoryType)
          const validDays = Number(item.validDays)
          return {
            conversationMemoryId: text(item.conversationMemoryId),
            value: text(item.value),
            memoryType: (isMemoryKind(memoryType) ? memoryType : 'preference') as MemoryKind,
            durability: (text(item.durability) === 'temporary' ? 'temporary' : 'lasting') as 'lasting' | 'temporary',
            validDays: Number.isFinite(validDays) && validDays > 0 ? Math.min(730, Math.round(validDays)) : 0,
            note: text(item.note),
          }
        }).filter((item) => saidIds.has(item.conversationMemoryId) && item.value).slice(0, 3),
        conflicts: list(source.conflicts).map((item) => ({
          memoryId: text(item.memoryId),
          conversationMemoryId: text(item.conversationMemoryId),
          value: text(item.value),
          note: text(item.note),
        })).filter((item) => memoryIds.has(item.memoryId) && saidIds.has(item.conversationMemoryId) && item.value).slice(0, 3),
        stale: list(source.stale).map((item) => ({
          memoryId: text(item.memoryId),
          note: text(item.note),
        })).filter((item) => memoryIds.has(item.memoryId)).slice(0, 3),
      }
    },
    usable: () => true,
  })
}
