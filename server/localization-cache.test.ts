import assert from 'node:assert/strict'
import test from 'node:test'
import { lookupCacheKey } from './utils/ai-cache-key.js'
import { translationCacheKey } from './utils/translation-cache.js'

test('lookup and translation caches are isolated by interface language', () => {
  const lookup = {
    term: 'chat', sentence: 'We had a chat.', targetLanguage: 'English', targetLanguageCode: 'en',
  }
  assert.notEqual(
    lookupCacheKey({ ...lookup, interfaceLocale: 'zh-CN' }),
    lookupCacheKey({ ...lookup, interfaceLocale: 'es-419' }),
  )
  const translation = { content: 'How are you?', targetLanguageCode: 'en', setup: null }
  assert.notEqual(
    translationCacheKey({ ...translation, interfaceLocale: 'zh-CN' }),
    translationCacheKey({ ...translation, interfaceLocale: 'es-419' }),
  )
})
