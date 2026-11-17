import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearConversationTurn,
  conversationTurnKey,
  readConversationTurn,
  saveConversationTurn,
  updateConversationTurnPhase,
  type StoredConversationTurn,
  type TurnStorage,
} from './conversation-turn-storage'
import { conversationDraftPrefix } from './model-access'

class MemoryStorage implements TurnStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

function turn(overrides: Partial<StoredConversationTurn> = {}): StoredConversationTurn {
  return {
    version: 1,
    conversationId: 'conversation-a',
    clientMessageId: 'message-a',
    content: 'hello',
    interfaceLocale: 'zh-CN',
    phase: 'submitting',
    createdAt: '2026-11-17T00:00:00.000Z',
    ...overrides,
  }
}

test('a completed response clears the frozen conversation key after the route changes', () => {
  const storage = new MemoryStorage()
  saveConversationTurn(storage, turn())

  assert.equal(clearConversationTurn(storage, 'conversation-a', 'message-a'), true)
  assert.equal(storage.getItem(conversationTurnKey('conversation-a')), null)
})

test('an older response cannot clear a newer turn for the same conversation', () => {
  const storage = new MemoryStorage()
  saveConversationTurn(storage, turn({ clientMessageId: 'new-message', content: 'new content' }))

  assert.equal(clearConversationTurn(storage, 'conversation-a', 'old-message'), false)
  assert.equal(readConversationTurn(storage, 'conversation-a', { createId: () => 'unused', interfaceLocale: 'zh-CN' })?.content, 'new content')
})

test('editing restored content creates a separately storable transaction', () => {
  const storage = new MemoryStorage()
  saveConversationTurn(storage, turn())
  saveConversationTurn(storage, turn({ clientMessageId: 'message-b', content: 'edited' }))

  const stored = readConversationTurn(storage, 'conversation-a', { createId: () => 'unused', interfaceLocale: 'zh-CN' })
  assert.equal(stored?.clientMessageId, 'message-b')
  assert.equal(stored?.content, 'edited')
})

test('legacy draft keys migrate without losing retry content', () => {
  const storage = new MemoryStorage()
  const draftKey = `${conversationDraftPrefix}conversation-a`
  storage.setItem(draftKey, ' legacy draft ')
  storage.setItem(`${draftKey}-message-id`, 'legacy-message')

  const stored = readConversationTurn(storage, 'conversation-a', {
    createId: () => 'generated-message',
    interfaceLocale: 'zh-CN',
    now: () => '2026-11-17T00:00:00.000Z',
  })

  assert.equal(stored?.content, 'legacy draft')
  assert.equal(stored?.clientMessageId, 'legacy-message')
  assert.equal(storage.getItem(draftKey), null)
  assert.ok(storage.getItem(conversationTurnKey('conversation-a')))
})

test('retryable state updates only the matching transaction', () => {
  const storage = new MemoryStorage()
  const stored = turn()
  saveConversationTurn(storage, stored)

  assert.equal(updateConversationTurnPhase(storage, stored, 'retryable'), true)
  assert.equal(readConversationTurn(storage, 'conversation-a', { createId: () => 'unused', interfaceLocale: 'zh-CN' })?.phase, 'retryable')
})

test('restricted storage does not make submission state helpers throw', () => {
  const storage: TurnStorage = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') },
    removeItem() { throw new Error('blocked') },
  }
  assert.equal(saveConversationTurn(storage, turn()), false)
  assert.equal(readConversationTurn(storage, 'conversation-a', { createId: () => 'message', interfaceLocale: 'zh-CN' }), null)
  assert.equal(clearConversationTurn(storage, 'conversation-a', 'message'), true)
})
