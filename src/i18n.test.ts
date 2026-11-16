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

test('pronunciation button copy switches correctly in all ten interface languages', () => {
  const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: false, messages: buildMessages() })
  const expected = {
    'zh-CN': '播放发音',
    'en-US': 'Play pronunciation',
    'es-419': 'Escuchar pronunciación',
    'fr-FR': 'Écouter la prononciation',
    'ja-JP': '発音を聞く',
    'de-DE': 'Aussprache anhören',
    'ko-KR': '발음 듣기',
    'it-IT': 'Ascolta la pronuncia',
    'pt-BR': 'Ouvir pronúncia',
    'hi-IN': 'उच्चारण सुनें',
  } as const

  for (const locale of UI_LOCALES) {
    i18n.global.locale.value = locale
    assert.equal(i18n.global.t('speech.play'), expected[locale], locale)
  }
})

test('read-aloud settings copy is complete and interpolates the language in every interface language', () => {
  const messages = buildMessages()
  const keys = [
    'settings.pronunciationTitle',
    'settings.pronunciationHelp',
    'settings.speechRate',
    'settings.speechRateValue',
    'settings.speechRateHelp',
    'settings.speechSlower',
    'settings.speechFaster',
    'settings.speechUnavailable',
    'settings.speechRecommendationMac',
    'settings.speechRecommendationWindows',
    'settings.speechRecommendationLinux',
    'settings.speechRecommendationOther',
  ]
  const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: false, messages })
  for (const locale of UI_LOCALES) {
    const localized = flatten(messages[locale])
    for (const key of keys) assert.ok(localized[key]?.trim(), `${locale}: ${key}`)
    i18n.global.locale.value = locale
    const unavailable = i18n.global.t('settings.speechUnavailable', { language: 'English' })
    assert.match(unavailable, /English/u, locale)
    assert.doesNotMatch(unavailable, /\{language\}/u, locale)
  }

  const chinese = Object.values(flatten(messages['zh-CN'])).join('\n')
  const english = Object.values(flatten(messages['en-US'])).join('\n')
  assert.doesNotMatch(chinese, /可信音色/u)
  assert.doesNotMatch(english, /trusted voice/iu)
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
