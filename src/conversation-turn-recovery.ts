import type { Message } from './types'

export type ConversationTurnStatus = 'missing' | 'pending' | 'failed' | 'complete'
export type ConversationTurnRecoveryAction = 'clear' | 'resume' | 'restore'

export interface ConversationTurnStatusResponse {
  status: ConversationTurnStatus
  clientMessageId: string
  userMessage?: Message
  assistantMessage?: Message
}

export function conversationTurnStatus(messages: Message[], clientMessageId: string): ConversationTurnStatus {
  const message = messages.find((item) => item.role === 'user' && item.clientMessageId === clientMessageId)
  if (!message) return 'missing'
  if (message.status === 'pending' || message.status === 'failed') return message.status
  return 'complete'
}

export function conversationTurnRecoveryAction(status: ConversationTurnStatus): ConversationTurnRecoveryAction {
  if (status === 'complete') return 'clear'
  if (status === 'pending') return 'resume'
  return 'restore'
}
