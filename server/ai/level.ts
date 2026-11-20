/**
 * Turns a difficulty step into what a prompt can act on: concrete limits on sentence length,
 * vocabulary, structures, idioms, topics and questions, instead of a bare level name.
 */
import {
  CEFR_LEVELS, difficultyProfile, parseLevel, stepCode, stepForPrompt, stepOf, stepParts,
  type CefrLevel, type DifficultyProfile,
} from '../../shared/proficiency.js'
import type { DifficultyIssue } from '../proficiency-text.js'

interface LevelConfig {
  learning: { targetLanguage: string; targetLanguageCode: string; proficiency: string; difficultyStep?: number }
}

/** The step a request is written at: the one set for it, or else the level chosen in settings. */
export function requestStep(config: LevelConfig) {
  const step = config.learning.difficultyStep
  if (typeof step === 'number' && Number.isFinite(step)) return Math.max(0, Math.min(CEFR_LEVELS.length * 3 - 1, Math.round(step)))
  return parseLevel(config.learning.proficiency) ?? stepOf('B1')
}

export function requestDifficulty(config: LevelConfig): DifficultyProfile {
  return difficultyProfile(requestStep(config), config.learning.targetLanguageCode)
}

/** `B1`, `B1 (upper part of the level)`: how the level is named inside a prompt. */
export function levelName(config: LevelConfig) {
  return stepForPrompt(requestStep(config))
}

/** `B1+`: the short code shown next to generated scenes. */
export function levelCode(config: LevelConfig) {
  return stepCode(requestStep(config))
}

const VOCABULARY: Record<CefrLevel, string> = {
  A1: 'Use only the most common everyday words. If one less common word is unavoidable, use it once and let the same sentence make its meaning plain.',
  A2: 'Stay with common everyday words. A less common word may appear only when the sentence around it makes the meaning clear.',
  B1: 'Use mostly common words. A few less common ones are fine when the context explains them; avoid rare, literary and specialist words.',
  B2: 'A wide everyday and topical vocabulary is fine. Avoid rare, literary or highly technical words unless the topic itself calls for them.',
  C1: 'Precise, varied and idiomatic vocabulary is welcome; only avoid words a well-read native speaker would find obscure.',
  C2: 'No limit on vocabulary beyond what is natural for the speaker and the moment.',
}

const STRUCTURES: Record<CefrLevel, string> = {
  A1: 'Short main clauses about the present; the simplest past or future only when needed; join ideas with the most basic connectors.',
  A2: 'Simple sentences in the common tenses, with short subordinate clauses and everyday connectors.',
  B1: 'Common tenses and everyday subordinate clauses. No long nested sentences and no rare moods or constructions.',
  B2: 'The full range of common structures, including relative clauses, conditionals and passives where a native speaker would use them.',
  C1: 'Any natural structure, including complex and nuanced ones.',
  C2: 'Any natural structure, including complex and nuanced ones.',
}

const IDIOMS: Record<CefrLevel, string> = {
  A1: 'No idioms, slang or cultural shorthand.',
  A2: 'No idioms, slang or cultural shorthand.',
  B1: 'At most one common idiom or colloquial expression, and only where the context makes its meaning clear.',
  B2: 'Common idioms and colloquial expressions are fine.',
  C1: 'Idioms, slang and shifts of register may be used the way a native speaker would.',
  C2: 'Idioms, slang and shifts of register may be used the way a native speaker would.',
}

const TOPICS: Record<CefrLevel, string> = {
  A1: 'Keep to concrete, here-and-now things: people, places, routines, likes and dislikes.',
  A2: 'Keep to concrete things: daily life, past events, plans, simple preferences.',
  B1: 'Concrete experiences and plans, and simple opinions with a reason.',
  B2: 'Opinions, comparisons, causes and consequences are in range.',
  C1: 'Abstract, hypothetical and nuanced discussion is in range.',
  C2: 'Abstract, hypothetical and nuanced discussion is in range.',
}

const QUESTIONS: Record<CefrLevel, string> = {
  A1: 'a yes/no or either-or question, or a simple who/what/where question that a few words can answer',
  A2: 'a simple, concrete question that a short sentence can answer',
  B1: 'an open question about an experience, a plan or an opinion',
  B2: 'an open question that may ask for reasons or a comparison',
  C1: 'a question that may probe reasons, pose a hypothetical or challenge a view',
  C2: 'a question that may probe reasons, pose a hypothetical or challenge a view',
}

function lengthLimit(profile: DifficultyProfile) {
  return profile.unit === 'characters' ? `${profile.maxSentenceLength} characters` : `${profile.maxSentenceLength} words`
}

/** The limits a spoken reply is written within. Replaces the bare level name in the reply prompt. */
export function replyDifficultyRules(config: LevelConfig): string[] {
  const profile = requestDifficulty(config)
  const { level } = stepParts(profile.step)
  return [
    `Difficulty for this learner, ${levelName(config)}. These limits apply to roleReply and to nothing else; they never change who the partner is or what the partner means, only how it is said:`,
    `- Length: no sentence longer than about ${lengthLimit(profile)}; at most ${profile.maxSentences} sentence${profile.maxSentences === 1 ? '' : 's'} in the reply. Say less rather than squeezing more into each sentence.`,
    '- Words: ' + VOCABULARY[level],
    '- Structures: ' + STRUCTURES[level] + ` Judge what is simple or complex by the grammar of ${config.learning.targetLanguage} itself, not by English grammar terms.`,
    '- Idioms: ' + IDIOMS[level],
    '- Topic depth: ' + TOPICS[level] + ' Follow the learner if they go further themselves.',
    `- When the dialogue policy allows a question, make it ${QUESTIONS[level]}.`,
    '- Within these limits the reply must still sound like a real person of that role, never like a textbook or a teacher simplifying on purpose.',
  ]
}

/** One line for material that is generated before a conversation: openings, scenes, practice texts. */
export function materialDifficultyRule(config: LevelConfig, field: string) {
  const profile = requestDifficulty(config)
  const { level } = stepParts(profile.step)
  return `${field} is written for a learner at ${levelName(config)}: no sentence longer than about ${lengthLimit(profile)}. ${VOCABULARY[level]} ${STRUCTURES[level]} ${IDIOMS[level]}`
}

/** A difficulty problem found in a finished reply, stated for the rewrite prompt. */
export function difficultyIssueText(issue: DifficultyIssue) {
  if (issue.kind === 'sentence_length') {
    return `A sentence runs to ${issue.longest} ${issue.unit}; this learner reads comfortably up to about ${issue.limit}. Break long sentences into shorter ones.`
  }
  if (issue.kind === 'sentence_count') {
    return `The reply has ${issue.sentences} sentences; keep it to about ${issue.limit} by saying less, not by joining sentences together.`
  }
  return `Too many uncommon words for this learner (for example: ${issue.words.join(', ')}). Replace most of them with common everyday words, or let the sentence make their meaning plain.`
}
