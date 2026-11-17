import assert from 'node:assert/strict'
import test from 'node:test'
import { beginOptimisticTurn, completeOptimisticTurn } from './conversation-turn'
import type { Message } from './types'

function completed(id: string, role: Message['role'], content: string, clientMessageId?: string): Message {
  return {
    id,
    role,
    content,
    meta: {},
    ...(clientMessageId ? { clientMessageId } : {}),
    status: 'complete',
    createdAt: '2026-11-17T00:00:00.000Z',
  }
}

test('a resumed response replaces its pending message once', () => {
  const messages: Message[] = []
  const optimistic = beginOptimisticTurn(messages, 'hello', 'client-a')
  const user = completed('user-a', 'user', 'hello', 'client-a')
  const assistant = completed('assistant-a', 'assistant', 'reply')

  completeOptimisticTurn(messages, { localId: optimistic.localId, clientMessageId: 'client-a' }, user, assistant)
  assert.deepEqual(messages.map((message) => message.id), ['user-a', 'assistant-a'])
})

test('two listeners completing the same transaction do not duplicate the reply', () => {
  const user = completed('user-a', 'user', 'hello', 'client-a')
  const assistant = completed('assistant-a', 'assistant', 'reply')
  const messages: Message[] = [user, assistant]

  completeOptimisticTurn(messages, { localId: 'local:client-a', clientMessageId: 'client-a' }, user, assistant)
  assert.deepEqual(messages.map((message) => message.id), ['user-a', 'assistant-a'])
})
