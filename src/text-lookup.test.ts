import assert from 'node:assert/strict'
import test from 'node:test'
import { LOOKUP_TERM_LIMIT, normalizeLookupTerm, wordAtTextOffset } from './text-lookup'

test('normalizes selected text while preserving a phrase', () => {
  assert.equal(normalizeLookupTerm('  cafe\u0301 au lait  '), 'caf\u00e9 au lait')
  assert.equal(normalizeLookupTerm('   '), '')
})

test('rejects selections that are too large for a term lookup', () => {
  assert.equal(normalizeLookupTerm('a'.repeat(LOOKUP_TERM_LIMIT - 1)), 'a'.repeat(LOOKUP_TERM_LIMIT - 1))
  assert.equal(normalizeLookupTerm('a'.repeat(LOOKUP_TERM_LIMIT)), '')
})

test('finds the word under a long-press point', () => {
  assert.equal(wordAtTextOffset('written normally here', 10), 'normally')
  assert.equal(wordAtTextOffset('written normally here', 6), 'written')
  assert.equal(wordAtTextOffset('written normally here', 7), '')
  assert.equal(wordAtTextOffset('written normally here', 8), 'normally')
})
