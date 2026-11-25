/** One part of a reply told in several: something narrated, or a line someone says. */
export interface ReplyBeat {
  type: 'narration' | 'say'
  text: string
  /** Who says the line. */
  name?: string
}

/** The parts that can be shown. One of a kind this version does not know is left out rather than shown as something it is not. */
function known(beats: unknown): ReplyBeat[] {
  const parts: ReplyBeat[] = []
  for (const beat of Array.isArray(beats) ? beats : []) {
    const text = typeof beat?.text === 'string' ? beat.text.trim() : ''
    if (!text) continue
    const name = typeof beat.name === 'string' ? beat.name.trim() : ''
    if (beat.type === 'narration') parts.push({ type: 'narration', text })
    else if (beat.type === 'say') parts.push({ type: 'say', text, ...(name ? { name } : {}) })
  }
  return parts
}

/** Whether a reply is told in several parts rather than as one line. */
export function toldInParts(beats: unknown): boolean {
  return known(beats).length > 0
}

/** All that is said in a reply told in parts, without the narration: what the reply is as one line. */
export function spokenIn(beats: unknown): string {
  return known(beats).filter((beat) => beat.type === 'say').map((beat) => beat.text).join(' ')
}

/** The parts a reply is shown in, in order: its own when it is told in several, otherwise the one line it has always been. */
export function replyParts(content: string, beats?: unknown): ReplyBeat[] {
  const parts = known(beats)
  return parts.length ? parts : [{ type: 'say', text: content }]
}
