export type ConversationKind = 'direct' | 'scene'

export interface ConversationListItem {
  id: string
  mode: 'conversation'
  title: string
  kind: ConversationKind
  firstMessage: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

export function compactConversationText(value: string) {
  return value.replace(/\s+/gu, ' ').trim()
}

export function truncateConversationTitle(value: string, limit = 80) {
  const characters = [...compactConversationText(value)]
  return characters.length > limit ? `${characters.slice(0, limit).join('')}…` : characters.join('')
}

export function conversationDisplayTitle(item: ConversationListItem, directFallback: string) {
  const source = item.kind === 'direct'
    ? compactConversationText(item.firstMessage) || item.title || directFallback
    : item.title || compactConversationText(item.firstMessage) || directFallback
  return truncateConversationTitle(source)
}

export function conversationPreview(item: ConversationListItem) {
  if (item.kind === 'direct') return ''
  const preview = compactConversationText(item.firstMessage)
  return preview && preview !== compactConversationText(item.title) ? preview : ''
}
