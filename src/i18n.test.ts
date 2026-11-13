import assert from 'node:assert/strict'
import test from 'node:test'
import { UI_LOCALES } from '../shared/locales.js'
import { buildMessages } from './i18n/copy.js'

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child && typeof child === 'object'
      ? Object.entries(flatten(child as Record<string, unknown>, path))
      : [[path, String(child ?? '')]]
  }))
}

test('all ten interface languages contain the same non-empty UI keys', () => {
  const messages = buildMessages()
  assert.equal(UI_LOCALES.length, 10)
  const reference = Object.keys(flatten(messages['zh-CN'])).sort()
  for (const locale of UI_LOCALES) {
    const localized = flatten(messages[locale])
    assert.deepEqual(Object.keys(localized).sort(), reference, locale)
    assert.deepEqual(Object.entries(localized).filter(([, value]) => !value.trim()), [], locale)
  }
})
