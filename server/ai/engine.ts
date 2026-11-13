import { z } from 'zod'
import { getConfig } from '../services/config.js'
import { getModelClient, ProviderRequestError } from './provider.js'
import type { ModelClient, ModelMessage } from './provider.js'
import { parseModelJson } from '../utils/json.js'
import { coachSystem, episodeSummarySystem, interfaceValuesLocalizationSystem, lookupReplySystem, lookupSystem, memoryAnalysisSystem, repairReplySystem, setupCandidatesSystem, setupLocalizationSystem, translationSystem, turnAnalysisSystem } from './prompts.js'
import { coachTurnSchema, episodeSummarySchema, memoryAnalysisSchema, memoryLocalizationSchema, responseJsonSchema, setupCandidateSchema, setupCandidatesSchema, termLookupSchema, translationSchema, turnAnalysisSchema } from './schemas.js'
import type { CoachingResponse, ConversationEpisode, ConversationSetup, ConversationState, DialoguePlan, DialoguePolicy, TurnLookupDecision } from '../types.js'
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
import { matchesExpectedConversationLanguage, matchesExpectedLanguage } from './language.js'
import { deriveDialoguePolicy, dialoguePolicyIssues, hasQuestion, isQuestionOnly, openerSimilarity } from './dialogue-policy.js'

const repairableOutputCodes = new Set(['PROVIDER_EMPTY_RESPONSE', 'PROVIDER_INVALID_RESPONSE'])

async function getRequestConfig(interfaceLocale?: string) {
  const config = await getConfig()
  config.ui.locale = normalizeUiLocale(interfaceLocale, config.ui.locale)
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

function interfaceAggregateMatches(config: Awaited<ReturnType<typeof getConfig>>, values: unknown[]) {
  const strings = outputStrings(values)
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
  attempts?: 1 | 2
  retryHint?: string
  maxOutputTokens?: number
  normalize: (value: unknown) => z.input<T>
  usable: (value: z.output<T>) => boolean
}

async function generateStructured<T extends z.ZodType>(client: ModelClient, messages: ModelMessage[], task: StructuredTask<T>): Promise<z.output<T>> {
  const schema = responseJsonSchema(task.schema)
  const baseMessages = client.outputMode === 'json_schema'
    ? messages
    : appendSystem(messages, 'Return one JSON object only. Compact example: ' + task.hint)
  const attempts = task.attempts || 1
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const requestMessages = attempt === 0
        ? baseMessages
        : appendSystem(baseMessages, task.retryHint || 'The previous JSON was incomplete. Return a shorter object that satisfies every required field exactly once.')
      const outputMode = attempt > 0 && client.outputMode === 'json_object' ? 'prompt_json' : client.outputMode
      const output = await client.generate(requestMessages, {
        structured: { name: task.name, schema },
        outputMode,
        maxOutputTokens: task.maxOutputTokens,
        temperature: attempt === 0 ? task.temperature : 0,
        timeoutMs: 30_000,
        retries: 0,
      })
      const parsed = task.schema.safeParse(task.normalize(parseModelJson<unknown>(output)))
      if (parsed.success && task.usable(parsed.data)) return parsed.data
      lastError = new ProviderRequestError('模型返回的结构不完整。', 502, 'PROVIDER_INVALID_RESPONSE')
    } catch (error) {
      if (error instanceof ProviderRequestError && !repairableOutputCodes.has(error.code)) throw error
      lastError = error
    }
  }

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

