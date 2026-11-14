import assert from 'node:assert/strict'
import test from 'node:test'
import { visibleConversationMessages } from './conversation-messages.js'

test('a failed send stays visible until the same text is successfully resent', () => {
  const failed = { id: 'failed', role: 'user', status: 'failed', content: 'hello' }
  assert.deepEqual(visibleConversationMessages([failed]), [failed])
  assert.deepEqual(visibleConversationMessages([
    failed,
    { id: 'complete', role: 'user', status: 'complete', content: ' hello ' },
    { id: 'reply', role: 'assistant', status: 'complete', content: 'Hi.' },
  ]).map((message) => message.id), ['complete', 'reply'])
})

test('failed sends with different content are not hidden', () => {
  assert.deepEqual(visibleConversationMessages([
    { id: 'failed', role: 'user', status: 'failed', content: 'first' },
    { id: 'complete', role: 'user', status: 'complete', content: 'second' },
  ]).map((message) => message.id), ['failed', 'complete'])
})
