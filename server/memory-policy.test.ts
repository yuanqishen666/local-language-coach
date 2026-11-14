import assert from 'node:assert/strict'
import test from 'node:test'
import { memoryCategoryForType, tierForExtractedFact } from './memory-policy.js'

test('memory types map to stable storage categories', () => {
  assert.equal(memoryCategoryForType('learning'), 'learning')
  assert.equal(memoryCategoryForType('episodic'), 'scene')
  assert.equal(memoryCategoryForType('preference'), 'personal')
})

test('ordinary preferences and episodes cannot be promoted by model output alone', () => {
  assert.equal(tierForExtractedFact({ memoryType: 'preference', importance: 1, suggestedTier: 'core' }), 'long_term')
  assert.equal(tierForExtractedFact({ memoryType: 'episodic', importance: 1, suggestedTier: 'core' }), 'long_term')
})

test('durable constraints, learning rules, and essential profiles may become core', () => {
  assert.equal(tierForExtractedFact({ memoryType: 'constraint', importance: 0.7, suggestedTier: 'core' }), 'core')
  assert.equal(tierForExtractedFact({ memoryType: 'learning', importance: 0.8, suggestedTier: 'core' }), 'core')
  assert.equal(tierForExtractedFact({ memoryType: 'profile', importance: 0.95, suggestedTier: 'core' }), 'core')
  assert.equal(tierForExtractedFact({ memoryType: 'profile', importance: 0.8, suggestedTier: 'core' }), 'long_term')
})

test('an existing core memory is not demoted by a later extraction', () => {
  assert.equal(tierForExtractedFact({ memoryType: 'preference', importance: 0.4, suggestedTier: 'long_term' }, 'core'), 'core')
})
