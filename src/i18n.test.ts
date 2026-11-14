import assert from 'node:assert/strict'
import test from 'node:test'
import { createI18n } from 'vue-i18n'
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

test('memory copy stays category-neutral and German memory terminology is consistent', () => {
  const messages = buildMessages()
  for (const locale of UI_LOCALES) {
    const localized = flatten(messages[locale])
    assert.ok(localized['conversation.memoryUpdateTitle'].trim(), locale)
    assert.ok(localized['memories.coreLimit'].length > localized['memories.coreCount'].length, locale)
  }
  const german = Object.values(flatten(messages['de-DE'])).join('\n')
  assert.equal(/Merkliste|Merkeintrag|Kerngedächtnis/u.test(german), false)
})

test('memory reference counts use the correct singular and plural form in every interface language', () => {
  const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: false, messages: buildMessages() })
  const expected = {
    'zh-CN': ['参考 1 次', '参考 2 次'],
    'en-US': ['Considered 1 time', 'Considered 2 times'],
    'es-419': ['Consultada 1 vez', 'Consultada 2 veces'],
    'fr-FR': ['Consultée 1 fois', 'Consultée 2 fois'],
    'ja-JP': ['1回参照', '2回参照'],
    'de-DE': ['1-mal berücksichtigt', '2-mal berücksichtigt'],
    'ko-KR': ['1회 참고', '2회 참고'],
    'it-IT': ['Consultata 1 volta', 'Consultata 2 volte'],
    'pt-BR': ['Considerada 1 vez', 'Considerada 2 vezes'],
    'hi-IN': ['1 बार संदर्भ में ली गई', '2 बार संदर्भ में ली गई'],
  } as const

  for (const locale of UI_LOCALES) {
    i18n.global.locale.value = locale
    assert.equal(i18n.global.t('memories.usedCount', 1), expected[locale][0], locale)
    assert.equal(i18n.global.t('memories.usedCount', 2), expected[locale][1], locale)
  }
})
