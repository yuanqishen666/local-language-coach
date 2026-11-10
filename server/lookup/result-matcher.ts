import type { LookupItem, LookupOutcome } from './types.js'

function terms(value: string) {
  const normalized = value.normalize('NFKC').toLocaleLowerCase()
  const words = normalized.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || []
  const cjk = [...normalized.matchAll(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]{2,}/gu)].flatMap((match) => {
    const chars = [...match[0]]
    return chars.map((_char, index) => chars.slice(index, index + 2).join('')).filter((item) => item.length === 2)
  })
  return [...new Set([...words, ...cjk].filter((item) => item.length > 1))]
}

function namedAnchors(value: string) {
  const quoted = [...value.matchAll(/["“‘']([^"”’']{2,80})["”’']/gu)].map((match) => match[1].toLocaleLowerCase())
  const capitalized = value.match(/\b(?:[A-Z][\p{L}\p{N}'-]{2,}|[A-Z]{2,})\b/gu) || []
  return [...new Set([...quoted, ...capitalized.map((item) => item.toLocaleLowerCase())])]
}

export function matchLookupItems(subject: string, location: string, items: LookupItem[]): LookupOutcome {
  if (!items.length) return { kind: 'not_found', subject, requestedLocation: location, items: [], note: 'No matching material was returned.' }
  const wanted = new Set(terms(subject))
  const anchors = namedAnchors(subject)
  const scored = items.map((item) => {
    const source = `${item.title} ${item.summary} ${item.content.slice(0, 2_000)}`
    const normalizedSource = source.normalize('NFKC').toLocaleLowerCase()
    const body = terms(source)
    const matches = body.filter((term) => wanted.has(term)).length
    const anchorMatches = anchors.every((anchor) => normalizedSource.includes(anchor))
    return { item, matches, anchorMatches }
  }).sort((left, right) => right.matches - left.matches)
  const minimumMatches = Math.min(2, wanted.size)
  const exact = scored
    .filter((entry) => entry.anchorMatches && entry.matches >= minimumMatches && entry.matches / Math.max(1, wanted.size) >= 0.34)
    .map((entry) => entry.item)
  if (!wanted.size) return { kind: 'partial', subject, requestedLocation: location, items: items.slice(0, 5), note: 'The subject was underspecified; use only clearly matching details.' }
  if (exact.length) return { kind: 'found', subject, requestedLocation: location, items: exact.slice(0, 5), note: 'Material matching the requested subject was found.' }
  return { kind: 'related', subject, requestedLocation: location, items: items.slice(0, 2), note: 'Only different or adjacent items were found. Do not substitute them for the requested subject.' }
}
