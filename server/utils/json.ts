import { jsonrepair } from 'jsonrepair'

function between(text: string, open: string, close: string) {
  const start = text.indexOf(open)
  const end = text.lastIndexOf(close)
  return start >= 0 && end > start ? text.slice(start, end + 1) : ''
}

/**
 * Reads the JSON a model answered with. The answer may be bare JSON, JSON in a code fence, JSON
 * with a sentence before or after it, or JSON that needs small repairs. A code fence inside a
 * string value (a reply that shows code) is part of the answer and never mistaken for its wrapper.
 */
export function parseModelJson<T>(text: string): T {
  const answer = text.replace(/<think>[\s\S]*?<\/think>/giu, ' ').trim()
  const candidates = [
    answer,
    answer.match(/^```(?:json)?\s*([\s\S]*?)```$/iu)?.[1] || '',
    between(answer, '{', '}'),
    answer.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1] || '',
    between(answer, '[', ']'),
  ].map((candidate) => candidate.trim()).filter((candidate, index, all) => candidate && all.indexOf(candidate) === index)

  let firstError: unknown
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T
    } catch (error) {
      firstError ??= error
    }
  }
  // Repair goes from the narrowest reading to the widest, and only a real object or list counts:
  // the repair library will happily turn a plain sentence into a JSON string.
  for (const candidate of [...candidates.slice(1), candidates[0]]) {
    try {
      const repaired = JSON.parse(jsonrepair(candidate)) as unknown
      if (repaired && typeof repaired === 'object') return repaired as T
    } catch {
      // try the next reading
    }
  }
  throw firstError ?? new SyntaxError('The model answer contains no JSON')
}

export function safeJson<T>(text: string | null | undefined, fallback: T): T {
  try { return text ? JSON.parse(text) as T : fallback } catch { return fallback }
}