export function normalizeCoachResponse(value: unknown) {
  const source = record(value)
  const reconstruction = record(source.reconstruction)
  const correctionItems = Array.isArray(source.corrections) ? source.corrections : []
  const statePatch = record(source.statePatch)
  const reconstructionType = text(reconstruction.type)
  return {
    roleReply: text(source.roleReply || source.reply),
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
  return {
    lookup: normalizeLookupDecision(source.lookup),
    reconstruction: source.reconstruction && text(reconstruction.improved)
      ? {
          type: (['completion', 'translation', 'correction', 'optional'].includes(reconstructionType) ? reconstructionType : 'correction') as 'completion' | 'translation' | 'correction' | 'optional',
          original: text(reconstruction.original),
          improved: text(reconstruction.improved),
          explanation: text(reconstruction.explanation),
        }
      : null,
    corrections: (Array.isArray(source.corrections) ? source.corrections : []).map((item) => {
      const correction = record(item)
      const severity = text(correction.severity)
      return {
        original: text(correction.original),
        improved: text(correction.improved),
        explanation: text(correction.explanation),
        severity: (['meaning', 'naturalness', 'minor'].includes(severity) ? severity : 'naturalness') as 'meaning' | 'naturalness' | 'minor',
      }
    }).filter((item) => item.original && latestUser.includes(item.original) && item.improved && item.improved !== item.original),
  }
}

export function normalizeMemoryAnalysis(value: unknown, latestUser: string, memoryKeys: string[]) {
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
  return {
    disposition: text(source.disposition) === 'remember' ? 'remember' as const : 'ignore' as const,
    userFacts: (Array.isArray(source.userFacts) ? source.userFacts : []).map((item) => {
      const fact = record(item)
      const memoryType = text(fact.memoryType)
      const sensitive = Boolean(fact.sensitive)
      return {
        key: text(fact.key),
        value: text(fact.value),
        quote: text(fact.quote),
        sensitive,
        memoryType: (['preference', 'constraint', 'profile', 'learning', 'episodic'].includes(memoryType) ? memoryType : 'profile') as 'preference' | 'constraint' | 'profile' | 'learning' | 'episodic',
        topic: text(fact.topic, 'general').toLocaleLowerCase().slice(0, 40),
        importance: Math.max(0, Math.min(1, Number(fact.importance) || 0.5)),
        suggestedTier: (text(fact.suggestedTier) === 'core' ? 'core' : 'long_term') as 'core' | 'long_term',
      }
    }).filter((item) => item.key && item.value && item.quote && latestUser.includes(item.quote)).slice(0, 3),
    replyType: (['casual', 'recommendation', 'planning', 'learning', 'factual', 'support', 'other'].includes(replyType) ? replyType : 'other') as 'casual' | 'recommendation' | 'planning' | 'learning' | 'factual' | 'support' | 'other',
    relevantTopics: strings(source.relevantTopics).map((topic) => topic.toLocaleLowerCase().slice(0, 40)).slice(0, 8),
    relevantMemoryKeys: strings(source.relevantMemoryKeys).filter((key) => allowedMemoryKeys.has(key)).slice(0, 8),
    dialoguePlan,
  }
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

export function requiresInterfaceLanguageRescue(input: string, interfaceLocale: string, targetCode: string) {
  const interfaceCode = normalizeUiLocale(interfaceLocale).split('-')[0]
  if (interfaceCode === targetCode) return false
  if (interfaceCode === 'zh') {
    if (targetCode === 'ja') return false
    return /[\u3400-\u9fff]/u.test(input)
  }
  if (interfaceCode === 'ja') return /[\u3040-\u30ff]/u.test(input)
  if (interfaceCode === 'ko') return /[\uac00-\ud7af]/u.test(input)
  if (interfaceCode === 'hi') return /[\u0900-\u097f]/u.test(input)
  if (interfaceCode === 'en' && ['zh', 'ja', 'ko', 'hi'].includes(targetCode)) return /[A-Za-z]{2,}/u.test(input)
  return false
}

function selectedProvider(config: Awaited<ReturnType<typeof getConfig>>) {
  const provider = config.providers.find((item) => item.id === config.llm.defaultProvider)
  if (!provider) throw Object.assign(new Error('Provider not found'), { statusCode: 409 })
  return provider
}

export async function suggestSetups(input: { domain?: string; place?: string; detail?: string; interfaceLocale?: string }): Promise<ConversationSetup[]> {
  const config = await getRequestConfig(input.interfaceLocale)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  const result = await generateStructured(client, [
    { role: 'system', content: setupCandidatesSystem(config) },
    { role: 'user', content: 'Create up to 3 open-ended conversation openings for: ' + JSON.stringify(input) },
  ], {
    name: 'conversation_setups',
    schema: setupCandidatesSchema,
    hint: '{"setups":[{"title":"","category":"","setting":"","partnerName":"","partnerRole":"","relationship":"","tone":"","topicSeed":"","openingLine":"","difficulty":""}]}',
    temperature: 0.7,
    attempts: 2,
    maxOutputTokens: provider.maxOutputTokens,
    normalize(value) {
      const source = record(value)
      const rawSetups = Array.isArray(source.setups) ? source.setups : []
      return {
        setups: rawSetups.slice(0, 3).map((item) => {
          const setup = record(item)
          return {
            title: text(setup.title),
            category: text(setup.category, input.domain || 'custom'),
            setting: text(setup.setting, input.place || ''),
            partnerName: text(setup.partnerName),
            partnerRole: text(setup.partnerRole, 'Conversation partner'),
            relationship: text(setup.relationship, 'new acquaintance'),
            tone: text(setup.tone, 'warm and natural'),
            personalityCues: strings(setup.personalityCues).slice(0, 3),
            interests: strings(setup.interests).slice(0, 3),
            currentMood: text(setup.currentMood, 'open and attentive'),
            topicSeed: text(setup.topicSeed, input.detail || ''),
            openingLine: text(setup.openingLine),
            difficulty: text(setup.difficulty, config.learning.proficiency),
          }
        }).filter((setup) => setup.title && setup.openingLine),
      }
    },
    retryHint: `Every title and setup-description field must be in ${config.ui.locale}; every openingLine must be in ${config.learning.targetLanguage}. Return a shorter complete object.`,
    usable: (value) => value.setups.length > 0 && value.setups.every((setup) =>
      interfaceAggregateMatches(config, [
        setup.title, setup.category, setup.setting, setup.partnerRole, setup.relationship,
        setup.tone, setup.personalityCues, setup.interests, setup.currentMood, setup.topicSeed,
      ]) && targetOutputMatches(config, [setup.openingLine])),
  })
  return result.setups
}

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
  })
}

