import type { ReviewedWord } from '../shared/wordbook.js'
export type { UiLocale } from '../shared/locales.js'
import type { UiLocale } from '../shared/locales.js'
import type { Certainty } from '../shared/variants.js'
import type { ReplyBeat } from '../shared/reply.js'
import type { ErrorCategory, MemoryAbout, MemoryDurability, MemoryFrame, MemoryKind, MemoryLayer } from '../shared/memory.js'
import type { LocalStyleCard, SceneFactPolicy, SceneInitiativeMode, SceneOrigin, SceneParticipant, SceneSafetyClass } from '../shared/conversation-scenes.js'

export type ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'kimi'
export type StructuredOutputMode = 'json_schema' | 'json_object' | 'prompt_json'

export interface ProviderCapability {
  outputMode: StructuredOutputMode
  conversationReady: true
  /** False only for a custom endpoint, which has no search service of its own to pass the check with. */
  lookupReady: boolean
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
  /** The learner's own price for this provider in US dollars per million tokens, used instead of the list price. */
  price?: { input: number; output: number }
}

/** One learner on this computer. Each has a database file of their own; providers and keys are shared. */
export interface LearnerProfile {
  id: string
  name: string
  createdAt: string
  /** What this learner had set when someone else took over; absent while they are the one using the app. */
  learning?: AppConfig['learning']
  uiLocale?: UiLocale
}

export interface AppConfig {
  setupComplete: boolean
  ui: { locale: UiLocale }
  learning: {
    targetLanguage: string
    targetLanguageCode: string
    proficiency: string
    correctionLevel: 'light' | 'balanced' | 'intensive'
    /** Optional so configurations created before pronunciation settings remain loadable. */
    speechRate?: number
    /** Saved words due for review come up in conversation. Absent means on. */
    reviewInConversation?: boolean
    /** Where speech is turned into text. Absent means the browser. */
    voiceInput?: 'browser' | 'model'
    /** The partner's lines are played with their text hidden until it is asked for. */
    listenFirst?: boolean
    /** The regional variety the partner writes and corrects in, such as en-GB. Absent or empty means the usual one. */
    variant?: string
    /** How formal the partner's language is. Absent means neutral. */
    register?: 'neutral' | 'casual' | 'formal'
    /** The difficulty one request is written at, on the 18-step scale. Set per request from the level profile; never saved. */
    difficultyStep?: number
  }
  llm: {
    defaultProvider: string
    temperature: number
    /** Looks back over conversations and scores tests. Absent or empty means the provider used for talking. */
    reviewProvider?: string
  }
  webLookup: {
    enabled: boolean
    provider: 'selected'
    timeoutMs: number
    maxResults: number
  }
  /** `lan` opens the app to other devices on the home network; it takes effect when the app is started again. */
  server: { host: string; port: number; lan?: boolean }
  providers: ProviderConfig[]
  /** Optional so configurations saved before it existed remain loadable. Tidying after a conversation costs one more model call, so it is off unless switched on. */
  memory?: { consolidate?: boolean }
  /** A reminder, not a cap: the estimated spend per calendar month, in US dollars, above which the app says so. */
  usage?: { monthlyLimit?: number }
  /** Learners sharing this computer. Absent means there is only one. */
  profiles?: LearnerProfile[]
  activeProfile?: string
}

/** The language one conversation is held in. Recorded when it starts, so changing the learning language later leaves it alone. */
export type LearningLanguage = Pick<AppConfig['learning'], 'targetLanguage' | 'targetLanguageCode'> & {
  /** The difficulty to write at. Without it the level chosen in settings applies. */
  difficultyStep?: number
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
    category: ErrorCategory
    /** Absent means sure. 'either' when the learner's wording is also right somewhere or in some register; 'unsure' when the model could not tell. */
    certainty?: Certainty
  }>
  roleReply: string
  /**
   * The reply told in several parts, in order. Absent when the reply is the one line in roleReply, as every reply
   * written by writeReply is. When present, roleReply still holds all that is said, without the narration, so that
   * reading aloud, translating and the next turn work from it as they do for any reply.
   */
  beats?: ReplyBeat[]
  /** A short answer in the learner's own language to something they asked in it. Shown beside the reply, never as part of it. */
  aside?: string
  roleReplyTranslation?: string
  roleReplyTranslations?: Record<string, string>
  /** Saved words the learner used in the message this replies to. */
  reviewedWords?: ReviewedWord[]
  lookup: TurnLookupDecision
  grounding?: {
    provider: ProviderKind
    citations: Array<{ url: string; title: string; startIndex?: number; endIndex?: number }>
    searchSuggestionsHtml?: string
  }
  statePatch: ConversationStatePatch
  memoryCandidates: MemoryCandidate[]
  /** The long-term memories this reply was written with. Only ids are stored; their wording is read when the message is shown. */
  usedMemoryIds?: string[]
  usedMemories?: Array<{ id: string; value: string; layer: MemoryLayer }>
}

/** Something the learner said about themselves that could be kept beyond this conversation. They decide. */
export interface MemoryCandidate {
  category: MemoryLayer
  key: string
  semanticSlot: string
  value: string
  /** The learner's own words it rests on. */
  quote: string
  confidence: number
  sensitive: boolean
  action: 'create' | 'update'
  previousValue?: string
  tier: MemoryTier
  memoryType: MemoryType
  topic: string
  importance: number
  sourceMessageId: string
  /** Whether it was said in a scene or in a direct conversation. */
  frame: MemoryFrame
  durability: MemoryDurability
  /** When it stops being used, for things that only hold for a while. */
  validTo?: string
  targetLanguageCode?: string
  /** Set when the learner asked for it in so many words, so it was stored at once. */
  savedMemoryId?: string
}

export type MemoryTier = 'core' | 'long_term'
export type MemoryType = MemoryKind
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
  semanticSlot?: string
  value: string
  quote: string
  sensitive: boolean
  memoryType?: MemoryType
  topic?: string
  importance?: number
  suggestedTier?: MemoryTier
  /** Who the statement is about: the learner, the part they play in a scene, or someone else. */
  about?: MemoryAbout
  /** Whether it holds from now on, for a while, or only at this moment. */
  durability?: MemoryDurability
  /** For something that holds for a while: roughly how many days. */
  validDays?: number
  /** Whether the learner asked for it to be remembered. */
  explicit?: boolean
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
  participants?: SceneParticipant[]
  localStyle?: LocalStyleCard
  factPolicy?: SceneFactPolicy
  initiativeMode?: SceneInitiativeMode
  openingAct?: string
  encounterSummary?: string
  safetyClass?: SceneSafetyClass
}

export interface ConversationScene {
  origin: SceneOrigin
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

/** A story or pasted text a conversation is about. Both speakers have read it. */
export interface ConversationMaterial {
  kind: 'story' | 'import'
  title: string
  text: string
}
