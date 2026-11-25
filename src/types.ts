import type { UiLocale } from '../shared/locales'
import type { MemoryLayer } from '../shared/memory'
import type { ReviewedWord } from '../shared/wordbook'
import type { ReplyBeat } from '../shared/reply'
import type { LocalStyleCard, SceneFactPolicy, SceneInitiativeMode, SceneOrigin, SceneParticipant, SceneSafetyClass } from '../shared/conversation-scenes'

export interface ProviderModelProfile {
  contextWindowTokens: number
  maxOutputTokens: number
}

export interface Provider {
  id: string
  name: string
  kind: string
  model: string
  apiKeySecret: string
  enabled: boolean
  hasApiKey?: boolean
  /** Only the provider the learner added themselves shows its address. */
  baseUrl?: string
  /** The learner's own price, in US dollars per million tokens. */
  price?: { input: number; output: number }
  capabilityReady?: boolean
  contextWindowTokens: number
  maxOutputTokens: number
  modelProfiles?: Record<string, ProviderModelProfile>
  capability?: {
    outputMode: 'json_schema' | 'json_object' | 'prompt_json'
    baseUrl: string
    model: string
    conversationReady: true
    lookupReady: boolean
    contractVersion: number
    testedAt: string
  }
}

export interface Settings {
  setupComplete: boolean
  ui: { locale: UiLocale }
  learning: { targetLanguage: string; targetLanguageCode: string; proficiency: string; correctionLevel: string; speechRate?: number; reviewInConversation?: boolean; voiceInput?: 'browser' | 'model'; listenFirst?: boolean; variant?: string; register?: 'neutral' | 'casual' | 'formal' }
  llm: { defaultProvider: string; temperature: number; reviewProvider?: string }
  webLookup: { enabled: boolean; provider: 'selected'; timeoutMs: number; maxResults: number }
  providers: Provider[]
  modelReady: boolean
  webLookupReady: boolean
  /** Tidying memories after a conversation costs a model call; it is off unless switched on. */
  memory?: { consolidate?: boolean }
  usage?: { monthlyLimit?: number }
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

export interface Correction {
  original: string
  improved: string
  explanation: string
  severity: string
  category?: string
  /** How sure the correction is. Only a sure one counts as a mistake. */
  certainty?: 'sure' | 'either' | 'unsure'
}

export interface TermLookup {
  term: string
  lemma: string
  partOfSpeech: string
  pronunciation: string
  contextMeaning: string
  forms: Array<{ label: string; value: string }>
  senses: Array<{ meaning: string; example: string; translation: string }>
  collocations: Array<{ phrase: string; meaning: string }>
  register: string
  regionalNotes: string
}

export interface MessageMeta {
  opening?: boolean
  interfaceLocale?: UiLocale
  reconstruction?: { type: string; original: string; improved: string; explanation: string }
  corrections?: Correction[]
  /** Saved words the learner used in the message this reply answers. */
  reviewedWords?: ReviewedWord[]
  roleReplyTranslation?: string
  roleReplyTranslations?: Record<string, string>
  /** The reply told in several parts, in order. Absent when it is the one line in the message's content. */
  beats?: ReplyBeat[]
  /** A short answer, in the learner's own language, to something they asked in it. */
  aside?: string
  /** The line as it was first written, kept when it has been said again more simply. */
  originalReply?: string
  simplerCount?: number
  /** Hints toward what the line means, one per interface language. */
  lineHints?: Record<string, string>
  lookup?: {
    action: 'reply' | 'clarify' | 'lookup'
    parts: Array<{ text: string; needsLookup: boolean; reason: string; subject: string }>
    query: string
    locator: { kind: string; value: string; domain: string; quote: string } | null
  }
  grounding?: {
    provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'kimi'
    citations: Array<{ url: string; title: string; startIndex?: number; endIndex?: number }>
    searchSuggestionsHtml?: string
  }
  statePatch?: {
    currentTopic: string
    openedLoops: string[]
    resolvedLoops: string[]
    sceneFacts: string[]
    userFacts: Array<{ key: string; semanticSlot?: string; value: string; quote: string; sensitive: boolean; memoryType?: string; topic?: string; importance?: number; suggestedTier?: 'core' | 'long_term' }>
  }
  memoryCandidates?: Array<{
    category: string
    key: string
    semanticSlot: string
    value: string
    confidence: number
    sensitive: boolean
    action: 'create' | 'update'
    previousValue?: string
    tier: 'core' | 'long_term'
    memoryType: string
    topic: string
    importance: number
    sourceMessageId: string
    /** The learner's own words this was read from. */
    quote?: string
    /** Whether it was said in a scene or in a plain chat. */
    frame?: 'direct' | 'scene'
    durability?: 'lasting' | 'temporary' | 'momentary'
    /** Set when it would only be kept for a while. */
    validTo?: string
    targetLanguageCode?: string
    /** Set when it was stored at once because the learner asked for it to be remembered. */
    savedMemoryId?: string
  }>
  /** The long-term memories this reply was written with. */
  usedMemories?: Array<{ id: string; value: string; layer: MemoryLayer }>
}

export type MemoryCandidate = NonNullable<MessageMeta['memoryCandidates']>[number]

/** Something one conversation remembers. It is never used outside that conversation. */
export interface ConversationMemory {
  id: string
  key: string
  value: string
  quote: string
  about: 'user' | 'persona'
  memoryType: string
  sensitive: boolean
  promotedMemoryId: string | null
  createdAt: string
}

export interface MemorySource {
  conversationId: string | null
  frame: 'direct' | 'scene' | ''
  sceneTitle: string
  quote: string
  createdAt: string
  /** False once the conversation it came from has been deleted. */
  conversationExists: boolean
}

/** Something only the learner can settle about a memory. */
export interface MemorySuggestion {
  id: string
  kind: 'promote' | 'conflict' | 'stale' | 'review'
  memoryId: string | null
  conversationId: string | null
  conversationTitle: string
  frame: 'direct' | 'scene' | ''
  value: string
  note: string
  quote: string
  memoryValue: string
  layer: MemoryLayer | null
}

export interface LearningLanguageStatus {
  code: string
  name: string
  current: boolean
  turns: number
  errors: Array<{ category: string; count: number; recentCount: number; lastAt: string; quiet: boolean; noted?: boolean; practice?: { right: number; wrong: number }; examples: Array<{ original: string; improved: string }> }>
  gaps: Array<{ id: string; original: string; improved: string; at: string }>
  topics: Array<{ title: string; count: number; lastAt: string }>
}

export interface Message { id: string; role: 'user' | 'assistant'; content: string; meta: MessageMeta; clientMessageId?: string; status?: 'pending' | 'complete' | 'failed'; createdAt: string }

/** The difficulty one conversation is written at. */
export interface ConversationLevel {
  step: number
  replyStep: number
  /** The step the conversation before this one was held at. */
  previousStep: number | null
  raised: boolean
  speechRateFactor: number
}

export interface Conversation {
  id: string
  mode: 'conversation'
  title: string
  status: 'active' | 'archived'
  interfaceLocale?: UiLocale
  /** The learning language this conversation started in. Missing on older conversations, which follow the current setting. */
  targetLanguageCode?: string
  setup: ConversationSetup | null
  scene?: { origin: SceneOrigin } | null
  createdAt: string
  /** Missing on a conversation loaded before the server knew levels. */
  level?: ConversationLevel
  messages: Message[]
}
