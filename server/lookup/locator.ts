import type { LookupLocator, TurnLookupDecision } from '../types.js'

const urlPattern = /https?:\/\/[^\s<>"'）)\]}]+/giu

const platformDomains = new Map([
  ['reddit', 'reddit.com'],
  ['twitter', 'x.com'],
  ['x', 'x.com'],
  ['facebook', 'facebook.com'],
  ['instagram', 'instagram.com'],
  ['youtube', 'youtube.com'],
  ['tiktok', 'tiktok.com'],
  ['linkedin', 'linkedin.com'],
  ['threads', 'threads.net'],
  ['微博', 'weibo.com'],
  ['知乎', 'zhihu.com'],
  ['小红书', 'xiaohongshu.com'],
  ['bilibili', 'bilibili.com'],
  ['哔哩哔哩', 'bilibili.com'],
])

function knownPlatformDomain(value: string) {
  const normalized = value.normalize('NFKC').toLocaleLowerCase()
  for (const [name, domain] of platformDomains) {
    if (normalized === name || (name.length >= 3 && normalized.includes(name))) return domain
  }
  return ''
}

export function explicitUrl(message: string) {
  const match = message.match(urlPattern)?.[0]
  if (!match) return null
  return match.replace(/[.,!?;:，。！？；：]+$/u, '')
}

function validDomain(value: string) {
  const domain = value.trim().toLocaleLowerCase().replace(/^https?:\/\//u, '').split('/')[0]
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(domain) && domain.includes('.') ? domain : ''
}

export function trustedLocator(decision: TurnLookupDecision, latestUserMessage: string): LookupLocator | null {
  const url = explicitUrl(latestUserMessage)
  if (url) {
    try {
      const parsed = new URL(url)
      return { kind: 'url', value: parsed.toString(), domain: parsed.hostname.toLocaleLowerCase(), quote: url }
    } catch { return null }
  }
  const locator = decision.locator
  if (!locator?.quote || !latestUserMessage.includes(locator.quote)) return null
  const knownDomain = locator.kind === 'platform' || locator.kind === 'account' || locator.kind === 'post'
    ? knownPlatformDomain(`${locator.value} ${locator.quote}`)
    : ''
  const candidateDomain = knownDomain || validDomain(locator.domain)
  const normalizedMessage = latestUserMessage.toLocaleLowerCase()
  const normalizedLocation = `${locator.value} ${locator.quote}`.toLocaleLowerCase()
  const domainLabel = candidateDomain.split('.').at(-2) || ''
  const domainWasWritten = Boolean(candidateDomain && normalizedMessage.includes(candidateDomain))
  const domainMatchesNamedLocation = Boolean(domainLabel.length >= 3 && normalizedLocation.includes(domainLabel))
  const domain = knownDomain || domainWasWritten || domainMatchesNamedLocation ? candidateDomain : ''
  return {
    kind: locator.kind,
    value: locator.value.trim(),
    domain,
    quote: locator.quote,
  }
}

export function isSingleTurnAuthorized(decision: TurnLookupDecision, latestUserMessage: string) {
  return Boolean(trustedLocator(decision, latestUserMessage))
}

export function scopedQuery(query: string, locator: LookupLocator | null) {
  const clean = query.trim()
  if (!locator) return clean
  const location = locator.value.trim()
  const includesLocation = location && clean.toLocaleLowerCase().includes(location.toLocaleLowerCase())
  const located = includesLocation || !location ? clean : `"${location.replace(/"/gu, '')}" ${clean}`
  return locator.domain ? `${located} site:${locator.domain}`.trim() : located.trim()
}
