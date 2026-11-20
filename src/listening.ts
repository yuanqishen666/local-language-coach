/**
 * Hearing a reply before seeing it. A line that arrives while this is on is read aloud with its
 * text held back until the learner asks for it. Which lines are held back is kept for the visit
 * only: opened again later, a conversation shows all of its text.
 */
import { reactive } from 'vue'
import { useAppStore } from './stores/app'

const held = reactive(new Set<string>())

/** Whether replies are heard before they are seen. */
export function listeningFirst() {
  return useAppStore().settings?.learning.listenFirst === true
}

export function holdText(messageId: string) {
  held.add(messageId)
}

export function textHeld(messageId: string) {
  return held.has(messageId)
}

export function showText(messageId: string) {
  held.delete(messageId)
}

const SENTENCE_END = /[^.!?。！？।…]+[.!?。！？।…]+["'”’」』）)]*|[^.!?。！？।…]+$/gu

/** The sentences of a line, each of which can be heard on its own. */
export function sentencesOf(text: string, languageCode: string): string[] {
  const value = text.trim()
  if (!value) return []
  let parts: string[]
  try {
    const segments = new Intl.Segmenter(languageCode.split(/[-_]/u)[0], { granularity: 'sentence' }).segment(value)
    parts = Array.from(segments, (segment) => segment.segment)
  } catch {
    parts = value.match(SENTENCE_END) || [value]
  }
  return parts.map((part) => part.trim()).filter(Boolean)
}

/** The learner has answered: what was held back is shown, with nothing counted against the listening. */
export function showAllText() {
  held.clear()
}
