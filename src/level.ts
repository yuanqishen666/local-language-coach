import { reactive, ref } from 'vue'
import { api } from './api'
import { DEFAULT_SPEECH_RATE, normalizeSpeechRate } from '../shared/speech'
import {
  stepParts, type ConversationVerdict, type ProficiencyChange, type ProficiencyProfile,
} from '../shared/proficiency'

/** Everything the server keeps about the level of one learning language. */
export interface LevelOverview {
  languageCode: string
  profile: ProficiencyProfile | null
  history: ProficiencyChange[]
  conversations: Array<{ conversationId: string; verdict: ConversationVerdict; baseStep: number; assessedAt: string }>
  /** Set when a short check is worth offering. */
  quickCheck: { reason: 'moved' | 'stale' } | null
  /** The level from settings, offered as a starting point while there is no profile. */
  chosenStep: number
  speechRateFactor: number
}

export interface LevelUpdate {
  step?: number
  level?: string
  workingStep?: number
  locked?: boolean
  clear?: boolean
  source?: 'self' | 'manual'
}

// One copy per language, shared by the sidebar, the home page, settings and the memories page.
const overviews = reactive<Record<string, LevelOverview | undefined>>({})

export function levelOverview(languageCode: string) {
  return overviews[languageCode]
}

export function setLevelOverview(overview: LevelOverview) {
  overviews[overview.languageCode] = overview
  return overview
}

export async function loadLevel(languageCode: string) {
  return setLevelOverview(await api.get<LevelOverview>(`/proficiency?language=${encodeURIComponent(languageCode)}`))
}

export async function updateLevel(languageCode: string, change: LevelUpdate) {
  return setLevelOverview(await api.patch<LevelOverview>('/proficiency', { language: languageCode, ...change }))
}

/** What the server says about the difficulty after the learner asked for help with a line. */
export interface LevelAfterHelp { lowered?: boolean; replyStep: number; speechRateFactor: number }

/** How lines are paced when read aloud in the conversation that is open; 1 outside one. */
export const speechPace = ref(1)

/**
 * The rate a line is read at. A rate the learner chose themselves is kept as it is;
 * the default is paced for the level the conversation is written at.
 */
export function spokenRate(setting: number | undefined, slowed = 1) {
  const chosen = typeof setting === 'number' && Number.isFinite(setting) && setting !== DEFAULT_SPEECH_RATE
  return normalizeSpeechRate((chosen ? setting : DEFAULT_SPEECH_RATE * speechPace.value) * slowed)
}

type Translate = (key: string, values?: Record<string, unknown>) => string

/**
 * A step as the learner reads it: "B1", with a sign for the upper or lower part of the level.
 * A code rather than words, so it sits in a sentence of any interface language without being inflected.
 */
export function stepName(step: number) {
  const { level, part } = stepParts(step)
  return part === 'mid' ? level : `${level}${part === 'high' ? '+' : '−'}`
}

/** One line of the history: what moved, from where to where. */
export function changeLine(change: Pick<ProficiencyChange, 'kind' | 'fromStep' | 'toStep'>, t: Translate) {
  const to = stepName(change.toStep)
  if (change.fromStep === null) return t('level.change.first', { to })
  return t(change.kind === 'difficulty' ? 'level.change.difficulty' : 'level.change.estimate', { from: stepName(change.fromStep), to })
}

const PROMPTED_PREFIX = 'local-language-coach:level-prompted:'

/** Whether the learner has already been pointed to the test for this language. They are asked once. */
export function levelPrompted(languageCode: string) {
  try { return window.localStorage.getItem(PROMPTED_PREFIX + languageCode) === '1' } catch { return false }
}

export function markLevelPrompted(languageCode: string) {
  try { window.localStorage.setItem(PROMPTED_PREFIX + languageCode, '1') } catch { /* Private browsing: the prompt simply shows again. */ }
}
