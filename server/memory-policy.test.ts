import assert from 'node:assert/strict'
import test from 'node:test'
import {
  asksToRemember, layerOf, memoriesInScope, memoryDestination, memoryExpired, memoryValidTo, scopedSemanticSlot, settleMemoryKind, tierForExtractedFact,
} from './memory-policy.js'

test('the kind of a memory decides its layer', () => {
  assert.equal(layerOf('learning'), 'learning')
  assert.equal(layerOf('plan'), 'plan')
  assert.equal(layerOf('preference'), 'about')
  assert.equal(layerOf('style'), 'about')
  // Kinds stored before the layers existed.
  assert.equal(layerOf('episodic'), 'plan')
  assert.equal(layerOf(undefined), 'about')
})

test('nothing said inside a scene becomes a long-term memory on the model’s word alone', () => {
  for (const about of ['user', 'persona', 'other'] as const) {
    for (const durability of ['lasting', 'temporary', 'momentary'] as const) {
      for (const explicit of [true, false]) {
        assert.notEqual(memoryDestination({ frame: 'scene', about, durability, explicit }), 'save')
      }
    }
  }
})

test('what the part being played says stays with the conversation and is not asked about', () => {
  assert.equal(memoryDestination({ frame: 'scene', about: 'persona', durability: 'lasting', explicit: false }), 'conversation')
  assert.equal(memoryDestination({ frame: 'scene', about: 'persona', durability: 'temporary', explicit: true }), 'conversation')
  assert.equal(memoryDestination({ frame: 'scene', about: 'user', durability: 'momentary', explicit: false }), 'conversation')
  assert.equal(memoryDestination({ frame: 'direct', about: 'user', durability: 'momentary', explicit: false }), 'conversation')
})

test('a lasting fact about the real learner is offered, in a scene as well', () => {
  assert.equal(memoryDestination({ frame: 'scene', about: 'user', durability: 'lasting', explicit: false }), 'ask')
  assert.equal(memoryDestination({ frame: 'scene', about: 'user', durability: 'temporary', explicit: false }), 'ask')
  assert.equal(memoryDestination({ frame: 'direct', about: 'user', durability: 'lasting', explicit: false }), 'ask')
})

test('only a direct request to remember is stored without asking', () => {
  assert.equal(memoryDestination({ frame: 'direct', about: 'user', durability: 'lasting', explicit: true }), 'save')
  assert.equal(memoryDestination({ frame: 'direct', about: 'user', durability: 'temporary', explicit: true }), 'save')
  assert.equal(memoryDestination({ frame: 'direct', about: 'other', durability: 'lasting', explicit: true }), 'drop')
})

test('a request to remember is recognised from the learner’s own words', () => {
  assert.equal(asksToRemember('记住，我对花生过敏'), true)
  assert.equal(asksToRemember('Please remember that I am vegetarian.'), true)
  assert.equal(asksToRemember('覚えておいてください'), true)
  assert.equal(asksToRemember('I like quiet beaches.'), false)
})

test('something that holds for a while is a plan and gets an end', () => {
  assert.equal(settleMemoryKind('preference', 'temporary'), 'plan')
  assert.equal(settleMemoryKind('preference', 'lasting'), 'preference')
  assert.equal(settleMemoryKind('learning', 'temporary'), 'learning')
  const now = new Date('2026-11-20T00:00:00.000Z')
  assert.equal(memoryValidTo('plan', 'temporary', 10, now), '2026-11-30T00:00:00.000Z')
  assert.equal(memoryValidTo('plan', 'temporary', 0, now), '2026-12-20T00:00:00.000Z')
  assert.equal(memoryValidTo('plan', 'lasting', undefined, now), '2026-12-20T00:00:00.000Z')
  assert.equal(memoryValidTo('preference', 'lasting', 10, now), undefined)
  assert.equal(memoryValidTo('learning', 'temporary', 60, now), '2027-01-19T00:00:00.000Z')
  assert.equal(memoryExpired('2026-11-19T00:00:00.000Z', now), true)
  assert.equal(memoryExpired('2026-11-21T00:00:00.000Z', now), false)
  assert.equal(memoryExpired(null, now), false)
})

test('a scene sees hard constraints, how to speak to the learner, and learning, and nothing else about them', () => {
  const memories = [
    { id: 'job', memoryType: 'profile' },
    { id: 'jazz', memoryType: 'preference' },
    { id: 'allergy', memoryType: 'constraint' },
    { id: 'corrections', memoryType: 'style' },
    { id: 'trip', memoryType: 'plan' },
    { id: 'goal-en', memoryType: 'learning', targetLanguageCode: 'en' },
    { id: 'goal-ja', memoryType: 'learning', targetLanguageCode: 'ja' },
    { id: 'goal-any', memoryType: 'learning', targetLanguageCode: '' },
  ]
  assert.deepEqual(memoriesInScope(memories, { frame: 'scene', targetLanguageCode: 'en' }).map((memory) => memory.id), ['allergy', 'corrections', 'goal-en', 'goal-any'])
  assert.deepEqual(memoriesInScope(memories, { frame: 'direct', targetLanguageCode: 'ja' }).map((memory) => memory.id), ['job', 'jazz', 'allergy', 'corrections', 'trip', 'goal-ja', 'goal-any'])
})

test('learning memories are kept apart by learning language', () => {
  assert.equal(scopedSemanticSlot('learning.exam-goal', 'learning', 'ja'), 'learning.exam-goal:ja')
  assert.equal(scopedSemanticSlot('learning.exam-goal:ja', 'learning', 'ja'), 'learning.exam-goal:ja')
  assert.equal(scopedSemanticSlot('profile.occupation', 'profile', 'ja'), 'profile.occupation')
})

test('ordinary preferences and plans cannot be made core by model output alone', () => {
  assert.equal(tierForExtractedFact({ memoryType: 'preference', importance: 1, suggestedTier: 'core' }), 'long_term')
  assert.equal(tierForExtractedFact({ memoryType: 'plan', importance: 1, suggestedTier: 'core' }), 'long_term')
})

test('durable constraints, learning rules, and essential profiles may become core', () => {
  assert.equal(tierForExtractedFact({ memoryType: 'constraint', importance: 0.7, suggestedTier: 'core' }), 'core')
  assert.equal(tierForExtractedFact({ memoryType: 'style', importance: 0.7, suggestedTier: 'core' }), 'core')
  assert.equal(tierForExtractedFact({ memoryType: 'learning', importance: 0.8, suggestedTier: 'core' }), 'core')
  assert.equal(tierForExtractedFact({ memoryType: 'profile', importance: 0.95, suggestedTier: 'core' }), 'core')
  assert.equal(tierForExtractedFact({ memoryType: 'profile', importance: 0.8, suggestedTier: 'core' }), 'long_term')
})

test('an existing core memory is not demoted by a later extraction', () => {
  assert.equal(tierForExtractedFact({ memoryType: 'preference', importance: 0.4, suggestedTier: 'long_term' }, 'core'), 'core')
})
