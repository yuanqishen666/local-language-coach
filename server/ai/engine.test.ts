import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeMemoryAnalysis, normalizeTurnAnalysis } from './engine.js'

test('turn analysis keeps only feedback and facts grounded in the latest message', () => {
  const normalized = normalizeTurnAnalysis({
    lookup: {
      action: 'reply',
      parts: [{ text: 'beach preference', needsLookup: false, reason: 'stable', subject: 'beaches' }],
      query: '',
      locator: null,
    },
    reconstruction: null,
    corrections: [
      { original: 'seasite', improved: 'the seaside', explanation: '拼写和搭配错误。', severity: 'meaning' },
      { original: 'a beach', improved: 'the beach', explanation: 'Not in the message.', severity: 'minor' },
    ],
  }, 'emmm, i like seasite')

  const memory = normalizeMemoryAnalysis({
    disposition: 'remember',
    userFacts: [
      { key: '海边偏好', value: '喜欢安静的海边', quote: 'i like seasite', sensitive: false, memoryType: 'preference', topic: 'beach', importance: 0.8, suggestedTier: 'long_term' },
      { key: '住宿偏好', value: '喜欢酒店', quote: 'hotel', sensitive: false },
    ],
    replyType: 'casual',
    relevantTopics: ['beach'],
    relevantMemoryKeys: ['海边偏好', '不存在的键'],
  }, 'emmm, i like seasite', ['海边偏好'])

  assert.deepEqual(normalized.corrections.map((item) => item.original), ['seasite'])
  assert.deepEqual(memory.userFacts.map((item) => item.key), ['海边偏好'])
  assert.equal(memory.userFacts[0].memoryType, 'preference')
  assert.equal(memory.userFacts[0].topic, 'beach')
  assert.deepEqual(memory.relevantMemoryKeys, ['海边偏好'])
})

test('sensitive memories cannot be promoted to the always-injected core tier', () => {
  const memory = normalizeMemoryAnalysis({
    disposition: 'remember',
    userFacts: [{
      key: '健康限制', value: '有长期健康限制', quote: 'I have a health condition', sensitive: true,
      memoryType: 'constraint', topic: 'health', importance: 1, suggestedTier: 'core',
    }],
    replyType: 'support', relevantTopics: ['health'], relevantMemoryKeys: [],
  }, 'I have a health condition', [])

  assert.equal(memory.userFacts[0].suggestedTier, 'long_term')
})
