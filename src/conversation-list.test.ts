import assert from 'node:assert/strict'
import test from 'node:test'
import { compactConversationText, conversationDisplayTitle, conversationPreview, truncateConversationTitle, type ConversationListItem } from './conversation-list.js'

const direct: ConversationListItem = {
  id: 'direct', mode: 'conversation', title: 'Direct chat', kind: 'direct',
  firstMessage: '  I want to talk\nabout quiet beaches.  ', status: 'active', createdAt: '', updatedAt: '',
}
const scene: ConversationListItem = {
  id: 'scene', mode: 'conversation', title: 'Coffee shop', kind: 'scene',
  firstMessage: 'Could I get a latte?', status: 'active', createdAt: '', updatedAt: '',
}

test('direct chats use the first user message as their recognizable title', () => {
  assert.equal(conversationDisplayTitle(direct, 'Direct chat'), 'I want to talk about quiet beaches.')
  assert.equal(conversationPreview(direct), '')
})

test('scene chats retain the scene title and expose the first user message as context', () => {
  assert.equal(conversationDisplayTitle(scene, 'Direct chat'), 'Coffee shop')
  assert.equal(conversationPreview(scene), 'Could I get a latte?')
})

test('conversation text collapses line breaks and repeated whitespace', () => {
  assert.equal(compactConversationText(' one\n\n two  three '), 'one two three')
})

test('long conversation titles keep the recognizable beginning', () => {
  assert.equal(truncateConversationTitle('abcdefghijklmnopqrstuvwxyz', 10), 'abcdefghij…')
})
