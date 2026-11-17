import assert from 'node:assert/strict'
import test from 'node:test'
import { conversationTurnRecoveryAction, conversationTurnStatus } from './conversation-turn-recovery'
import type { Message } from './types'

function message(status: Message['status'], clientMessageId = 'client-a'): Message {
  return {
    id: 'message-a',
    role: 'user',
    content: 'hello',
    meta: {},
    clientMessageId,
    status,
    createdAt: '2026-11-17T00:00:00.000Z',
  }
}

test('local conversation messages identify the stored turn state', () => {
  assert.equal(conversationTurnStatus([], 'client-a'), 'missing')
  assert.equal(conversationTurnStatus([message('pending')], 'client-a'), 'pending')
  assert.equal(conversationTurnStatus([message('failed')], 'client-a'), 'failed')
  assert.equal(conversationTurnStatus([message('complete')], 'client-a'), 'complete')
})

test('completed turns clear, pending turns resume, and uncertain turns restore', () => {
  assert.equal(conversationTurnRecoveryAction('complete'), 'clear')
  assert.equal(conversationTurnRecoveryAction('pending'), 'resume')
  assert.equal(conversationTurnRecoveryAction('failed'), 'restore')
  assert.equal(conversationTurnRecoveryAction('missing'), 'restore')
})
