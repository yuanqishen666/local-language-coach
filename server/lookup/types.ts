import type { ProviderKind, TurnLookupDecision } from '../types.js'

export type LookupOutcomeKind = 'found' | 'partial' | 'related' | 'not_found' | 'unavailable' | 'disabled'

export interface LookupItem {
  title: string
  url: string
  summary: string
  content: string
}

export interface LookupCitation {
  url: string
  title: string
  startIndex?: number
  endIndex?: number
}

/**
 * Provider-mandated presentation data. It is deliberately separate from the
 * conversational text so the partner never speaks in citations or audit
 * language. `preserveText` means the provider's grounded answer must be shown
 * verbatim instead of being rewritten by a second model call.
 */
export interface LookupPresentation {
  provider: ProviderKind
  text: string
  citations: LookupCitation[]
  searchSuggestionsHtml?: string
  preserveText: true
}

export interface ProviderLookupResult {
  items: LookupItem[]
  presentation?: LookupPresentation
}

export interface LookupOutcome {
  kind: LookupOutcomeKind
  subject: string
  requestedLocation: string
  items: LookupItem[]
  note: string
  presentation?: LookupPresentation
}

export interface LookupRequest {
  decision: TurnLookupDecision
  latestUserMessage: string
  ordinaryLookupEnabled: boolean
  providerId?: string
  targetLanguage?: string
  timeoutMs: number
  maxResults: number
}
