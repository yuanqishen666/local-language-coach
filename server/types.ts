export type { UiLocale } from '../shared/locales.js'
import type { UiLocale } from '../shared/locales.js'

export type ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'kimi'
export type StructuredOutputMode = 'json_schema' | 'json_object' | 'prompt_json'

export interface ProviderCapability {
  outputMode: StructuredOutputMode
  conversationReady: true
  lookupReady: true
  baseUrl: string
  model: string
  contractVersion: number
  testedAt: string
}

export interface ProviderModelProfile {
  contextWindowTokens: number
  maxOutputTokens: number
}

export interface ProviderConfig {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  apiKeySecret: string
  enabled: boolean
  /** Conservative budget used by the local context compiler. */
  contextWindowTokens: number
  /** Output reservation for one conversational turn. */
  maxOutputTokens: number
  /** Per-model budgets retained when the user switches models. */
  modelProfiles?: Record<string, ProviderModelProfile>
  capability?: ProviderCapability
}

export interface AppConfig {
  setupComplete: boolean
  ui: { locale: UiLocale }
  learning: {
    targetLanguage: string
    targetLanguageCode: string
    proficiency: string
    correctionLevel: 'light' | 'balanced' | 'intensive'
  }
  llm: { defaultProvider: string; temperature: number }
  webLookup: {
    enabled: boolean
    provider: 'selected'
    timeoutMs: number
    maxResults: number
  }
  server: { host: string; port: number }
  providers: ProviderConfig[]
}

export interface CoachingResponse {
  interfaceLocale?: UiLocale
  reconstruction: {
    type: 'completion' | 'translation' | 'correction' | 'optional'
    original: string
    improved: string
    explanation: string
  } | null
  corrections: Array<{
    original: string
    improved: string
    explanation: string
    severity: 'meaning' | 'naturalness' | 'minor'
  }>
  roleReply: string
  roleReplyTranslation?: string
  roleReplyTranslations?: Record<string, string>
  lookup: TurnLookupDecision
  grounding?: {
    provider: ProviderKind
    citations: Array<{ url: string; title: string; startIndex?: number; endIndex?: number }>
    searchSuggestionsHtml?: string
  }
  statePatch: ConversationStatePatch
  memoryCandidates: Array<{
    category: 'personal' | 'learning' | 'scene'
    key: string
    value: string
    confidence: number
    sensitive: boolean
    action: 'create' | 'update'
    previousValue?: string
    tier: MemoryTier
    memoryType: MemoryType
    topic: string
    importance: number
    sourceMessageId: string
  }>
}

export type MemoryTier = 'core' | 'long_term'
export type MemoryType = 'preference' | 'constraint' | 'profile' | 'learning' | 'episodic'
export type MemoryReplyType = 'casual' | 'recommendation' | 'planning' | 'learning' | 'factual' | 'support' | 'other'

export type DialogueMode = 'casual' | 'story' | 'support' | 'task' | 'opinion' | 'learning'
export type DialogueMove = 'answer' | 'react' | 'observe' | 'associate' | 'callback' | 'share' | 'clarify'
export type PreviousMoveOutcome = 'continued' | 'switched' | 'rejected' | 'corrected' | 'unclear' | 'none'

export interface DialoguePlan {
  mode: DialogueMode
  anchorQuote: string
  anchorMeaning: string
  move: DialogueMove
  topic: string
  branch: string
  contribution: string
  questionPolicy: 'none' | 'optional' | 'required'
  questionPurpose: string
  previousMoveOutcome: PreviousMoveOutcome
  callbackMemoryKey: string
  reopenBranch: boolean
}

export interface DialogueDynamics {
  assistantTurns: number
  questionTurns: number
  questionOnlyTurns: number
  questionTurnRate: number
  consecutiveQuestionTurns: number
  userAnswerBurden: number
  recentOpeners: string[]
  recentOnlyAgreement: boolean
  repeatedOpener: boolean
}

export interface DialoguePolicy {
  questionBudget: 0 | 1
  questionRequired: boolean
  mustContribute: boolean
  allowedBranch: string
  forbiddenBranches: string[]
  reason: string
}

export interface DialogueMoveRecord {
  assistantMessageId: string
  move: DialogueMove
  topic: string
  branch: string
  askedQuestion: boolean
  memoryIds: string[]
  createdAt: string
}

export interface TopicMomentum {
  topic: string
  branch: string
  score: number
  status: 'active' | 'dormant' | 'closed'
  continuedCount: number
  switchedCount: number
  lastTouchedAt: string
}

export interface MemoryFact {
  key: string
  value: string
  quote: string
  sensitive: boolean
  memoryType?: MemoryType
  topic?: string
  importance?: number
  suggestedTier?: MemoryTier
}

export interface ConversationSetup {
  title: string
  category: string
  setting: string
  partnerName: string
  partnerRole: string
  relationship: string
  tone: string
  personalityCues: string[]
  interests: string[]
  currentMood: string
  topicSeed: string
  openingLine: string
  difficulty: string
}

export type LookupAction = 'reply' | 'clarify' | 'lookup'

export interface LookupPart {
  text: string
  needsLookup: boolean
  reason: 'stable' | 'changing' | 'user_requested' | 'user_location' | 'unknown'
  subject: string
}

export interface LookupLocator {
  kind: 'url' | 'domain' | 'platform' | 'account' | 'post' | 'file'
  value: string
  domain: string
  quote: string
}

export interface TurnLookupDecision {
  action: LookupAction
  parts: LookupPart[]
  query: string
  locator: LookupLocator | null
}

export interface ConversationFact {
  id: string
  value: string
  source: 'scene' | 'partner'
  sourceMessageId: string
  createdAt: string
}

export interface ConversationOpenLoop {
  id: string
  text: string
  sourceMessageId: string
  createdAt: string
}

export interface ConversationState {
  currentTopic: string
  topicHistory: string[]
  openLoops: ConversationOpenLoop[]
  sceneFacts: ConversationFact[]
  lastCompactedMessageId: string
  recentMoves: DialogueMoveRecord[]
  topicMomentum: TopicMomentum[]
  recentMemoryIds: string[]
}

export interface ConversationStatePatch {
  currentTopic: string
  openedLoops: string[]
  resolvedLoops: string[]
  sceneFacts: string[]
  userFacts: MemoryFact[]
}

export interface ConversationEpisode {
  id: string
  conversationId: string
  startMessageId: string
  endMessageId: string
  thread: string
  summary: string
  facts: Array<{ value: string; quote: string; source: 'user' | 'partner' | 'scene'; sourceMessageId: string }>
  openLoops: string[]
  keywords: string[]
  topicArcs: Array<{
    topic: string
    status: 'active' | 'dormant' | 'closed'
    sourceMessageIds: string[]
  }>
  interactionSignals: Array<{
    kind: 'engaged' | 'topic_switch' | 'topic_rejected' | 'assistant_corrected' | 'style_preference'
    value: string
    sourceMessageId: string
    quote: string
  }>
  createdAt: string
  updatedAt: string
}
