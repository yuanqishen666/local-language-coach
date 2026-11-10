import { z } from 'zod'
import { getConfig } from '../services/config.js'
import { getModelClient, ProviderRequestError } from './provider.js'
import type { ModelClient, ModelMessage } from './provider.js'
import { parseModelJson } from '../utils/json.js'
import { coachSystem, episodeSummarySystem, lookupDecisionSystem, lookupReplySystem, lookupSystem, repairReplySystem, setupCandidatesSystem, translationSystem } from './prompts.js'
import { coachTurnSchema, episodeSummarySchema, lookupDecisionSchema, responseJsonSchema, setupCandidatesSchema, termLookupSchema, translationSchema } from './schemas.js'
import type { CoachingResponse, ConversationEpisode, ConversationSetup, ConversationState, TurnLookupDecision } from '../types.js'
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

const repairableOutputCodes = new Set(['PROVIDER_EMPTY_RESPONSE', 'PROVIDER_INVALID_RESPONSE'])

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

function questionOnly(value: string) {
  const parts = value.split(/(?<=[.!?。！？])|\n+/u).map((part) => part.trim()).filter(Boolean)
  return Boolean(parts.length && parts.every((part) => /[?？]\s*$/u.test(part)))
}

export function naturalReplyIssues(reply: string, messages: StoredConversationMessage[], lookupUsed: boolean) {
  const issues: string[] = []
  const clean = reply.trim()
  if (!clean) return ['empty reply']
  if (questionOnly(clean)) issues.push('the reply is only questions and contains no substantive statement')
  const questionCount = (clean.match(/[?？]/gu) || []).length
  if (questionCount > 1) issues.push('the reply asks more than one question')
  if (/(根据(搜索|检索)结果|证据(表明|显示)|来源(表明|显示)|according to (the )?(search results|sources)|the evidence (shows|suggests)|as an ai)/iu.test(clean)) {
    issues.push('the reply uses report-like or AI-disclaimer language')
  }
  if (lookupUsed && /https?:\/\/|\[[^\]]+\]\([^)]+\)/u.test(clean)) issues.push('the conversational reply exposes URLs or citations')
  const previous = [...messages].reverse().find((message) => message.role === 'assistant')?.content.trim() || ''
  const opener = (value: string) => value.replace(/^[-—–"“'‘\s]+/u, '').slice(0, 18).toLocaleLowerCase()
  if (previous && opener(previous).length >= 8 && opener(previous) === opener(clean)) issues.push('the reply repeats the previous opening phrase')
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

export async function suggestSetups(input: { domain?: string; place?: string; detail?: string }): Promise<ConversationSetup[]> {
  const config = await getConfig()
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
    usable: (value) => value.setups.length > 0,
  })
  return result.setups
}

interface CoachTurnInput {
  setup: ConversationSetup | null
  messages: StoredConversationMessage[]
  memories: Array<Record<string, unknown>>
  episodes: ConversationEpisode[]
  state: ConversationState
}

export async function coachTurn(input: CoachTurnInput): Promise<{ coaching: CoachingResponse; context: { tight: boolean; recentMessages: number; episodes: number; memories: number } }> {
  const config = await getConfig()
  const client = await getModelClient()
  const provider = selectedProvider(config)
  const latestUser = [...input.messages].reverse().find((message) => message.role === 'user')?.content || ''
  const rescueRequired = requiresInterfaceLanguageRescue(latestUser, config.ui.locale, config.learning.targetLanguageCode)
  const lookupDecision = await generateStructured(client, [
    { role: 'system', content: lookupDecisionSystem(config) },
    { role: 'user', content: latestUser },
  ], {
    name: 'lookup_decision',
    schema: lookupDecisionSchema,
    hint: '{"action":"reply","parts":[{"text":"learner intent","needsLookup":false,"reason":"stable","subject":"exact subject"}],"query":"","locator":null}',
    temperature: 0,
    attempts: 2,
    maxOutputTokens: Math.min(provider.maxOutputTokens, 700),
    retryHint: 'Return only the complete lookup decision JSON. Include every intent in parts. Apply the current-date and mutable-external-state principle before choosing reply or lookup.',
    normalize: normalizeLookupDecision,
    usable: (value) => Boolean(
      value.parts.length > 0 &&
      value.parts.every((part) => part.subject && (part.reason !== 'unknown' || value.action === 'clarify')) &&
      (value.action !== 'lookup' || (value.parts.some((part) => part.needsLookup) && (value.query || value.locator))) &&
      (value.action !== 'reply' || value.parts.every((part) => !part.needsLookup)),
    ),
  })

  const run = async (tight: boolean) => {
    const relevantEpisodes = selectRelevantEpisodes(input.episodes, latestUser, input.state.currentTopic, tight ? 2 : 4)
    const relevantMemories = selectRelevantMemories(input.memories, latestUser, input.state.currentTopic, tight ? 2 : 4)
    const dynamics = analyzeRecentDialogue(input.messages)
    const system = coachSystem(config, input.setup, relevantMemories, input.state, relevantEpisodes, rescueRequired, dynamics, lookupDecision)
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
        return normalized
      },
      usable: (value) => Boolean(
        value.roleReply.trim() &&
        value.lookup.parts.length > 0 &&
        (value.lookup.action !== 'lookup' || value.lookup.query || value.lookup.locator) &&
        (!rescueRequired || value.reconstruction),
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
    if (outcome.presentation?.text && outcome.presentation.preserveText) {
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
        { role: 'system', content: lookupReplySystem(config, input.setup, outcome, output.generated) },
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
        usable: (value) => Boolean(value.roleReply.trim() && (!rescueRequired || value.reconstruction)),
      })
      finalGenerated.lookup = output.generated.lookup
    }
  }

  const issues = naturalReplyIssues(finalGenerated.roleReply, input.messages, lookupUsed)
  if (issues.length && !preserveGroundedText) {
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
      usable: (value) => Boolean(value.roleReply.trim() && naturalReplyIssues(value.roleReply, input.messages, lookupUsed).length === 0 && (!rescueRequired || value.reconstruction)),
    })
  }

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
    },
  }
}

export async function summarizeEpisode(messages: StoredConversationMessage[]) {
  const config = await getConfig()
  const client = await getModelClient()
  const provider = selectedProvider(config)
  const suppliedMessages = new Map(messages.map((message) => [message.id, message]))
  return generateStructured(client, [
    { role: 'system', content: episodeSummarySystem(config) },
    { role: 'user', content: messages.map((message) => `[${message.id}] ${message.role === 'user' ? 'User' : 'Partner'}: ${message.content}`).join('\n') },
  ], {
    name: 'conversation_episode',
    schema: episodeSummarySchema,
    hint: '{"thread":"","summary":"","facts":[],"openLoops":[],"keywords":[]}',
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
      }
    },
    usable: (value) => Boolean(value.thread && value.summary),
  })
}

export async function lookupTerm(input: { term: string; sentence: string; previous?: string; setup?: unknown }) {
  const config = await getConfig()
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
    usable: (value) => Boolean(value.contextMeaning),
  })
}

export async function translateMessage(content: string, setup: ConversationSetup | null) {
  const config = await getConfig()
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
    usable: (value) => Boolean(value.translation),
  })
  return result.translation
}
