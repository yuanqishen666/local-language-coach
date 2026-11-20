import type { FastifyInstance } from 'fastify'
import { getConfig } from './services/config.js'
import { db, row, rows } from './services/database.js'
import { normalizeUiLocale } from '../shared/locales.js'
import { difficultyProfile, replyStep, type ConversationDifficulty } from '../shared/proficiency.js'
import { safeJson } from './utils/json.js'
import { normalizeConversationSetup } from './ai/context.js'
import { hintForLine, simplifyLine } from './ai/help.js'
import { recordHelp } from './proficiency-store.js'
import type { AppConfig, LearningLanguage } from './types.js'

type Line = { id: string; content: string; meta_json: string | null; reply_to_message_id: string | null }

function failure(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code })
}

/** The language a conversation is held in: the one recorded when it started, or the one in use now. */
export function conversationLearning(conversation: Record<string, any>, current: AppConfig): LearningLanguage {
  const targetLanguage = typeof conversation.target_language === 'string' ? conversation.target_language.trim() : ''
  const targetLanguageCode = typeof conversation.target_language_code === 'string' ? conversation.target_language_code.trim() : ''
  return targetLanguage && targetLanguageCode
    ? { targetLanguage, targetLanguageCode }
    : { targetLanguage: current.learning.targetLanguage, targetLanguageCode: current.learning.targetLanguageCode }
}

function partnerLine(conversationId: string, messageId: string) {
  const conversation = row<Record<string, any>>('SELECT * FROM conversations WHERE id = ?', conversationId)
  if (!conversation) throw failure('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
  const line = row<Line>("SELECT id, content, meta_json, reply_to_message_id FROM messages WHERE id = ? AND conversation_id = ? AND role = 'assistant' AND status = 'complete'", messageId, conversationId)
  if (!line) throw failure('That line is not part of this conversation.', 404, 'LINE_NOT_FOUND')
  return { conversation, line }
}

/** What the learner said that the line answers. An opening line answers nothing. */
function saidBefore(line: Line) {
  if (!line.reply_to_message_id) return undefined
  return row<{ content: string }>('SELECT content FROM messages WHERE id = ?', line.reply_to_message_id)?.content
}

function metaOf(messageId: string) {
  return safeJson<Record<string, any>>(row<{ meta_json: string | null }>('SELECT meta_json FROM messages WHERE id = ?', messageId)?.meta_json, {})
}

function levelAfter(difficulty: ConversationDifficulty, languageCode: string) {
  const step = replyStep(difficulty)
  return { replyStep: step, speechRateFactor: difficultyProfile(step, languageCode).speechRateFactor }
}

export function registerConversationHelpRoutes(app: FastifyInstance) {
  const running = new Map<string, Promise<unknown>>()
  /** Two presses on the same thing wait for one answer instead of paying for two. */
  function once<T>(key: string, work: () => Promise<T>): Promise<T> {
    const current = running.get(key) as Promise<T> | undefined
    if (current) return current
    const task = work().finally(() => { if (running.get(key) === task) running.delete(key) })
    running.set(key, task)
    return task
  }

  // "Say it more simply": the partner's line is written again at an easier step and takes the place of the first wording.
  app.post<{ Params: { id: string; messageId: string } }>('/api/conversations/:id/messages/:messageId/simpler', async (request) => {
    const { conversation, line } = partnerLine(request.params.id, request.params.messageId)
    // A reply built on looked-up material carries names, figures and source marks that a rewrite could lose.
    if (safeJson<Record<string, any>>(line.meta_json, {}).grounding) throw failure('This line cannot be rewritten.', 409, 'SIMPLER_UNAVAILABLE')
    return once(`simpler:${line.id}`, async () => {
      const current = await getConfig()
      const learning = conversationLearning(conversation, current)
      const code = learning.targetLanguageCode
      const help = recordHelp({ conversationId: conversation.id, partnerMessageId: line.id, kind: 'simpler', languageCode: code, fallbackProficiency: current.learning.proficiency })
      const level = levelAfter(help.difficulty, code)
      const before = metaOf(line.id)
      const done = Number(before.simplerCount) || 0
      // Each press goes one step below the last wording, and never above what the next replies will be written at.
      const step = Math.max(0, Math.min(level.replyStep, help.lineStep - done - 1))
      const learnerText = rows<{ content: string }>("SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' AND status = 'complete'", conversation.id)
        .map((message) => message.content).join('\n')
      const content = await simplifyLine({
        line: line.content,
        before: saidBefore(line),
        learnerText,
        setup: normalizeConversationSetup(safeJson(conversation.setup_json, null)),
        learning,
        step,
      })
      // Read again: a translation may have been stored while the model was writing.
      const meta = metaOf(line.id)
      const originalReply = typeof meta.originalReply === 'string' && meta.originalReply ? meta.originalReply : line.content
      const next: Record<string, any> = { ...meta, roleReply: content, originalReply, simplerCount: done + 1 }
      // What was written about the first wording no longer fits the new one.
      delete next.roleReplyTranslation
      delete next.roleReplyTranslations
      delete next.lineHints
      db.prepare('UPDATE messages SET content = ?, meta_json = ? WHERE id = ?').run(content, JSON.stringify(next), line.id)
      return { content, originalReply, simplerCount: done + 1, lowered: help.lowered, level }
    })
  })

  // "Give me a hint": a sentence in the interface language that points at the meaning without translating the line.
  app.post<{ Params: { id: string; messageId: string }; Body: { interfaceLocale?: string } }>('/api/conversations/:id/messages/:messageId/hint', async (request) => {
    const { conversation, line } = partnerLine(request.params.id, request.params.messageId)
    const current = await getConfig()
    const locale = normalizeUiLocale(request.body?.interfaceLocale, current.ui.locale)
    const stored = safeJson<Record<string, any>>(line.meta_json, {}).lineHints?.[locale]
    if (typeof stored === 'string' && stored) return { hint: stored, interfaceLocale: locale, cached: true }
    return once(`hint:${line.id}:${locale}`, async () => {
      const learning = conversationLearning(conversation, current)
      const { hint } = await hintForLine({ line: line.content, before: saidBefore(line), learning, interfaceLocale: locale })
      const help = recordHelp({ conversationId: conversation.id, partnerMessageId: line.id, kind: 'hint', languageCode: learning.targetLanguageCode, fallbackProficiency: current.learning.proficiency })
      const meta = metaOf(line.id)
      const hints = meta.lineHints && typeof meta.lineHints === 'object' ? meta.lineHints : {}
      // Kept only while the line still reads as it did when the hint was written.
      if (row<{ content: string }>('SELECT content FROM messages WHERE id = ?', line.id)?.content === line.content) {
        db.prepare('UPDATE messages SET meta_json = ? WHERE id = ?').run(JSON.stringify({ ...meta, lineHints: { ...hints, [locale]: hint } }), line.id)
      }
      return { hint, interfaceLocale: locale, cached: false, lowered: help.lowered, level: levelAfter(help.difficulty, learning.targetLanguageCode) }
    })
  })
}
