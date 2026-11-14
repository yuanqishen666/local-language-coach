import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeRecentDialogue, mergeConversationState, normalizeConversationState, selectRelevantEpisodes, selectRelevantMemories } from './context.js'

const memories = [
  { category: 'personal', key: '海边偏好', value: '喜欢安静、人少、水清的海边' },
  { category: 'learning', key: '英语学习目标', value: '希望练习日常口语' },
]

test('semantic memory keys bridge synonyms and languages for recommendations', () => {
  const selected = selectRelevantMemories(
    memories,
    'Could you recommend a seaside destination?',
    '',
    4,
    ['海边偏好'],
  )
  assert.deepEqual(selected, [memories[0]])
})

test('unrelated recent memories are not injected as context', () => {
  const selected = selectRelevantMemories(memories, 'How do I cook this pasta?', '', 4)
  assert.deepEqual(selected, [])
})

test('every core memory is always present, while unrelated long-term memory stays routed', () => {
  const core = { id: 'core-1', category: 'personal', key: '称呼偏好', value: '喜欢被叫作 Alex', tier: 'core', memoryType: 'profile', importance: 0.9 }
  const constraint = { id: 'core-2', category: 'personal', key: '对话约束', value: '不要连续提问', tier: 'core', memoryType: 'constraint', importance: 1 }
  const unrelated = { id: 'long-1', category: 'personal', key: '海边偏好', value: '喜欢安静海边', tier: 'long_term', topic: 'travel' }
  const selected = selectRelevantMemories([unrelated, core, constraint], 'How do I cook this pasta?', '', 4)
  assert.deepEqual(selected, [constraint, core])
})

test('all fifteen core memories are injected and long-term routing keeps its own bound', () => {
  const ordinaryCore = { id: 'core-profile', category: 'personal', key: '职业背景', value: '软件开发', tier: 'core', memoryType: 'profile', topic: 'work' }
  const constraints = Array.from({ length: 14 }, (_, index) => ({
    id: `constraint-${index}`, category: 'personal', key: `约束 ${index}`, value: `constraint ${index}`,
    tier: 'core', memoryType: 'constraint', topic: 'work', importance: 1 - index * 0.01,
  }))
  const longTerm = Array.from({ length: 8 }, (_, index) => ({
    id: `long-${index}`, category: 'personal', key: `工作偏好 ${index}`, value: `software preference ${index}`,
    tier: 'long_term', memoryType: 'preference', topic: 'work', importance: 0.8,
  }))
  const selected = selectRelevantMemories([ordinaryCore, ...constraints, ...longTerm], 'Tell me about my work', '', 4, ['职业背景'], ['work'], 'casual')
  assert.ok(selected.includes(ordinaryCore))
  assert.equal(selected.filter((memory) => memory.tier === 'core').length, 15)
  assert.equal(selected.filter((memory) => memory.tier === 'long_term').length, 4)
})

test('reply topic is a soft routing signal for long-term memory', () => {
  const beach = { id: 'beach-1', category: 'personal', key: '度假环境偏好', value: '喜欢人少水清的地方', tier: 'long_term', memoryType: 'preference', topic: 'beach' }
  const selected = selectRelevantMemories([beach], 'Can you recommend somewhere?', '', 4, [], ['beach'], 'recommendation')
  assert.deepEqual(selected, [beach])
})

test('a statement followed by a question still counts as a question turn', () => {
  const dynamics = analyzeRecentDialogue([
    { id: 'a1', role: 'assistant', content: 'That sounds demanding. What part do you work on?' },
    { id: 'u1', role: 'user', content: 'Backend services.' },
    { id: 'a2', role: 'assistant', content: 'AI has changed that work quite a bit. Do you use it often?' },
    { id: 'u2', role: 'user', content: 'Mostly for tests.' },
  ])
  assert.equal(dynamics.questionTurns, 2)
  assert.equal(dynamics.consecutiveQuestionTurns, 2)
  assert.equal(dynamics.userAnswerBurden, 1)
})

