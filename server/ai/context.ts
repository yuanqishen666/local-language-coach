import type { ModelMessage } from './provider.js'
import type {
  ConversationEpisode,
  ConversationSetup,
  ConversationState,
  ConversationStatePatch,
  ProviderConfig,
} from '../types.js'

export interface StoredConversationMessage {
  id: string
  role: string
  content: string
  createdAt?: string
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringList(value: unknown, limit: number) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean).slice(0, limit) : []
}

export function normalizeConversationSetup(value: unknown): ConversationSetup | null {
  const source = record(value)
  if (!Object.keys(source).length) return null
  const title = text(source.title)
  const openingLine = text(source.openingLine)
  if (!title && !openingLine) return null
  return {
    title: title || 'Conversation',
    category: text(source.category, 'custom'),
    setting: text(source.setting),
    partnerName: text(source.partnerName),
    partnerRole: text(source.partnerRole, 'Conversation partner'),
    relationship: text(source.relationship, 'new acquaintance'),
    tone: text(source.tone, 'warm and natural'),
    personalityCues: stringList(source.personalityCues, 3),
    interests: stringList(source.interests, 3),
    currentMood: text(source.currentMood, 'open and attentive'),
    topicSeed: text(source.topicSeed),
    openingLine,
    difficulty: text(source.difficulty),
  }
}

export function analyzeRecentDialogue(messages: StoredConversationMessage[]) {
  const assistant = messages.filter((message) => message.role === 'assistant').slice(-4)
  const questionOnly = (value: string) => {
    const parts = value.split(/(?<=[.!?。！？])|\n+/u).map((part) => part.trim()).filter(Boolean)
    return Boolean(parts.length && parts.every((part) => /[?？]\s*$/u.test(part)))
  }
  const opener = (value: string) => value.trim().replace(/^[-—–"“'‘\s]+/u, '').slice(0, 24).toLocaleLowerCase()
  const recentOpeners = assistant.map((message) => opener(message.content)).filter(Boolean)
  const consecutiveQuestionTurns = [...assistant].reverse().findIndex((message) => !questionOnly(message.content))
  const streak = consecutiveQuestionTurns === -1 ? assistant.length : consecutiveQuestionTurns
  const agreementPattern = /^(yes|yeah|right|exactly|totally|确实|是的|对[，,。!！]|没错|そうですね|맞아요|sí|claro|oui|genau|certo|sim)\b/iu
  return {
    consecutiveQuestionTurns: streak,
    recentOpeners,
    recentOnlyAgreement: Boolean(assistant.length >= 2 && assistant.slice(-2).every((message) => agreementPattern.test(message.content.trim()))),
  }
}

export function emptyConversationState(setup: ConversationSetup | null = null): ConversationState {
  return {
    currentTopic: setup?.topicSeed || '',
    topicHistory: [],
    openLoops: [],
    sceneFacts: [],
    lastCompactedMessageId: '',
  }
}

export function normalizeConversationState(value: unknown, setup: ConversationSetup | null = null): ConversationState {
  const source = record(value)
  const openLoops = Array.isArray(source.openLoops) ? source.openLoops : []
  const sceneFacts = Array.isArray(source.sceneFacts) ? source.sceneFacts : []
  return {
    currentTopic: text(source.currentTopic, setup?.topicSeed || ''),
    topicHistory: Array.isArray(source.topicHistory) ? source.topicHistory.map((item) => text(item)).filter(Boolean).slice(-8) : [],
    openLoops: openLoops.map((item) => {
      const loop = record(item)
      return {
        id: text(loop.id),
        text: text(loop.text),
        sourceMessageId: text(loop.sourceMessageId),
        createdAt: text(loop.createdAt),
      }
    }).filter((item) => item.id && item.text).slice(-8),
    sceneFacts: sceneFacts.map((item) => {
      const fact = record(item)
      return {
        id: text(fact.id),
        value: text(fact.value),
        source: fact.source === 'scene' ? 'scene' as const : 'partner' as const,
        sourceMessageId: text(fact.sourceMessageId),
        createdAt: text(fact.createdAt),
      }
    }).filter((item) => item.id && item.value).slice(-20),
    lastCompactedMessageId: text(source.lastCompactedMessageId),
  }
}

export function approximateTokens(value: string) {
  const cjk = (value.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/gu) || []).length
  const rest = Math.max(0, value.length - cjk)
  return Math.max(1, cjk + Math.ceil(rest / 3.5))
}

export function providerInputBudget(provider: ProviderConfig, tight = false) {
  const ratio = tight ? 0.42 : 0.65
  return Math.max(2_500, Math.floor(provider.contextWindowTokens * ratio) - provider.maxOutputTokens)
}

function searchTerms(value: string) {
  const normalized = value.toLocaleLowerCase()
  const terms = normalized.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || []
  const cjk = [...normalized.matchAll(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]{2,}/gu)]
    .flatMap((match) => [...match[0]].map((char, index, chars) => chars.slice(index, index + 2).join('')).filter((item) => item.length === 2))
  return [...new Set([...terms, ...cjk].filter((item) => item.length > 1))].slice(0, 40)
}

