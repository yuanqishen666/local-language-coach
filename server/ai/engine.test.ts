import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { explicitMemoryClauses, generateStructured, naturalReplyIssues, normalizeMemoryAnalysis, normalizeTurnAnalysis } from './engine.js'
import { ProviderRequestError } from './provider.js'

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

test('turn analysis normalizes a provider string reconstruction instead of failing the turn', () => {
  const latestUser = 'emmm，随着 AI 的发展，软件工程师已经变成写文档给 AI，让 AI 来写代码。'
  const normalized = normalizeTurnAnalysis({
    lookup: {
      action: 'reply',
      parts: [{ text: 'AI 改变软件工程师的工作方式', needsLookup: false, reason: 'stable', subject: 'AI-assisted software development' }],
      query: '',
      locator: null,
    },
    reconstruction: 'With the development of AI, software engineers now write specifications for AI and let it write the code.',
    corrections: [{ original: '随着 AI 的发展', improved: 'With the development of AI', explanation: '把中文意思自然地接成英文。', severity: 'naturalness' }],
  }, latestUser)

  assert.deepEqual(normalized.reconstruction, {
    type: 'completion',
    original: latestUser,
    improved: 'With the development of AI, software engineers now write specifications for AI and let it write the code.',
    explanation: '把中文意思自然地接成英文。',
  })
})

test('turn analysis does not reinterpret unrelated fields as reconstruction', () => {
  const normalized = normalizeTurnAnalysis({
    lookup: {
      action: 'reply',
      parts: [{ text: 'learner intent', needsLookup: false, reason: 'stable', subject: 'intent' }],
      query: '',
      locator: null,
    },
    translation: 'This field belongs to another contract.',
    reconstructedSentence: 'This alias was never observed from a configured provider.',
    reconstruction: null,
    corrections: [],
  }, 'latest message')

  assert.equal(normalized.reconstruction, null)

  const existingObjectBehavior = normalizeTurnAnalysis({
    lookup: {
      action: 'reply',
      parts: [{ text: 'learner intent', needsLookup: false, reason: 'stable', subject: 'intent' }],
      query: '',
      locator: null,
    },
    reconstruction: { improved: 'A corrected sentence.' },
    corrections: [],
  }, 'latest message')
  assert.deepEqual(existingObjectBehavior.reconstruction, {
    type: 'correction',
    original: '',
    improved: 'A corrected sentence.',
    explanation: '',
  })
})

test('an invalid structured stage retries and then reports the error instead of silently degrading', async () => {
  let calls = 0
  const client = {
    id: 'test',
    outputMode: 'prompt_json' as const,
    async generate() {
      calls += 1
      return '{"value":""}'
    },
  }

  await assert.rejects(
    generateStructured(client, [], {
      name: 'required_value',
      schema: z.object({ value: z.string().min(1) }),
      hint: '{"value":"required"}',
      temperature: 0,
      attempts: 2,
      normalize: (value) => value as { value: string },
      usable: () => true,
    }),
    (error: unknown) => error instanceof ProviderRequestError && error.code === 'PROVIDER_INVALID_RESPONSE',
  )
  assert.equal(calls, 2)
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

test('memory analysis keeps only the latest fact for one semantic slot', () => {
  const latestUser = 'I used to be a developer, but now I am a product manager.'
  const normalized = normalizeMemoryAnalysis({
    disposition: 'remember',
    userFacts: [
      { key: '职业', semanticSlot: 'profile.occupation', value: '软件工程师', quote: 'developer', sensitive: false, memoryType: 'profile', topic: 'work', importance: 0.7, suggestedTier: 'long_term' },
      { key: '职业', semanticSlot: 'profile.occupation', value: '产品经理', quote: 'product manager', sensitive: false, memoryType: 'profile', topic: 'work', importance: 0.7, suggestedTier: 'long_term' },
    ],
    replyType: 'casual', relevantTopics: ['work'], relevantMemoryKeys: [],
    dialoguePlan: {
      mode: 'casual', anchorQuote: 'product manager', anchorMeaning: 'The user changed jobs.', move: 'react', topic: 'work', branch: '', contribution: 'Acknowledge the change.',
      questionPolicy: 'none', questionPurpose: '', previousMoveOutcome: 'none', callbackMemoryKey: '', reopenBranch: false,
    },
  }, latestUser, [])

  assert.equal(normalized.userFacts.length, 1)
  assert.equal(normalized.userFacts[0].value, '产品经理')
})

test('explicit durable clauses are counted separately for extraction coverage', () => {
  assert.deepEqual(explicitMemoryClauses("I'm a software engineer. I'm allergic to shellfish. I prefer quiet beaches."), [
    "I'm a software engineer.",
    "I'm allergic to shellfish.",
    'I prefer quiet beaches.',
  ])
  assert.deepEqual(explicitMemoryClauses('I am tired today. The weather is nice.'), [])
  assert.deepEqual(explicitMemoryClauses('我是一名工程师。我对贝类过敏。我喜欢安静的海边。'), [
    '我是一名工程师。',
    '我对贝类过敏。',
    '我喜欢安静的海边。',
  ])
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
