export interface VisibleMessageLike {
  role?: unknown
  status?: unknown
  content?: unknown
}

function normalizedContent(value: unknown) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ') : ''
}

/** Hide a failed send once the learner has successfully resent the same text. */
export function visibleConversationMessages<T extends VisibleMessageLike>(messages: T[]) {
  const completedLater = new Set<string>()
  const visible: T[] = []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const content = normalizedContent(message.content)
    if (message.role === 'user' && message.status === 'failed' && content && completedLater.has(content)) continue
    visible.unshift(message)
    if (message.role === 'user' && message.status === 'complete' && content) completedLater.add(content)
  }
  return visible
}
