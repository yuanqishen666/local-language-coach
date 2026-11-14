import assert from 'node:assert/strict'
import test from 'node:test'
import { UI_LOCALES } from '../shared/locales.js'
import { shouldSubmitComposer } from './composer-keydown.js'

test('all ten interface languages share the same IME-safe Enter behavior', () => {
  assert.equal(UI_LOCALES.length, 10)
  for (const locale of UI_LOCALES) {
    assert.equal(shouldSubmitComposer({ key: 'Enter', keyCode: 13 }, true), false, locale)
    assert.equal(shouldSubmitComposer({ key: 'Enter', isComposing: true }), false, locale)
    assert.equal(shouldSubmitComposer({ key: 'Enter', isComposing: false, keyCode: 229 }), false, locale)
    assert.equal(shouldSubmitComposer({ key: 'Enter', isComposing: false, keyCode: 13 }), true, locale)
  }
})

test('Shift+Enter remains available for a new line', () => {
  assert.equal(shouldSubmitComposer({ key: 'Enter', shiftKey: true }), false)
  assert.equal(shouldSubmitComposer({ key: 'a' }), false)
})
