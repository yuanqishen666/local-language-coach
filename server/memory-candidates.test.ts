import assert from 'node:assert/strict'
import test from 'node:test'
import { dedupeMemoryCandidates, filterConfirmedMemoryCandidates, memoryCandidateIsConfirmed } from './memory-candidates.js'

const confirmed = {
  category: 'personal',
  key: '职业',
  value: '软件工程师',
  status: 'confirmed',
  memoryType: 'profile',
  topic: 'work',
  sourceMessageId: 'user-1',
}

test('confirmed memory suppresses an identical candidate', () => {
  assert.deepEqual(filterConfirmedMemoryCandidates([
    { category: 'personal', key: '职业', value: ' 软件工程师 ', memoryType: 'profile', topic: 'work' },
  ], [confirmed]), [])
})

test('confirmed source suppresses its stale candidate after the memory value is edited', () => {
  assert.equal(memoryCandidateIsConfirmed({
    category: 'personal', key: '职业', value: '软件开发者', sourceMessageId: 'user-1',
  }, confirmed), true)
})

test('confirming one fact does not suppress another fact from the same user message', () => {
  assert.equal(memoryCandidateIsConfirmed({
    category: 'personal', key: '所在城市', value: '上海', sourceMessageId: 'user-1',
  }, confirmed), false)
})

test('same semantic slot and localized value suppress an alternate key', () => {
  assert.equal(memoryCandidateIsConfirmed({
    category: 'personal', key: 'occupation', value: 'software engineer', memoryType: 'profile', topic: 'work',
  }, { ...confirmed, localizedValuesJson: JSON.stringify({ 'en-US': 'Software Engineer' }) }), true)
})

test('a changed value for the same key remains an update candidate', () => {
  assert.deepEqual(filterConfirmedMemoryCandidates([
    { category: 'personal', key: '职业', value: '产品经理', memoryType: 'profile', topic: 'work' },
  ], [confirmed]), [
    { category: 'personal', key: '职业', value: '产品经理', memoryType: 'profile', topic: 'work' },
  ])
})

test('semantic slot recognizes the same dimension even when its localized key changes', () => {
  assert.equal(memoryCandidateIsConfirmed({
    category: 'personal', key: 'occupation', semanticSlot: 'profile.occupation', value: 'software engineer', memoryType: 'profile', topic: 'work',
  }, { ...confirmed, semanticSlot: 'profile.occupation', localizedValuesJson: JSON.stringify({ 'en-US': 'software engineer' }) }), true)
})

test('legacy localized occupation keys migrate to the canonical semantic slot', () => {
  assert.equal(memoryCandidateIsConfirmed({
    category: 'personal', key: 'occupation', semanticSlot: 'profile.occupation', value: 'software engineer', memoryType: 'profile', topic: 'work',
  }, { ...confirmed, localizedValuesJson: JSON.stringify({ 'en-US': 'software engineer' }) }), true)
})

test('candidate batches keep only the latest fact for one semantic slot', () => {
  const candidates = dedupeMemoryCandidates([
    { category: 'personal', key: '职业', semanticSlot: 'profile.occupation', value: '软件工程师' },
    { category: 'personal', key: '工作', semanticSlot: 'profile.occupation', value: '产品经理' },
  ])
  assert.deepEqual(candidates, [
    { category: 'personal', key: '工作', semanticSlot: 'profile.occupation', value: '产品经理' },
  ])
})