test('unmatched episodes are not injected merely because they are recent', () => {
  const episode = {
    id: 'e1', conversationId: 'c1', startMessageId: 'm1', endMessageId: 'm2',
    thread: 'beach holiday', summary: 'The user discussed a quiet beach.', facts: [], openLoops: [], keywords: ['beach'],
    topicArcs: [], interactionSignals: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }
  assert.deepEqual(selectRelevantEpisodes([episode], 'How do database indexes work?', 'software', 4), [])
})

test('recent ordinary memories cool down unless the semantic planner selects them', () => {
  const memory = { id: 'work-1', category: 'personal', key: '职业', value: '软件开发', tier: 'long_term', memoryType: 'profile', topic: 'work' }
  assert.deepEqual(selectRelevantMemories([memory], 'I work in software development', '', 4, [], [], 'casual', ['work-1']), [])
  assert.deepEqual(selectRelevantMemories([memory], 'I work in software development', '', 4, ['职业'], [], 'casual', ['work-1']), [memory])
})

test('legacy conversation state receives empty strategy collections', () => {
  const normalized = normalizeConversationState({ currentTopic: 'work', topicHistory: [], openLoops: [], sceneFacts: [] })
  assert.deepEqual(normalized.recentMoves, [])
  assert.deepEqual(normalized.topicMomentum, [])
  assert.deepEqual(normalized.recentMemoryIds, [])
})

test('explicit rejection closes the previous branch in topic momentum', () => {
  const previous = normalizeConversationState({
    currentTopic: 'work',
    recentMoves: [{ assistantMessageId: 'a1', move: 'observe', topic: 'work', branch: 'overtime', askedQuestion: true, memoryIds: [], createdAt: '2026-01-01' }],
    topicMomentum: [{ topic: 'work', branch: 'overtime', score: 1, status: 'active', continuedCount: 0, switchedCount: 0, lastTouchedAt: '2026-01-01' }],
  })
  const merged = mergeConversationState({
    previous,
    patch: { currentTopic: 'work', openedLoops: [], resolvedLoops: [], sceneFacts: [], userFacts: [] },
    userMessage: { id: 'u2', role: 'user', content: 'I would rather not discuss overtime.' },
    assistantMessageId: 'a2',
    assistantCreatedAt: '2026-01-02',
    dialogue: {
      plan: {
        mode: 'casual', anchorQuote: 'rather not', anchorMeaning: 'The user rejects that topic.', move: 'react',
        topic: 'work', branch: '', contribution: 'Respect the boundary.', questionPolicy: 'none', questionPurpose: '',
        previousMoveOutcome: 'rejected', callbackMemoryKey: '', reopenBranch: false,
      },
      policy: { questionBudget: 0, questionRequired: false, mustContribute: true, allowedBranch: '', forbiddenBranches: ['overtime'], reason: 'rejected' },
      roleReply: 'Understood—we can leave that there.',
      memoryIds: [],
    },
  })
  assert.equal(merged.state.topicMomentum.find((item) => item.branch === 'overtime')?.status, 'closed')

  const reopened = mergeConversationState({
    previous: merged.state,
    patch: { currentTopic: 'work', openedLoops: [], resolvedLoops: [], sceneFacts: [], userFacts: [] },
    userMessage: { id: 'u3', role: 'user', content: 'Actually, overtime has become relevant again.' },
    assistantMessageId: 'a3',
    assistantCreatedAt: '2026-01-03',
    dialogue: {
      plan: {
        mode: 'casual', anchorQuote: 'overtime', anchorMeaning: 'The user reopens the topic.', move: 'react',
        topic: 'work', branch: 'overtime', contribution: 'Respond to the user-led return.', questionPolicy: 'none', questionPurpose: '',
        previousMoveOutcome: 'continued', callbackMemoryKey: '', reopenBranch: true,
      },
      policy: { questionBudget: 0, questionRequired: false, mustContribute: true, allowedBranch: 'overtime', forbiddenBranches: [], reason: 'user_reopened' },
      roleReply: 'That changes the context, so it makes sense to come back to it.',
      memoryIds: [],
    },
  })
  assert.equal(reopened.state.topicMomentum.find((item) => item.branch === 'overtime')?.status, 'active')
})
