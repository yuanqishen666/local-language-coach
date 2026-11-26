import assert from 'node:assert/strict'
import test from 'node:test'
import { requestReviewDueRefresh, REVIEW_DUE_REFRESH_EVENT } from './review-due'

test('wordbook changes request an immediate refresh of every due-review badge', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const browserWindow = new EventTarget()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow })
  let refreshes = 0
  browserWindow.addEventListener(REVIEW_DUE_REFRESH_EVENT, () => { refreshes += 1 })

  try {
    requestReviewDueRefresh()
    assert.equal(refreshes, 1)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
