/** Presentation helpers: which part of a long text to show first, and how many rows of a long list. */
import { computed, ref, watch, type Ref } from 'vue'

export interface Excerpt {
  /** The one sentence worth showing first. */
  sentence: string
  /** Whether the full text holds more than that sentence, or is long enough to be cut short. */
  more: boolean
}

/** The sentence of `text` that holds `term`; the first sentence when the term is not found. */
export function sentenceWith(text: string | null | undefined, term: string, locale?: string): Excerpt {
  const source = (text || '').trim()
  if (!source) return { sentence: '', more: false }
  let parts: string[]
  try {
    parts = [...new Intl.Segmenter(locale || undefined, { granularity: 'sentence' }).segment(source)].map((item) => item.segment.trim()).filter(Boolean)
  } catch {
    parts = [source]
  }
  if (parts.length < 2) return { sentence: source, more: source.length > 180 }
  const needle = term.trim().toLowerCase()
  const hit = needle ? parts.find((part) => part.toLowerCase().includes(needle)) : undefined
  return { sentence: hit || parts[0], more: true }
}

/** `text` cut at every occurrence of `term`, so the term can be drawn as a gap. */
export function gapPieces(text: string, term: string): Array<{ text: string; gap: boolean }> {
  if (!text) return []
  try {
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (!escaped) return [{ text, gap: false }]
    return text.split(new RegExp(`(${escaped})`, 'ig')).map((piece, at) => ({ text: piece, gap: at % 2 === 1 })).filter((piece) => piece.text)
  } catch {
    return [{ text, gap: false }]
  }
}

/** A long list shown a page at a time: the first `step` rows, more on request. */
export function usePaged<T>(all: Ref<T[]>, step: number) {
  const limit = ref(step)
  watch(() => all.value.length, (now, before) => { if (now < before && now <= step) limit.value = step })
  const rows = computed(() => all.value.slice(0, limit.value))
  const left = computed(() => Math.max(0, all.value.length - limit.value))
  function more() { limit.value += step * 2 }
  function reset() { limit.value = step }
  return { rows, left, more, reset }
}
