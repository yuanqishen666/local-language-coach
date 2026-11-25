import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { aboveComposer, addAboveComposer } from './conversation-extras'

test('what is added above the message box is kept in the order it was added', () => {
  const first = { name: 'First' }
  const second = { name: 'Second' }
  addAboveComposer(first)
  addAboveComposer(second)
  assert.deepEqual([...aboveComposer], [first, second])
})

test('every design of the conversation page shows what was added, and hands it the conversation', () => {
  for (const design of ['paper', 'night', 'blocks', 'core', 'daily']) {
    const page = readFileSync(new URL(`./lab/${design}/Conversation.vue`, import.meta.url), 'utf8')
    assert.match(page, /<component :is="extra" v-for="\(extra, at\) in aboveComposer" :key="at" :conversation="conversation" \/>/u, design)
  }
})
