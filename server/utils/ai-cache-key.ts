import { createHash } from 'node:crypto'

function normalizedText(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ')
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === 'string') return normalizedText(value)
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    )
  }
  return value
}

export function aiCacheDigest(identity: unknown) {
  return createHash('sha256').update(JSON.stringify(canonicalValue(identity))).digest('hex')
}

export function lookupCacheKey(input: {
  term: string
  sentence: string
  previous?: string
  setup?: unknown
  targetLanguage: string
  targetLanguageCode: string
  interfaceLocale: string
}) {
  return aiCacheDigest({
    version: 1,
    operation: 'term_lookup',
    term: input.term,
    sentence: input.sentence,
    previous: input.previous || '',
    setup: input.setup || null,
    targetLanguage: input.targetLanguage,
    targetLanguageCode: input.targetLanguageCode.toLowerCase(),
    interfaceLocale: input.interfaceLocale.toLowerCase(),
  })
}
