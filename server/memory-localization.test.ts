import assert from 'node:assert/strict'
import test from 'node:test'
import { localizedMemoryForInterface } from './memory-localization.js'

const memory = {
  id: 'm1', value: '软件工程师', interfaceLocale: 'zh-CN',
  localizedValuesJson: JSON.stringify({ 'de-DE': 'Softwareingenieur' }),
}

test('memory localization uses the requested cached value when available', () => {
  assert.deepEqual(localizedMemoryForInterface(memory, 'de-DE'), {
    ...memory, value: 'Softwareingenieur', interfaceLocale: 'de-DE', localizationFallback: false,
  })
})

test('memory localization keeps the original value when localization is unavailable', () => {
  assert.deepEqual(localizedMemoryForInterface(memory, 'fr-FR'), {
    ...memory, localizationFallback: true,
  })
})
