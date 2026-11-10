import { jsonrepair } from 'jsonrepair'

export function parseModelJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = fenced || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  try {
    return JSON.parse(candidate) as T
  } catch (originalError) {
    try {
      return JSON.parse(jsonrepair(candidate)) as T
    } catch {
      throw originalError
    }
  }
}

export function safeJson<T>(text: string | null | undefined, fallback: T): T {
  try { return text ? JSON.parse(text) as T : fallback } catch { return fallback }
}
