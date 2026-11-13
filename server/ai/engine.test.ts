import assert from 'node:assert/strict'
import test from 'node:test'
import { naturalReplyIssues, normalizeMemoryAnalysis, normalizeTurnAnalysis } from './engine.js'

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
    dialoguePlan: {
      mode: 'casual', anchorQuote: 'i like seasite', anchorMeaning: 'The learner likes the seaside.',
      move: 'observe', topic: 'beach', branch: 'quiet-beaches', contribution: 'Quiet beaches can feel restorative.',
      questionPolicy: 'optional', questionPurpose: 'Learn what kind of beach they enjoy.', previousMoveOutcome: 'none', callbackMemoryKey: '不存在的键', reopenBranch: false,
    },
  }, 'emmm, i like seasite', ['海边偏好'])

  assert.deepEqual(normalized.corrections.map((item) => item.original), ['seasite'])
  assert.deepEqual(memory.userFacts.map((item) => item.key), ['海边偏好'])
  assert.equal(memory.userFacts[0].memoryType, 'preference')
  assert.equal(memory.userFacts[0].topic, 'beach')
  assert.deepEqual(memory.relevantMemoryKeys, ['海边偏好'])
  assert.equal(memory.dialoguePlan.anchorQuote, 'i like seasite')
  assert.equal(memory.dialoguePlan.callbackMemoryKey, '')
})

test('sensitive memories can be promoted to the always-injected core tier', () => {
  const memory = normalizeMemoryAnalysis({
    disposition: 'remember',
    userFacts: [{
      key: '健康限制', value: '有长期健康限制', quote: 'I have a health condition', sensitive: true,
      memoryType: 'constraint', topic: 'health', importance: 1, suggestedTier: 'core',
    }],
    replyType: 'support', relevantTopics: ['health'], relevantMemoryKeys: [],
    dialoguePlan: {
      mode: 'support', anchorQuote: 'I have a health condition', anchorMeaning: 'The learner has a health condition.',
      move: 'react', topic: 'health', branch: '', contribution: 'Acknowledge the constraint without prying.',
      questionPolicy: 'none', questionPurpose: '', previousMoveOutcome: 'none', callbackMemoryKey: '', reopenBranch: false,
    },
  }, 'I have a health condition', [])

  assert.equal(memory.userFacts[0].suggestedTier, 'core')
})

test('reply validation enforces the local question budget', () => {
  const issues = naturalReplyIssues(
    'That puts developers right in the middle of the AI shift. Do you use it often?',
    [],
    false,
    { questionBudget: 0, questionRequired: false, mustContribute: true, allowedBranch: 'ai-at-work', forbiddenBranches: [], reason: 'recent_question_streak' },
  )
  assert.ok(issues.some((issue) => issue.includes('no question budget')))
})

test('reply validation catches a repeated conversational opening', () => {
  const issues = naturalReplyIssues(
    'That is really interesting, especially for backend work.',
    [{ id: 'a1', role: 'assistant', content: 'That is really interesting to hear about your work.' }],
    false,
  )
  assert.ok(issues.some((issue) => issue.includes('opening')))
})
