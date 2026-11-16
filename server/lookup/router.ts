import { isSingleTurnAuthorized, scopedQuery, trustedLocator } from './locator.js'
import { fetchWithSelectedProvider, searchWithSelectedProvider, supportsProviderFetch, supportsProviderLookup } from './provider-tools.js'
import { matchLookupItems } from './result-matcher.js'
import type { LookupAttemptStage, LookupDiagnostic, LookupOutcome, LookupRequest, ProviderLookupResult } from './types.js'
import { readPublicUrl } from './url-reader.js'

export interface LookupRouterDependencies {
  readPublicUrl: typeof readPublicUrl
  fetchWithSelectedProvider: typeof fetchWithSelectedProvider
  searchWithSelectedProvider: typeof searchWithSelectedProvider
  supportsProviderFetch: typeof supportsProviderFetch
  supportsProviderLookup: typeof supportsProviderLookup
  reportFailure: (diagnostic: LookupDiagnostic, context: { providerId: string; hostname: string }) => void
}

const defaultDependencies: LookupRouterDependencies = {
  readPublicUrl,
  fetchWithSelectedProvider,
  searchWithSelectedProvider,
  supportsProviderFetch,
  supportsProviderLookup,
  reportFailure(diagnostic, context) {
    console.warn(JSON.stringify({ event: 'lookup_attempt_failed', ...context, ...diagnostic }))
  },
}

const safeErrorCodes = new Set([
  'UNSAFE_URL',
  'PAGE_TOO_LARGE',
  'UNSUPPORTED_PAGE',
  'EMPTY_PAGE',
  'TOO_MANY_REDIRECTS',
  'LOOKUP_INVALID_RESPONSE',
  'LOOKUP_FETCH_NOT_SUPPORTED',
  'LOOKUP_NOT_SUPPORTED',
  'LOOKUP_NOT_CONFIGURED',
])

export function lookupErrorCode(error: unknown) {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'TIMEOUT'
  const message = error instanceof Error ? error.message : ''
  if (safeErrorCodes.has(message) || /^(?:PAGE|LOOKUP)_HTTP_\d{3}$/u.test(message)) return message
  if (error instanceof TypeError) return 'NETWORK_ERROR'
  return 'UNKNOWN_ERROR'
}

function failureNote(diagnostics: LookupDiagnostic[]) {
  const direct = diagnostics.find((item) => item.stage === 'direct_read')?.code || ''
  const fallbacks = diagnostics.filter((item) => item.stage !== 'direct_read')
  const suffix = fallbacks.length ? ' The configured provider fallbacks also failed.' : ''
  if (direct === 'TIMEOUT') return `The learner-supplied page timed out before it could be read.${suffix}`
  if (direct === 'UNSAFE_URL') return `The learner-supplied URL was blocked by the public-address safety check.${suffix}`
  if (direct === 'PAGE_TOO_LARGE') return `The learner-supplied page exceeded the safe download limit.${suffix}`
  if (direct === 'UNSUPPORTED_PAGE') return `The learner-supplied URL returned a file type that cannot be read as text.${suffix}`
  if (direct === 'EMPTY_PAGE') return `The learner-supplied page returned no readable text.${suffix}`
  const httpStatus = /^PAGE_HTTP_(\d{3})$/u.exec(direct)?.[1]
  if (httpStatus) return `The learner-supplied page returned HTTP ${httpStatus}.${suffix}`
  if (direct === 'NETWORK_ERROR') return `A network error prevented the learner-supplied page from loading.${suffix}`
  return `The learner-supplied page could not be opened.${suffix}`
}

function withDiagnostics(outcome: LookupOutcome, diagnostics: LookupDiagnostic[]) {
  return diagnostics.length ? { ...outcome, diagnostics } : outcome
}

function hostnameOf(value: string) {
  try { return new URL(value).hostname.toLocaleLowerCase() }
  catch { return '' }
}

function recordFailure(
  diagnostics: LookupDiagnostic[],
  stage: LookupAttemptStage,
  error: unknown,
  dependencies: LookupRouterDependencies,
  providerId: string,
  location: string,
) {
  const diagnostic = { stage, code: lookupErrorCode(error) }
  diagnostics.push(diagnostic)
  dependencies.reportFailure(diagnostic, { providerId, hostname: hostnameOf(location) })
}

function keepRequestedDomain<T extends { url: string; title?: string }>(items: T[], domain: string) {
  if (!domain) return items
  return items.filter((item) => {
    try {
      const hostname = new URL(item.url).hostname.toLocaleLowerCase()
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return true
    } catch {}
    // Gemini grounding URLs are Google redirect URLs; the original source
    // domain is carried in the chunk title instead.
    const title = item.title?.trim().toLocaleLowerCase().replace(/^www\./u, '') || ''
    return title === domain || title.endsWith(`.${domain}`)
  })
}

