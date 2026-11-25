import assert from 'node:assert/strict'
import test from 'node:test'
import { replyParts, toldInParts } from '../shared/reply.js'

test('a reply without parts is shown as the one line it is', () => {
  assert.deepEqual(replyParts('How was the market?'), [{ type: 'say', text: 'How was the market?' }])
  assert.deepEqual(replyParts('How was the market?', []), [{ type: 'say', text: 'How was the market?' }])
  assert.equal(toldInParts(undefined), false)
  assert.equal(toldInParts([]), false)
})

test('a reply told in several parts is shown part by part, in order, with who says each line', () => {
  const beats = [
    { type: 'narration', text: ' A man with a folder walks up. ' },
    { type: 'say', name: ' Marco ', text: 'Island hopping today?' },
    { type: 'say', text: 'Leave them alone.' },
  ]
  assert.deepEqual(replyParts('Island hopping today? Leave them alone.', beats), [
    { type: 'narration', text: 'A man with a folder walks up.' },
    { type: 'say', name: 'Marco', text: 'Island hopping today?' },
    { type: 'say', text: 'Leave them alone.' },
  ])
  assert.equal(toldInParts(beats), true)
})

test('a part of an unknown kind, or with nothing in it, is left out', () => {
  const beats = [{ type: 'pause', text: 'a long silence' }, { type: 'say', text: '   ' }, null, 'text', { type: 'say', name: 'Ana', text: 'Hi.' }]
  assert.deepEqual(replyParts('Hi.', beats), [{ type: 'say', name: 'Ana', text: 'Hi.' }])
  // With nothing left that can be shown, the reply is its one line again.
  assert.deepEqual(replyParts('Hi.', [{ type: 'pause', text: 'a long silence' }]), [{ type: 'say', text: 'Hi.' }])
  assert.equal(toldInParts([{ type: 'pause', text: 'a long silence' }]), false)
  assert.deepEqual(replyParts('Hi.', { type: 'say', text: 'not a list' }), [{ type: 'say', text: 'Hi.' }])
})
