import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isNearConversationEnd, restoreFailedComposer } from './conversation-scroll.js'

test('conversation end detection keeps a small tolerance without treating older reading positions as the end', () => {
  assert.equal(isNearConversationEnd({ scrollTop: 528, scrollHeight: 1_200, clientHeight: 600 }), true)
  assert.equal(isNearConversationEnd({ scrollTop: 420, scrollHeight: 1_200, clientHeight: 600 }), false)
})

test('a failed turn restores its source without discarding a draft written while waiting', () => {
  assert.equal(restoreFailedComposer('First thought', ''), 'First thought')
  assert.equal(restoreFailedComposer('First thought', 'Next thought'), 'First thought\n\nNext thought')
})

test('conversation notes keep their own grid row and never overlap the learner bubble', () => {
  const css = readFileSync(new URL('./lab/daily/pages.css', import.meta.url), 'utf8')
  const messageRule = css.match(/\.y-msg\s*\{([^}]+)\}/u)?.[1] || ''
  const toggleRule = css.match(/\.y-notes-toggle\s*\{([^}]+)\}/u)?.[1] || ''
  assert.match(messageRule, /display:\s*grid/u)
  assert.match(messageRule, /gap:\s*[1-9][\d.]*px/u)
  assert.doesNotMatch(toggleRule, /margin:\s*-/u)
  assert.doesNotMatch(toggleRule, /margin-(?:top|block-start):\s*-/u)
  assert.doesNotMatch(toggleRule, /transform:\s*translateY\s*\(\s*-/u)
})