function matchedOutcome(subject: string, location: string, result: ProviderLookupResult): LookupOutcome {
  const outcome = matchLookupItems(subject, location, result.items)
  if (result.presentation && (outcome.kind === 'found' || outcome.kind === 'partial')) {
    outcome.presentation = result.presentation
  }
  return outcome
}

async function providerSearch(request: LookupRequest, providerId: string, subject: string, query: string, domain: string, dependencies: LookupRouterDependencies) {
  const result = await dependencies.searchWithSelectedProvider({
    providerId,
    query,
    latestUserMessage: request.latestUserMessage,
    subject,
    domain,
    targetLanguage: request.targetLanguage,
    count: request.maxResults,
    timeoutMs: request.timeoutMs,
  })
  if (!domain) return result
  const items = keepRequestedDomain(result.items, domain)
  const citations = result.presentation ? keepRequestedDomain(result.presentation.citations, domain) : []
  return {
    items,
    ...(result.presentation && citations.length
      ? { presentation: { ...result.presentation, citations } }
      : {}),
  }
}

export async function runLookup(request: LookupRequest, overrides: Partial<LookupRouterDependencies> = {}): Promise<LookupOutcome> {
  const dependencies = { ...defaultDependencies, ...overrides }
  const providerId = request.providerId || ''
  const locator = trustedLocator(request.decision, request.latestUserMessage)
  const authorized = request.ordinaryLookupEnabled || isSingleTurnAuthorized(request.decision, request.latestUserMessage)
  const subject = request.decision.parts.find((part) => part.needsLookup)?.subject || request.decision.query
  if (!authorized) return { kind: 'disabled', subject, requestedLocation: '', items: [], note: 'Ordinary lookup is disabled and the learner supplied no locator.' }

  if (locator?.kind === 'file') {
    return { kind: 'unavailable', subject, requestedLocation: locator.value, items: [], note: 'The learner supplied a file location, which was not sent to a web search service.' }
  }

  if (locator && ['platform', 'account', 'post'].includes(locator.kind) && !locator.domain) {
    return { kind: 'unavailable', subject, requestedLocation: locator.value, items: [], note: 'The named location could not be resolved to a verified domain, so the lookup was not expanded to the open web.' }
  }

  if (locator?.kind === 'url') {
    const diagnostics: LookupDiagnostic[] = []
    try {
      const item = await dependencies.readPublicUrl(locator.value, request.timeoutMs)
      return matchLookupItems(subject, locator.value, [item])
    } catch (error) {
      recordFailure(diagnostics, 'direct_read', error, dependencies, providerId, locator.value)
    }

    if (dependencies.supportsProviderFetch(providerId)) {
      try {
        const item = await dependencies.fetchWithSelectedProvider(providerId, locator.value, request.timeoutMs)
        return withDiagnostics(matchLookupItems(subject, locator.value, [item]), diagnostics)
      } catch (error) {
        recordFailure(diagnostics, 'provider_fetch', error, dependencies, providerId, locator.value)
      }
    }

    if (dependencies.supportsProviderLookup(providerId)) {
      try {
        const query = [...`${subject} ${locator.value}`].slice(0, 128).join('')
        const result = await providerSearch(request, providerId, subject, query, locator.domain, dependencies)
        return withDiagnostics(matchedOutcome(subject, locator.value, result), diagnostics)
      } catch (error) {
        recordFailure(diagnostics, 'provider_search', error, dependencies, providerId, locator.value)
      }
    }

    return {
      kind: 'unavailable',
      subject,
      requestedLocation: locator.value,
      items: [],
      note: failureNote(diagnostics),
      diagnostics,
    }
  }

  const diagnostics: LookupDiagnostic[] = []
  try {
    if (!dependencies.supportsProviderLookup(providerId)) return { kind: 'unavailable', subject, requestedLocation: locator?.value || '', items: [], note: 'The selected model provider does not offer a compatible lookup path.' }
    const query = scopedQuery(request.decision.query || subject, locator)
    if (!query) return { kind: 'not_found', subject, requestedLocation: locator?.value || '', items: [], note: 'There was not enough information to form a focused lookup.' }
    const result = await providerSearch(request, providerId, subject, query, locator?.domain || '', dependencies)
    return matchedOutcome(subject, locator?.value || '', result)
  } catch (error) {
    recordFailure(diagnostics, 'provider_search', error, dependencies, providerId, locator?.value || '')
    return { kind: 'unavailable', subject, requestedLocation: locator?.value || '', items: [], note: 'The lookup service did not complete this request.', diagnostics }
  }
}
