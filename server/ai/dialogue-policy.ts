import type {
  ConversationState,
  DialogueDynamics,
  DialoguePlan,
  DialoguePolicy,
  TurnLookupDecision,
} from '../types.js'

const questionMarkPattern = /[?？]/u

export function hasQuestion(value: string) {
  return questionMarkPattern.test(value)
}

export function isQuestionOnly(value: string) {
  const parts = value.split(/(?<=[.!?。！？])|\n+/u).map((part) => part.trim()).filter(Boolean)
  return Boolean(parts.length && parts.every((part) => /[?？]\s*$/u.test(part)))
}

function normalizedWords(value: string) {
  const normalized = value.toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  const words = normalized.split(/\s+/u)
    .filter(Boolean)
  const cjkBigrams = [...normalized.matchAll(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]{2,}/gu)]
    .flatMap((match) => [...match[0]].map((char, index, chars) => chars.slice(index, index + 2).join('')).filter((item) => item.length === 2))
  return [...new Set([...words, ...cjkBigrams])]
}

export function openerSimilarity(left: string, right: string) {
  const a = new Set(normalizedWords(left).slice(0, 8))
  const b = new Set(normalizedWords(right).slice(0, 8))
  if (!a.size || !b.size) return 0
  const shared = [...a].filter((word) => b.has(word)).length
  return (2 * shared) / (a.size + b.size)
}

function approximateContentUnits(value: string) {
  const clean = value.trim()
  const cjk = (clean.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/gu) || []).length
  const words = clean.replace(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/gu, ' ').match(/[\p{L}\p{N}]+/gu)?.length || 0
  return cjk + words
}

export function deriveDialoguePolicy(
  plan: DialoguePlan,
  dynamics: DialogueDynamics,
  lookupDecision: TurnLookupDecision,
  state: ConversationState,
): DialoguePolicy {
  const previousBranch = state.recentMoves.at(-1)?.branch || ''
  const forbiddenBranches = state.topicMomentum
    .filter((item) => item.status === 'closed' && !(plan.reopenBranch && item.branch === plan.branch))
    .map((item) => item.branch)
    .filter(Boolean)

  if (previousBranch && ['rejected', 'corrected', 'switched'].includes(plan.previousMoveOutcome)) {
    forbiddenBranches.push(previousBranch)
  }

  if (lookupDecision.action === 'clarify') {
    return {
      questionBudget: 1,
      questionRequired: true,
      mustContribute: false,
      allowedBranch: '',
      forbiddenBranches: [...new Set(forbiddenBranches)],
      reason: 'clarification_required',
    }
  }

  let questionBudget: 0 | 1 = plan.questionPolicy === 'none' ? 0 : 1
  let reason = plan.questionPolicy === 'none' ? 'plan_has_no_question' : 'one_useful_question_allowed'

  if (plan.mode === 'task') {
    questionBudget = 0
    reason = 'task_should_finish_directly'
  } else if (plan.previousMoveOutcome === 'rejected') {
    questionBudget = 0
    reason = 'user_rejected_previous_direction'
  } else if (dynamics.consecutiveQuestionTurns >= 2) {
    questionBudget = 0
    reason = 'recent_question_streak'
  } else if (dynamics.assistantTurns >= 3 && dynamics.questionTurnRate >= 0.75) {
    questionBudget = 0
    reason = 'recent_question_rate'
  } else if (dynamics.userAnswerBurden >= 0.75 && dynamics.questionTurns >= 2) {
    questionBudget = 0
    reason = 'user_has_been_answering_questions'
  }

  return {
    questionBudget,
    questionRequired: false,
    mustContribute: true,
    allowedBranch: forbiddenBranches.includes(plan.branch) ? '' : plan.branch,
    forbiddenBranches: [...new Set(forbiddenBranches)],
    reason,
  }
}

export function dialoguePolicyIssues(reply: string, policy: DialoguePolicy) {
  const issues: string[] = []
  const questionCount = (reply.match(/[?？]/gu) || []).length
  if (questionCount > policy.questionBudget) {
    issues.push(policy.questionBudget === 0
      ? 'the reply asks a question even though this turn has no question budget'
      : 'the reply asks more questions than this turn allows')
  }
  if (policy.questionRequired && questionCount === 0) issues.push('the required clarification question is missing')
  if (questionCount > 0 && policy.mustContribute) {
    const beforeQuestion = reply.split(/[?？]/u)[0]
    if (approximateContentUnits(beforeQuestion) < 6) {
      issues.push('the question is not preceded by a substantive contribution')
    }
  }
  return issues
}
