import assert from 'node:assert/strict'
import test from 'node:test'
import { composerKeys, keyboardPlatform } from './platform'

test('recognises an Apple keyboard from whichever platform field the browser provides', () => {
  assert.equal(keyboardPlatform({ userAgentData: { platform: 'macOS' } }), 'mac')
  assert.equal(keyboardPlatform({ platform: 'MacIntel' }), 'mac')
  assert.equal(keyboardPlatform({ platform: 'iPad' }), 'mac')
  assert.equal(keyboardPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' }), 'mac')

  assert.equal(keyboardPlatform({ userAgentData: { platform: 'Windows' } }), 'other')
  assert.equal(keyboardPlatform({ platform: 'Win32' }), 'other')
  assert.equal(keyboardPlatform({ platform: 'Linux x86_64' }), 'other')
  assert.equal(keyboardPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' }), 'other')
  assert.equal(keyboardPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0' }), 'other')
  assert.equal(keyboardPlatform({}), 'other')
})

test('the newer platform field wins over the older ones', () => {
  assert.equal(keyboardPlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' }), 'other')
  assert.equal(keyboardPlatform({ userAgentData: { platform: '' }, platform: 'MacIntel' }), 'mac')
})

test('keys are named the way they are printed on the keyboard', () => {
  assert.deepEqual(composerKeys('mac'), { send: ['Return'], newline: ['Shift', 'Return'] })
  assert.deepEqual(composerKeys('other'), { send: ['Enter'], newline: ['Shift', 'Enter'] })
})
