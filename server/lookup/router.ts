import { isSingleTurnAuthorized, scopedQuery, trustedLocator } from './locator.js'
import { fetchWithSelectedProvider, searchWithSelectedProvider, supportsProviderFetch, supportsProviderLookup } from './provider-tools.js'
import { matchLookupItems } from './result-matcher.js'
import type { LookupOutcome, LookupRequest, ProviderLookupResult } from './types.js'
import { readPublicUrl } from './url-reader.js'

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

async function providerSearch(request: LookupRequest, providerId: string, subject: string, query: string, domain: string) {
  const result = await searchWithSelectedProvider({
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

export async function runLookup(request: LookupRequest): Promise<LookupOutcome> {
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
    try {
      const item = await readPublicUrl(locator.value, request.timeoutMs)
      return matchLookupItems(subject, locator.value, [item])
    } catch {
      try {
        if (supportsProviderFetch(providerId)) {
          const item = await fetchWithSelectedProvider(providerId, locator.value, request.timeoutMs)
          return matchLookupItems(subject, locator.value, [item])
        }
        if (!supportsProviderLookup(providerId)) throw new Error('LOOKUP_NOT_SUPPORTED')
        const query = [...`${subject} ${locator.value}`].slice(0, 128).join('')
        const result = await providerSearch(request, providerId, subject, query, locator.domain)
        return matchedOutcome(subject, locator.value, result)
      } catch {
        return { kind: 'unavailable', subject, requestedLocation: locator.value, items: [], note: 'The learner-supplied page could not be opened.' }
      }
    }
  }

  try {
    if (!supportsProviderLookup(providerId)) return { kind: 'unavailable', subject, requestedLocation: locator?.value || '', items: [], note: 'The selected model provider does not offer a compatible lookup path.' }
    const query = scopedQuery(request.decision.query || subject, locator)
    if (!query) return { kind: 'not_found', subject, requestedLocation: locator?.value || '', items: [], note: 'There was not enough information to form a focused lookup.' }
    const result = await providerSearch(request, providerId, subject, query, locator?.domain || '')
    return matchedOutcome(subject, locator?.value || '', result)
  } catch {
    return { kind: 'unavailable', subject, requestedLocation: locator?.value || '', items: [], note: 'The lookup service did not complete this request.' }
  }
}
