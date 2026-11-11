import type { UiLocale } from '../shared/locales'

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
  capabilityReady?: boolean
  contextWindowTokens: number
  maxOutputTokens: number
  modelProfiles?: Record<string, ProviderModelProfile>
  capability?: {
    outputMode: 'json_schema' | 'json_object' | 'prompt_json'
    baseUrl: string
    model: string
    conversationReady: true
    lookupReady: true
    contractVersion: number
    testedAt: string
  }
}

export interface Settings {
  setupComplete: boolean
  ui: { locale: UiLocale }
  learning: { targetLanguage: string; targetLanguageCode: string; proficiency: string; correctionLevel: string }
  llm: { defaultProvider: string; temperature: number }
  webLookup: { enabled: boolean; provider: 'selected'; timeoutMs: number; maxResults: number }
  providers: Provider[]
  modelReady: boolean
  webLookupReady: boolean
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

export interface Correction {
  original: string
  improved: string
  explanation: string
  severity: string
}

export interface MessageMeta {
  opening?: boolean
  interfaceLocale?: UiLocale
  reconstruction?: { type: string; original: string; improved: string; explanation: string }
  corrections?: Correction[]
  roleReplyTranslation?: string
  roleReplyTranslations?: Record<string, string>
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
    userFacts: Array<{ key: string; value: string; quote: string; sensitive: boolean; memoryType?: string; topic?: string; importance?: number; suggestedTier?: 'core' | 'long_term' }>
  }
  memoryCandidates?: Array<{
    category: string
    key: string
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
  }>
}

export interface Message { id: string; role: 'user' | 'assistant'; content: string; meta: MessageMeta; clientMessageId?: string; status?: 'pending' | 'complete' | 'failed'; createdAt: string }

export interface Conversation {
  id: string
  mode: 'conversation'
  title: string
  status: 'active' | 'archived'
  setup: ConversationSetup | null
  createdAt: string
  messages: Message[]
}
