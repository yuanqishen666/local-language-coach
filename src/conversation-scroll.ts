export const CONVERSATION_END_THRESHOLD = 72

export interface ScrollMetrics {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/** A small allowance keeps fractional pixels and the final line from making the view look "away". */
export function isNearConversationEnd(metrics: ScrollMetrics, threshold = CONVERSATION_END_THRESHOLD) {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold
}

/** Preserve both the failed message and anything drafted while its reply was pending. */
export function restoreFailedComposer(sent: string, currentDraft: string) {
  const draft = currentDraft.trim()
  if (!draft || draft === sent.trim()) return sent
  return `${sent}\n\n${currentDraft}`
}