function overlapScore(query: Set<string>, value: string) {
  const terms = searchTerms(value)
  return terms.reduce((score, term) => score + (query.has(term) ? 1 : 0), 0)
}

export function selectRelevantEpisodes(
  episodes: ConversationEpisode[],
  latestUserMessage: string,
  currentTopic: string,
  limit = 4,
) {
  if (!episodes.length) return []
  const query = new Set(searchTerms(latestUserMessage + ' ' + currentTopic))
  const ranked = episodes.map((episode, index) => {
    const body = [episode.thread, episode.summary, episode.keywords.join(' '), episode.facts.map((fact) => fact.value).join(' ')].join(' ')
    const match = overlapScore(query, body)
    const topicMatch = currentTopic && episode.thread.toLocaleLowerCase().includes(currentTopic.toLocaleLowerCase()) ? 2 : 0
    const recency = index >= episodes.length - 2 ? 0.75 : 0
    return { episode, score: match * 4 + topicMatch + recency }
  }).sort((a, b) => b.score - a.score)
  const matched = ranked.filter((item) => item.score > 0).slice(0, limit).map((item) => item.episode)
  return matched.length ? matched : [episodes.at(-1)!]
}

export function selectRelevantMemories(
  memories: Array<Record<string, unknown>>,
  latestUserMessage: string,
  currentTopic: string,
  limit = 4,
) {
  const query = new Set(searchTerms(latestUserMessage + ' ' + currentTopic))
  return memories.map((memory, index) => {
    const category = text(memory.category)
    const body = text(memory.key) + ' ' + text(memory.value)
    const relevance = overlapScore(query, body) * 4
    const learningBoost = category === 'learning' ? 1 : 0
    const recency = Math.max(0, 1 - index * 0.08)
    return { memory, score: relevance + learningBoost + recency }
  }).sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.memory)
}

export function selectRecentHistory(
  messages: StoredConversationMessage[],
  budgetTokens: number,
  minimumMessages = 8,
): ModelMessage[] {
  const selected: StoredConversationMessage[] = []
  let used = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const cost = approximateTokens(message.content) + 6
    if (selected.length >= minimumMessages && used + cost > budgetTokens) break
    selected.push(message)
    used += cost
  }
  return selected.reverse().map((message): ModelMessage => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content.trim(),
  })).filter((message) => Boolean(message.content))
}

export function mergeConversationState(input: {
  previous: ConversationState
  patch: ConversationStatePatch
  userMessage: StoredConversationMessage
  assistantMessageId: string
  assistantCreatedAt: string
}) {
  const { previous, patch, userMessage, assistantMessageId, assistantCreatedAt } = input
  const topic = text(patch.currentTopic, previous.currentTopic)
  const topicHistory = topic && topic !== previous.currentTopic
    ? [...previous.topicHistory, previous.currentTopic].filter(Boolean).slice(-8)
    : previous.topicHistory
  const resolved = new Set((patch.resolvedLoops || []).map((item) => text(item)))
  const openLoops = previous.openLoops.filter((loop) => !resolved.has(loop.id))
  for (const [index, loopText] of (patch.openedLoops || []).map((item) => text(item)).filter(Boolean).slice(0, 2).entries()) {
    if (openLoops.some((loop) => loop.text.toLocaleLowerCase() === loopText.toLocaleLowerCase())) continue
    openLoops.push({
      id: `loop:${assistantMessageId}:${index + 1}`,
      text: loopText,
      sourceMessageId: assistantMessageId,
      createdAt: assistantCreatedAt,
    })
  }
  const sceneFacts = [...previous.sceneFacts]
  for (const [index, value] of (patch.sceneFacts || []).map((item) => text(item)).filter(Boolean).slice(0, 4).entries()) {
    if (sceneFacts.some((fact) => fact.value.toLocaleLowerCase() === value.toLocaleLowerCase())) continue
    sceneFacts.push({
      id: `fact:${assistantMessageId}:${index + 1}`,
      value,
      source: 'partner',
      sourceMessageId: assistantMessageId,
      createdAt: assistantCreatedAt,
    })
  }
  const userFacts = (patch.userFacts || []).filter((fact) => {
    const quote = text(fact.quote)
    return Boolean(text(fact.key) && text(fact.value) && quote && userMessage.content.includes(quote))
  }).slice(0, 3)
  return {
    state: {
      ...previous,
      currentTopic: topic,
      topicHistory,
      openLoops: openLoops.slice(-8),
      sceneFacts: sceneFacts.slice(-20),
    } satisfies ConversationState,
    userFacts,
  }
}

export function extractiveEpisodeFallback(messages: StoredConversationMessage[]) {
  const threadSource = messages.find((message) => message.role === 'user')?.content || messages[0]?.content || 'Conversation'
  return {
    thread: threadSource.slice(0, 80),
    summary: messages.map((message) => `${message.role === 'user' ? 'User' : 'Partner'}: ${message.content.slice(0, 180)}`).join('\n').slice(0, 1_600),
    facts: [] as Array<{ value: string; quote: string; source: 'user' | 'partner' | 'scene'; sourceMessageId: string }>,
    openLoops: [] as string[],
    keywords: searchTerms(messages.map((message) => message.content).join(' ')).slice(0, 12),
  }
}
