import type { ModelMessage } from './provider.js'
import type {
  ConversationEpisode,
  ConversationSetup,
  ConversationState,
  ConversationStatePatch,
  DialogueDynamics,
  DialoguePlan,
  DialoguePolicy,
  ProviderConfig,
  TopicMomentum,
} from '../types.js'
import { hasQuestion, isQuestionOnly, openerSimilarity } from './dialogue-policy.js'

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

export function analyzeRecentDialogue(messages: StoredConversationMessage[]): DialogueDynamics {
  const recent = messages.slice(-12)
  const assistant = recent.filter((message) => message.role === 'assistant').slice(-6)
  const opener = (value: string) => value.trim().replace(/^[-—–"“'‘\s]+/u, '').slice(0, 24).toLocaleLowerCase()
  const recentOpeners = assistant.map((message) => opener(message.content)).filter(Boolean)
  const questionTurns = assistant.filter((message) => hasQuestion(message.content)).length
  const questionOnlyTurns = assistant.filter((message) => isQuestionOnly(message.content)).length
  const consecutiveQuestionTurns = [...assistant].reverse().findIndex((message) => !hasQuestion(message.content))
  const streak = consecutiveQuestionTurns === -1 ? assistant.length : consecutiveQuestionTurns
  const userTurns = recent.map((message, index) => ({ message, previous: recent[index - 1] }))
    .filter((item) => item.message.role === 'user')
  const answerTurns = userTurns.filter((item) => item.previous?.role === 'assistant' && hasQuestion(item.previous.content)).length
  const agreementPattern = /^(yes|yeah|right|exactly|totally|确实|是的|对[，,。!！]|没错|そうですね|맞아요|sí|claro|oui|genau|certo|sim)\b/iu
  const repeatedOpener = recentOpeners.some((value, index) => recentOpeners
    .slice(index + 1)
    .some((other) => value.length >= 8 && other.length >= 8 && openerSimilarity(value, other) >= 0.72))
  return {
    assistantTurns: assistant.length,
    questionTurns,
    questionOnlyTurns,
    questionTurnRate: assistant.length ? questionTurns / assistant.length : 0,
    consecutiveQuestionTurns: streak,
    userAnswerBurden: userTurns.length ? answerTurns / userTurns.length : 0,
    recentOpeners,
    recentOnlyAgreement: Boolean(assistant.length >= 2 && assistant.slice(-2).every((message) => agreementPattern.test(message.content.trim()))),
    repeatedOpener,
  }
}

export function emptyConversationState(setup: ConversationSetup | null = null): ConversationState {
  return {
    currentTopic: setup?.topicSeed || '',
    topicHistory: [],
    openLoops: [],
    sceneFacts: [],
    lastCompactedMessageId: '',
    recentMoves: [],
    topicMomentum: [],
    recentMemoryIds: [],
  }
}

export function normalizeConversationState(value: unknown, setup: ConversationSetup | null = null): ConversationState {
  const source = record(value)
  const openLoops = Array.isArray(source.openLoops) ? source.openLoops : []
  const sceneFacts = Array.isArray(source.sceneFacts) ? source.sceneFacts : []
  const recentMoves = Array.isArray(source.recentMoves) ? source.recentMoves : []
  const topicMomentum = Array.isArray(source.topicMomentum) ? source.topicMomentum : []
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
    recentMoves: recentMoves.map((item) => {
      const move = record(item)
      const moveType = text(move.move)
      return {
        assistantMessageId: text(move.assistantMessageId),
        move: (['answer', 'react', 'observe', 'associate', 'callback', 'share', 'clarify'].includes(moveType) ? moveType : 'react') as ConversationState['recentMoves'][number]['move'],
        topic: text(move.topic),
        branch: text(move.branch),
        askedQuestion: Boolean(move.askedQuestion),
        memoryIds: stringList(move.memoryIds, 8),
        createdAt: text(move.createdAt),
      }
    }).filter((item) => item.assistantMessageId).slice(-8),
    topicMomentum: topicMomentum.map((item) => {
      const momentum = record(item)
      const status = text(momentum.status)
      return {
        topic: text(momentum.topic),
        branch: text(momentum.branch),
        score: Math.max(-3, Math.min(3, Number(momentum.score) || 0)),
        status: (['active', 'dormant', 'closed'].includes(status) ? status : 'dormant') as TopicMomentum['status'],
        continuedCount: Math.max(0, Number(momentum.continuedCount) || 0),
        switchedCount: Math.max(0, Number(momentum.switchedCount) || 0),
        lastTouchedAt: text(momentum.lastTouchedAt),
      }
    }).filter((item) => item.topic || item.branch).slice(-12),
    recentMemoryIds: stringList(source.recentMemoryIds, 16),
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
  retrievalContext = '',
) {
  if (!episodes.length) return []
  const query = new Set(searchTerms(latestUserMessage + ' ' + currentTopic + ' ' + retrievalContext))
  const ranked = episodes.map((episode, index) => {
    const body = [
      episode.thread,
      episode.summary,
      episode.keywords.join(' '),
      episode.facts.map((fact) => fact.value).join(' '),
      episode.topicArcs.map((arc) => arc.topic).join(' '),
      episode.interactionSignals.map((signal) => signal.value).join(' '),
    ].join(' ')
    const match = overlapScore(query, body)
    const topicMatch = currentTopic && episode.thread.toLocaleLowerCase().includes(currentTopic.toLocaleLowerCase()) ? 2 : 0
    const recency = index >= episodes.length - 2 ? 0.75 : 0
    const matched = match > 0 || topicMatch > 0
    return { episode, score: matched ? match * 4 + topicMatch + recency : 0 }
  }).sort((a, b) => b.score - a.score)
  const matched = ranked.filter((item) => item.score > 0).slice(0, limit).map((item) => item.episode)
  return matched
}

export function selectRelevantMemories(
  memories: Array<Record<string, unknown>>,
  latestUserMessage: string,
  currentTopic: string,
  limit = 4,
  semanticKeys: string[] = [],
  relevantTopics: string[] = [],
  replyType = 'other',
  recentMemoryIds: string[] = [],
  retrievalContext = '',
) {
  const query = new Set(searchTerms(latestUserMessage + ' ' + currentTopic + ' ' + retrievalContext))
  const selectedKeys = new Set(semanticKeys.map((key) => text(key)))
  const selectedTopics = new Set(relevantTopics.map((topic) => text(topic).toLocaleLowerCase()).filter(Boolean))
  const recentlyUsed = new Set(recentMemoryIds.map((id) => text(id)).filter(Boolean))
  const alwaysCore = memories.filter((memory) => text(memory.tier) === 'core')
    .sort((left, right) => {
      const pinned = Number(right.pinned || 0) - Number(left.pinned || 0)
      if (pinned) return pinned
      const importance = Number(right.importance || 0.5) - Number(left.importance || 0.5)
      if (importance) return importance
      return text(right.updatedAt).localeCompare(text(left.updatedAt))
    })
    .slice(0, 15)
  const coreIds = new Set(alwaysCore.map((memory) => text(memory.id) || `${text(memory.category)}:${text(memory.key)}`))
  const routed = memories.map((memory, index) => {
    const memoryIdentity = text(memory.id) || `${text(memory.category)}:${text(memory.key)}`
    if (coreIds.has(memoryIdentity)) return { memory, score: 0 }
    const category = text(memory.category)
    const key = text(memory.key)
    const memoryType = text(memory.memoryType || memory.memory_type)
    const topic = text(memory.topic).toLocaleLowerCase()
    const body = key + ' ' + text(memory.value) + ' ' + topic
    const relevance = overlapScore(query, body) * 4
    const semanticMatch = selectedKeys.has(key) ? 100 : 0
    const topicMatch = topic && selectedTopics.has(topic) ? 12 : 0
    const matched = relevance > 0 || semanticMatch > 0 || topicMatch > 0
    const learningBoost = matched && (replyType === 'learning' && (memoryType === 'learning' || category === 'learning')) ? 3 : 0
    const decisionBoost = matched && ['recommendation', 'planning'].includes(replyType) && ['preference', 'constraint'].includes(memoryType) ? 2 : 0
    const coreBoost = matched && text(memory.tier) === 'core' ? 4 : 0
    const importanceBoost = matched ? Math.max(0, Math.min(1, Number(memory.importance) || 0.5)) : 0
    const recency = matched ? Math.max(0, 1 - index * 0.08) : 0
    const cooldown = matched && recentlyUsed.has(text(memory.id)) && !semanticMatch && memoryType !== 'constraint' ? 6 : 0
    return { memory, score: semanticMatch + topicMatch + relevance + learningBoost + decisionBoost + coreBoost + importanceBoost + recency - cooldown }
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.memory)
  return [...alwaysCore, ...routed.filter((memory) => !coreIds.has(text(memory.id) || `${text(memory.category)}:${text(memory.key)}`))]
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
  dialogue?: {
    plan: DialoguePlan
    policy: DialoguePolicy
    roleReply: string
    memoryIds: string[]
  }
}) {
  const { previous, patch, userMessage, assistantMessageId, assistantCreatedAt, dialogue } = input
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

  const recentMoves = [...previous.recentMoves]
  const topicMomentum = previous.topicMomentum.map((item) => ({ ...item }))
  const previousMove = recentMoves.at(-1)
  if (dialogue && previousMove?.branch) {
    const existing = topicMomentum.find((item) => item.branch === previousMove.branch)
    if (existing) {
      const outcome = dialogue.plan.previousMoveOutcome
      if (outcome === 'continued') {
        existing.score = Math.min(3, existing.score + 1)
        existing.status = 'active'
        existing.continuedCount += 1
      } else if (outcome === 'switched') {
        existing.score = Math.max(-3, existing.score - 1)
        existing.status = 'dormant'
        existing.switchedCount += 1
      } else if (outcome === 'rejected' || outcome === 'corrected') {
        existing.score = Math.max(-3, existing.score - 2)
        existing.status = 'closed'
      }
      if (outcome !== 'none' && outcome !== 'unclear') existing.lastTouchedAt = assistantCreatedAt
    }
  }

  if (dialogue) {
    const activeBranch = dialogue.policy.allowedBranch
    if (activeBranch) {
      const existing = topicMomentum.find((item) => item.branch === activeBranch)
      if (existing) {
        existing.topic = dialogue.plan.topic || existing.topic
        existing.score = Math.max(1, existing.score)
        if (existing.status !== 'closed' || dialogue.plan.reopenBranch) existing.status = 'active'
        existing.lastTouchedAt = assistantCreatedAt
      } else {
        topicMomentum.push({
          topic: dialogue.plan.topic,
          branch: activeBranch,
          score: 1,
          status: 'active',
          continuedCount: 0,
          switchedCount: 0,
          lastTouchedAt: assistantCreatedAt,
        })
      }
    }
    recentMoves.push({
      assistantMessageId,
      move: dialogue.plan.move,
      topic: dialogue.plan.topic,
      branch: activeBranch,
      askedQuestion: hasQuestion(dialogue.roleReply),
      memoryIds: dialogue.memoryIds.slice(0, 8),
      createdAt: assistantCreatedAt,
    })
  }

  const recentMemoryIds = dialogue
    ? [...previous.recentMemoryIds, ...dialogue.memoryIds].filter(Boolean).slice(-16)
    : previous.recentMemoryIds
  return {
    state: {
      ...previous,
      currentTopic: topic,
      topicHistory,
      openLoops: openLoops.slice(-8),
      sceneFacts: sceneFacts.slice(-20),
      recentMoves: recentMoves.slice(-8),
      topicMomentum: topicMomentum
        .sort((left, right) => left.lastTouchedAt.localeCompare(right.lastTouchedAt))
        .slice(-12),
      recentMemoryIds,
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
    topicArcs: [] as ConversationEpisode['topicArcs'],
    interactionSignals: [] as ConversationEpisode['interactionSignals'],
  }
}
