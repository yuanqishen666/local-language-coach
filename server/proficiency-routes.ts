import type { FastifyInstance } from 'fastify'
import { getConfig } from './services/config.js'
import { row, rows } from './services/database.js'
import { TARGET_LANGUAGES } from '../shared/locales.js'
import { clampStep, difficultyProfile, parseLevel, replyStep, type ConversationDifficulty } from '../shared/proficiency.js'
import type { HelpKind } from './proficiency.js'
import {
  assessConversation, assessIdleConversations, chooseLevel, clearProfile, conversationDifficulty, getAssessment, getProfile,
  previousConversationBase, profileHistory, recordHelp, seedProfileFromSetting, setLocked, setWorkingStep, stepFromSetting,
} from './proficiency-store.js'

const DAY = 24 * 60 * 60 * 1000
const QUICK_CHECK_AFTER_DAYS = 60
const HELP_KINDS: HelpKind[] = ['lookup', 'translate', 'simpler', 'slower', 'hint', 'heard', 'reveal']

function badRequest(message: string, code: string) {
  return Object.assign(new Error(message), { statusCode: 400, code })
}

function knownLanguage(code: unknown, fallback: string) {
  const value = typeof code === 'string' ? code.trim().toLowerCase() : ''
  return TARGET_LANGUAGES.some((language) => language.code === value) ? value : fallback
}

/** The language a conversation is held in: the one recorded when it started, or the one in use now. */
export function conversationLanguageCode(conversation: { target_language_code?: unknown } | undefined, currentCode: string) {
  const recorded = typeof conversation?.target_language_code === 'string' ? conversation.target_language_code.trim() : ''
  return recorded || currentCode
}

/** What the conversation page needs to know about the difficulty of one conversation. */
export function conversationLevel(conversationId: string, languageCode: string, fallbackProficiency: string) {
  const difficulty = conversationDifficulty(conversationId, languageCode, fallbackProficiency)
  const previous = previousConversationBase(conversationId, languageCode)
  return {
    step: difficulty.base,
    replyStep: replyStep(difficulty),
    // Told to the learner at the top of the conversation, once, when this one starts harder than the last.
    previousStep: previous,
    raised: previous !== null && difficulty.base > previous,
    speechRateFactor: difficultyProfile(replyStep(difficulty), languageCode).speechRateFactor,
  }
}

function levelAfter(difficulty: ConversationDifficulty, languageCode: string) {
  const step = replyStep(difficulty)
  return { replyStep: step, speechRateFactor: difficultyProfile(step, languageCode).speechRateFactor }
}

/** Everything the pages show about one language's level. */
export async function proficiencyOverview(languageCode?: string) {
  const config = await getConfig()
  const current = config.learning.targetLanguageCode
  const code = knownLanguage(languageCode, current)
  // Before the first-run choices are saved, the level in settings is only a default nobody picked.
  if (config.setupComplete) seedProfileFromSetting(current, config.learning.proficiency)
  assessIdleConversations(code, config.learning.proficiency, current)
  const profile = getProfile(code)
  const tested = row<{ tested_step: number | null; tested_at: string | null }>('SELECT tested_step, tested_at FROM proficiency_profiles WHERE language_code = ?', code)
  const stale = Boolean(tested?.tested_at && Date.now() - new Date(tested.tested_at).getTime() > QUICK_CHECK_AFTER_DAYS * DAY)
  const moved = Boolean(profile && typeof tested?.tested_step === 'number' && Math.abs(profile.step - tested.tested_step) >= 3)
  const recent = rows<{ conversationId: string; verdict: string; baseStep: number; assessedAt: string }>(
    `SELECT conversation_id AS conversationId, verdict, base_step AS baseStep, assessed_at AS assessedAt
     FROM conversation_assessments WHERE language_code = ? AND valid = 1 ORDER BY assessed_at DESC LIMIT 12`, code)
  return {
    languageCode: code,
    profile,
    history: profileHistory(code),
    conversations: recent,
    // Offered on the level card; the learner decides whether to take it.
    quickCheck: profile && !profile.locked && (stale || moved) ? { reason: moved ? 'moved' : 'stale' } : null,
    // The level chosen in settings, as the starting point offered when there is no profile yet.
    chosenStep: stepFromSetting(config.learning.proficiency),
    speechRateFactor: difficultyProfile(profile?.workingStep ?? stepFromSetting(config.learning.proficiency), code).speechRateFactor,
  }
}

export function registerProficiencyRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { language?: string } }>('/api/proficiency', async (request) => proficiencyOverview(request.query.language))

  app.patch<{ Body: { language?: string; step?: number; level?: string; workingStep?: number; locked?: boolean; clear?: boolean; source?: string } }>('/api/proficiency', async (request) => {
    const config = await getConfig()
    const body = request.body || {}
    const code = knownLanguage(body.language, config.learning.targetLanguageCode)
    if (body.clear === true) {
      clearProfile(code)
      return proficiencyOverview(code)
    }
    const chosen = typeof body.step === 'number' && Number.isFinite(body.step) ? clampStep(body.step) : parseLevel(body.level)
    if (chosen !== undefined) chooseLevel(code, chosen, body.source === 'self' || !getProfile(code) ? 'self' : 'manual')
    if (!getProfile(code)) throw badRequest('Choose a level first.', 'PROFICIENCY_LEVEL_REQUIRED')
    if (typeof body.workingStep === 'number' && Number.isFinite(body.workingStep)) setWorkingStep(code, body.workingStep)
    if (typeof body.locked === 'boolean') setLocked(code, body.locked)
    return proficiencyOverview(code)
  })

  // What the page saw the learner do with one of the partner's lines: look a word up, translate it, ask for it simpler.
  app.post<{ Params: { id: string }; Body: { messageId?: string; kind?: string } }>('/api/conversations/:id/signals', async (request) => {
    const conversation = row<Record<string, any>>('SELECT id, target_language_code FROM conversations WHERE id = ?', request.params.id)
    if (!conversation) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 })
    const kind = HELP_KINDS.find((item) => item === request.body?.kind)
    if (!kind) throw badRequest('Unknown signal.', 'SIGNAL_KIND_INVALID')
    const message = row<{ id: string }>("SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND role = 'assistant'", String(request.body?.messageId || ''), request.params.id)
    if (!message) throw badRequest('That line is not part of this conversation.', 'SIGNAL_MESSAGE_INVALID')
    const config = await getConfig()
    const languageCode = conversationLanguageCode(conversation, config.learning.targetLanguageCode)
    const result = recordHelp({ conversationId: request.params.id, partnerMessageId: message.id, kind, languageCode, fallbackProficiency: config.learning.proficiency })
    return { lowered: result.lowered, ...levelAfter(result.difficulty, languageCode) }
  })

  // The page says the learner has left the conversation; the level may move on what it showed.
  app.post<{ Params: { id: string } }>('/api/conversations/:id/assess', async (request) => {
    const conversation = row<Record<string, any>>('SELECT id, target_language_code FROM conversations WHERE id = ?', request.params.id)
    if (!conversation) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 })
    const config = await getConfig()
    const languageCode = conversationLanguageCode(conversation, config.learning.targetLanguageCode)
    const result = assessConversation({ conversationId: request.params.id, languageCode, fallbackProficiency: config.learning.proficiency })
    return { assessment: result.assessment || getAssessment(request.params.id), changes: result.changes, profile: getProfile(languageCode) }
  })
}