interface CoachTurnInput {
  setup: ConversationSetup | null
  messages: StoredConversationMessage[]
  memories: Array<Record<string, unknown>>
  episodes: ConversationEpisode[]
  state: ConversationState
  interfaceLocale?: string
}

export async function coachTurn(input: CoachTurnInput): Promise<{ coaching: CoachingResponse; context: { tight: boolean; recentMessages: number; episodes: number; memories: number; memoryIds: string[]; dialoguePlan: DialoguePlan; dialoguePolicy: DialoguePolicy } }> {
  const config = await getRequestConfig(input.interfaceLocale)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  const latestUser = [...input.messages].reverse().find((message) => message.role === 'user')?.content || ''
  const rescueRequired = requiresInterfaceLanguageRescue(latestUser, config.ui.locale, config.learning.targetLanguageCode)
  const memoryCatalog = input.memories.slice(0, 100)
  const memoryKeys = memoryCatalog.map((memory) => text(memory.key)).filter(Boolean)
  const analysisHistory = selectRecentHistory(input.messages, 1_400, 4)
  const dynamics = analyzeRecentDialogue(input.messages)
  let memoryAnalysis = normalizeMemoryAnalysis({}, latestUser, memoryKeys)
  try {
    memoryAnalysis = await generateStructured(client, [
      { role: 'system', content: memoryAnalysisSystem(config, memoryCatalog, input.state, input.episodes) },
      ...analysisHistory,
    ], {
      name: 'memory_analysis',
      schema: memoryAnalysisSchema,
      hint: '{"disposition":"ignore","userFacts":[],"replyType":"casual","relevantTopics":[],"relevantMemoryKeys":[],"dialoguePlan":{"mode":"casual","anchorQuote":"latest words","anchorMeaning":"meaning","move":"react","topic":"general","branch":"","contribution":"one useful reaction","questionPolicy":"none","questionPurpose":"","previousMoveOutcome":"none","callbackMemoryKey":"","reopenBranch":false}}',
      temperature: 0,
      attempts: 2,
      maxOutputTokens: Math.min(provider.maxOutputTokens, 800),
      retryHint: 'Return the complete memory and dialogue-plan JSON. anchorQuote must be copied from the latest learner message. Explicit durable likes, dislikes, preferences, recurring constraints, and personal background require disposition=remember and at least one grounded fact. Copy matching catalog keys exactly.',
      normalize: (value) => normalizeMemoryAnalysis(value, latestUser, memoryKeys),
      usable: (value) => (value.disposition === 'remember' ? value.userFacts.length > 0 : value.userFacts.length === 0) &&
        value.userFacts.every((fact) => matchesExpectedLanguage(fact.value, config.ui.locale)) &&
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
    { role: 'system', content: turnAnalysisSystem(config, rescueRequired, analysisRelevantMemories) },
    ...analysisHistory,
  ], {
    name: 'turn_analysis',
    schema: turnAnalysisSchema,
    hint: '{"lookup":{"action":"reply","parts":[{"text":"learner intent","needsLookup":false,"reason":"stable","subject":"exact subject"}],"query":"","locator":null},"reconstruction":null,"corrections":[]}',
    temperature: 0,
    attempts: 2,
    maxOutputTokens: provider.maxOutputTokens,
    retryHint: 'Return the complete language-and-lookup analysis JSON. Recheck the latest learner message for guessable spelling or word-choice errors and every information need. Keep explanations concise.',
    normalize: (value) => normalizeTurnAnalysis(value, latestUser),
    usable: (value) => Boolean(
      value.lookup.parts.length > 0 &&
      value.lookup.parts.every((part) => part.subject && (part.reason !== 'unknown' || value.lookup.action === 'clarify')) &&
      (value.lookup.action !== 'lookup' || (value.lookup.parts.some((part) => part.needsLookup) && (value.lookup.query || value.lookup.locator))) &&
      (value.lookup.action !== 'reply' || value.lookup.parts.every((part) => !part.needsLookup)) &&
      (!rescueRequired || value.reconstruction) &&
      interfaceOutputMatches(config, [
        value.reconstruction?.explanation,
        value.corrections.map((correction) => correction.explanation),
      ]),
    ),
  })
  const lookupDecision = turnAnalysis.lookup
  const dialoguePolicy = deriveDialoguePolicy(memoryAnalysis.dialoguePlan, dynamics, lookupDecision, input.state)

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
    const system = coachSystem(config, input.setup, relevantMemories, input.state, relevantEpisodes, rescueRequired, dynamics, dialoguePolicy, lookupDecision, authoritativeAnalysis)
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
      attempts: 2,
      maxOutputTokens: provider.maxOutputTokens,
      retryHint: rescueRequired
        ? 'Return every required field. reconstruction must be non-null, roleReply must directly answer the learner, and lookup.parts must contain every learner intent. Keep the response concise.'
        : 'Return every required field. lookup.parts must contain every learner intent with the semantic lookup decision. Keep roleReply concise and use empty arrays in statePatch when nothing changed.',
      normalize(value) {
        const normalized = normalizeCoachResponse(value)
        normalized.lookup = lookupDecision
        normalized.reconstruction = turnAnalysis.reconstruction
        normalized.corrections = turnAnalysis.corrections
        normalized.statePatch.userFacts = memoryAnalysis.userFacts
        return normalized
      },
      usable: (value) => Boolean(
        value.roleReply.trim() &&
        value.lookup.parts.length > 0 &&
        (value.lookup.action !== 'lookup' || value.lookup.query || value.lookup.locator) &&
        (!rescueRequired || value.reconstruction) &&
        targetOutputMatches(config, [value.roleReply]),
      ),
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
        { role: 'system', content: lookupReplySystem(config, input.setup, outcome, output.generated, output.relevantMemories) },
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
      })
      finalGenerated.lookup = output.generated.lookup
    }
  }

  const issues = naturalReplyIssues(finalGenerated.roleReply, input.messages, lookupUsed, dialoguePolicy)
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

  return {
    coaching: {
      interfaceLocale: config.ui.locale,
      roleReply: finalGenerated.roleReply,
      reconstruction: finalGenerated.reconstruction,
      corrections: finalGenerated.corrections,
      lookup: finalGenerated.lookup,
      ...(grounding ? { grounding } : {}),
      statePatch: finalGenerated.statePatch,
      memoryCandidates: [],
    },
    context: {
      tight,
      recentMessages: output.history.length,
      episodes: output.relevantEpisodes.length,
      memories: output.relevantMemories.length,
      memoryIds: output.relevantMemories.map((memory) => text(memory.id)).filter(Boolean),
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

export async function lookupTerm(input: { term: string; sentence: string; previous?: string; setup?: unknown; interfaceLocale?: string }) {
  const config = await getRequestConfig(input.interfaceLocale)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  return generateStructured(client, [
    { role: 'system', content: lookupSystem(config) },
    { role: 'user', content: 'Term: ' + input.term + '\nSentence: ' + input.sentence + '\nAdjacent turn: ' + (input.previous || '') + '\nConversation setup: ' + JSON.stringify(input.setup || {}) },
  ], {
    name: 'term_lookup',
    schema: termLookupSchema,
    hint: '{"term":"","lemma":"","partOfSpeech":"","pronunciation":"","contextMeaning":"","forms":[],"senses":[{"meaning":"","example":"","translation":""}],"collocations":[],"register":"","regionalNotes":""}',
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
        collocations: strings(source.collocations),
        register: text(source.register),
        regionalNotes: text(source.regionalNotes),
      }
    },
    retryHint: `Write every explanation, definition, label, note, and example translation only in ${config.ui.locale}. Examples and the studied expression remain in ${config.learning.targetLanguage}.`,
    usable: (value) => Boolean(value.contextMeaning && interfaceOutputMatches(config, [
      value.partOfSpeech,
      value.contextMeaning,
      value.forms.map((form) => form.label),
      value.senses.flatMap((sense) => [sense.meaning, sense.translation]),
      value.register,
      value.regionalNotes,
    ])),
  })
}

export async function translateMessage(content: string, setup: ConversationSetup | null, interfaceLocale?: string) {
  const config = await getRequestConfig(interfaceLocale)
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
          return matchesExpectedLanguage(item.value, config.ui.locale) ||
            (item.value === original && languageNeutral(item.value))
        }),
    })
    localized.push(...result.items)
  }
  return localized
}

export const localizeMemoryValues = localizeInterfaceValues
