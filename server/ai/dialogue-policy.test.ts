import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConversationState, DialogueDynamics, DialoguePlan, TurnLookupDecision } from '../types.js'
import { deriveDialoguePolicy, dialoguePolicyIssues, openerSimilarity } from './dialogue-policy.js'

const plan: DialoguePlan = {
  mode: 'casual',
  anchorQuote: 'software development',
  anchorMeaning: 'The user works in software development.',
  move: 'observe',
  topic: 'work',
  branch: 'ai-at-work',
  contribution: 'Developers experience the AI shift directly.',
  questionPolicy: 'optional',
  questionPurpose: 'Understand how the user works with AI.',
  previousMoveOutcome: 'continued',
  callbackMemoryKey: '',
  reopenBranch: false,
}

const dynamics: DialogueDynamics = {
  assistantTurns: 2,
  questionTurns: 2,
  questionOnlyTurns: 0,
  questionTurnRate: 1,
  consecutiveQuestionTurns: 2,
  userAnswerBurden: 1,
  recentOpeners: [],
  recentOnlyAgreement: false,
  repeatedOpener: false,
}

const state: ConversationState = {
  currentTopic: 'work', topicHistory: [], openLoops: [], sceneFacts: [], lastCompactedMessageId: '',
  recentMoves: [], topicMomentum: [], recentMemoryIds: [],
}

const replyDecision: TurnLookupDecision = {
  action: 'reply', parts: [{ text: 'share', needsLookup: false, reason: 'stable', subject: 'work' }], query: '', locator: null,
}

test('two recent question turns close the optional question gate', () => {
  const policy = deriveDialoguePolicy(plan, dynamics, replyDecision, state)
  assert.equal(policy.questionBudget, 0)
  assert.equal(policy.reason, 'recent_question_streak')
})

test('a necessary clarification can pass through a closed conversational gate', () => {
  const policy = deriveDialoguePolicy(plan, dynamics, { ...replyDecision, action: 'clarify' }, state)
  assert.equal(policy.questionBudget, 1)
  assert.equal(policy.questionRequired, true)
})

test('a rejected branch is forbidden and cannot end with another question', () => {
  const previousState: ConversationState = {
    ...state,
    recentMoves: [{ assistantMessageId: 'a1', move: 'observe', topic: 'work', branch: 'overtime', askedQuestion: true, memoryIds: [], createdAt: '2026-01-01' }],
  }
  const policy = deriveDialoguePolicy({ ...plan, previousMoveOutcome: 'rejected' }, { ...dynamics, consecutiveQuestionTurns: 0 }, replyDecision, previousState)
  assert.equal(policy.questionBudget, 0)
  assert.ok(policy.forbiddenBranches.includes('overtime'))
})

test('only an explicit learner-led reopen can reactivate a closed branch', () => {
  const closedState: ConversationState = {
    ...state,
    topicMomentum: [{ topic: 'work', branch: 'overtime', score: -2, status: 'closed', continuedCount: 0, switchedCount: 0, lastTouchedAt: '2026-01-01' }],
  }
  const blocked = deriveDialoguePolicy({ ...plan, branch: 'overtime', reopenBranch: false }, { ...dynamics, consecutiveQuestionTurns: 0, questionTurnRate: 0, userAnswerBurden: 0 }, replyDecision, closedState)
  assert.equal(blocked.allowedBranch, '')
  const reopened = deriveDialoguePolicy({ ...plan, branch: 'overtime', reopenBranch: true }, { ...dynamics, consecutiveQuestionTurns: 0, questionTurnRate: 0, userAnswerBurden: 0 }, replyDecision, closedState)
  assert.equal(reopened.allowedBranch, 'overtime')
})

test('question-bearing replies must contain value before the question', () => {
  const policy = { questionBudget: 1 as const, questionRequired: false, mustContribute: true, allowedBranch: 'ai-at-work', forbiddenBranches: [], reason: 'allowed' }
  assert.deepEqual(dialoguePolicyIssues('Do you use AI?', policy), ['the question is not preceded by a substantive contribution'])
  assert.deepEqual(dialoguePolicyIssues('Developers are right in the middle of this shift, and the trust line differs a lot from team to team. Do you use AI?', policy), [])
})

test('opening similarity catches repeated polite templates', () => {
  assert.ok(openerSimilarity('That is really interesting to hear', 'That is really interesting, honestly') >= 0.72)
  assert.ok(openerSimilarity('这真的很有意思，尤其是后端开发', '这真的很有意思，尤其是你的工作') >= 0.72)
})
