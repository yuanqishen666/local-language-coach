/**
 * The wordbook beyond flashcards: a story written from saved words, pasted material turned
 * into something to talk about, and suggestions for what to talk about next.
 */
import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { getConfig } from './services/config.js'
import { db, perDatabase, row, rows } from './services/database.js'
import { normalizeUiLocale } from '../shared/locales.js'
import { isErrorCategory, type ErrorCategory } from '../shared/memory.js'
import {
  IMPORT_MAX_LENGTH, IMPORT_MIN_LENGTH, PATH_ITEMS, STORY_MAX_WORDS, STORY_MIN_WORDS,
  type ImportedContent, type ImportedContentSummary, type LearningPath, type Story,
} from '../shared/wordbook.js'
import { safeJson } from './utils/json.js'
import { normalizeConversationSetup } from './ai/context.js'
import { suggestSetups } from './ai/engine.js'
import { assertModelConfigured } from './ai/provider.js'
import { writeImport, writeStory } from './ai/wordbook.js'
import { readPublicUrl } from './lookup/url-reader.js'
import { workingStepFor } from './proficiency-store.js'
import { setupSteering } from './setup-steering.js'
import { dueWords, sameLanguage, withinReach, wordsByDue } from './word-store.js'
import { wordUse } from './word-use.js'
import { sentencesOf } from './proficiency-text.js'
import type { AppConfig, ConversationMaterial, ConversationSetup } from './types.js'

const DAY = 86_400_000
/** Suggestions for what to talk about next are kept this long before new ones are asked for. */
const PATH_LIFETIME = DAY
/** How far back conversations count towards what the learner usually talks about. */
const USUAL_TOPIC_DAYS = 30
const LISTED_IMPORTS = 30
const LISTED_STORIES = 10

function failure(message: string, statusCode: number, code: string, details?: Record<string, unknown>) {
  return Object.assign(new Error(message), { statusCode, code, ...(details ? { details } : {}) })
}

/** What a conversation started from here brings with it. */
export interface ConversationStart {
  material?: ConversationMaterial
  openingLine?: string
  words?: { ids: string[]; source: 'path' | 'story' }
}

export interface WordbookDeps {
  createConversation(setup: ConversationSetup | null, interfaceLocale: string, learning: AppConfig['learning'], title: string | undefined, start: ConversationStart): Promise<{ id: string }>
}

interface StoryRow {
  id: string
  language_code: string
  interface_locale: string
  step: number
  title: string
  content_json: string
  conversation_id: string | null
  created_at: string
}

interface StoryContent {
  languageName: string
  sentences: string[]
  question: string
  /** locale is the interface language the meaning was written in. */
  words: Array<{ wordId: string; term: string; lemma: string; meaning: string; locale?: string }>
}

interface ImportRow {
  id: string
  language_code: string
  interface_locale: string
  step: number
  source_kind: string
  source_url: string | null
  source_title: string
  title: string
  content_json: string
  created_at: string
}

interface ImportContent {
  languageName: string
  summary: string
  questions: string[]
  words: Array<{ term: string; meaning: string }>
}

interface PathRow {
  id: string
  language_code: string
  interface_locale: string
  items_json: string
  created_at: string
}

interface PathContent {
  languageName: string
  step: number
  items: Array<{
    id: string
    setup: ConversationSetup
    words: Array<{ wordId: string; term: string; meaning: string }>
    mistake: ErrorCategory | null
    conversationId: string | null
  }>
}

/** A saved word's meaning when it is written in the interface language being shown; null when the word is gone. */
function meaningIn(wordId: string, interfaceLocale: string) {
  const entry = row<{ meaning: string; interface_locale: string }>('SELECT meaning, interface_locale FROM word_entries WHERE id = ?', wordId)
  return entry ? (entry.interface_locale === interfaceLocale ? entry.meaning : '') : null
}

function liveConversation(id: string | null) {
  return id && row<{ id: string }>('SELECT id FROM conversations WHERE id = ?', id) ? id : null
}

/** The learning settings a conversation is created with when its material is in a given language. */
function learningFor(current: AppConfig, languageCode: string, languageName: string): AppConfig['learning'] {
  if (sameLanguage(current.learning.targetLanguageCode, languageCode)) return current.learning
  return { ...current.learning, targetLanguageCode: languageCode, targetLanguage: languageName || languageCode }
}

/**
 * Pasted subtitles and lyrics come with cue numbers, timestamps and markup. What is left is
 * the lines people actually say or sing.
 */
export function cleanPasted(value: string) {
  const lines = String(value || '').replace(/\r\n?/gu, '\n').split('\n').map((line) => line.trim())
  const subtitles = lines.some((line) => /^\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}\s*-->/u.test(line))
  const kept: string[] = []
  for (const raw of lines) {
    if (/^\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}\s*-->/u.test(raw)) continue
    if (subtitles && (/^\d+$/u.test(raw) || /^WEBVTT\b/u.test(raw))) continue
    if (/^\[(?:ar|ti|al|by|offset|length|re|ve):[^\]]*\]$/iu.test(raw)) continue
    const line = raw
      .replace(/^(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)+/u, '')
      .replace(/<\/?[a-z][^>]*>/giu, '')
      .replace(/\{\\[^}]*\}/gu, '')
      .trim()
    if (!line && !kept.at(-1)) continue
    kept.push(line)
  }
  return kept.join('\n').trim()
}

export function registerWordbookRoutes(app: FastifyInstance, deps: WordbookDeps) {
  const running = perDatabase(() => new Map<string, Promise<unknown>>())
  function once<T>(key: string, work: () => Promise<T>): Promise<T> {
    // Shared with the same learner's own requests only: the answer is theirs.
    const underWay = running()
    const current = underWay.get(key) as Promise<T> | undefined
    if (current) return current
    const task = work().finally(() => { if (underWay.get(key) === task) underWay.delete(key) })
    underWay.set(key, task)
    return task
  }

  // -------------------------------------------------------------------------------------------
  // Story

  function storyView(stored: StoryRow, interfaceLocale = stored.interface_locale): Story {
    const content = safeJson<StoryContent>(stored.content_json, { languageName: '', sentences: [], question: '', words: [] })
    const sentences = content.sentences.map((text) => ({
      text,
      marks: content.words.flatMap((word) => {
        const found = wordUse(text, word, stored.language_code)
        return found ? [{ wordId: word.wordId, surface: found.surface }] : []
      }),
    }))
    const used = new Set(sentences.flatMap((sentence) => sentence.marks.map((mark) => mark.wordId)))
    return {
      id: stored.id,
      languageCode: stored.language_code,
      step: stored.step,
      title: stored.title,
      sentences,
      words: content.words.map((word) => ({
        wordId: word.wordId,
        term: word.term,
        meaning: meaningIn(word.wordId, interfaceLocale) ?? ((word.locale || stored.interface_locale) === interfaceLocale ? word.meaning : ''),
        used: used.has(word.wordId),
        saved: Boolean(row<{ id: string }>('SELECT id FROM word_entries WHERE id = ?', word.wordId)),
      })),
      conversationId: liveConversation(stored.conversation_id),
      createdAt: stored.created_at,
    }
  }

  function storyRow(id: string) {
    const stored = row<StoryRow>('SELECT * FROM word_stories WHERE id = ?', id)
    if (!stored) throw failure('Story not found', 404, 'STORY_NOT_FOUND')
    return stored
  }

  app.get('/api/stories', async () => {
    const current = await getConfig()
    return {
      stories: rows<StoryRow>('SELECT * FROM word_stories ORDER BY created_at DESC LIMIT 60')
        .filter((story) => sameLanguage(story.language_code, current.learning.targetLanguageCode))
        .slice(0, LISTED_STORIES)
        .map((story) => ({ id: story.id, languageCode: story.language_code, title: story.title, createdAt: story.created_at })),
    }
  })

  app.post<{ Body: { interfaceLocale?: string } }>('/api/stories', async (request) => {
    await assertModelConfigured()
    return once('story', async () => {
      const current = await getConfig()
      const interfaceLocale = normalizeUiLocale(request.body?.interfaceLocale, current.ui.locale)
      const code = current.learning.targetLanguageCode
      const step = workingStepFor(code, current.learning.proficiency)
      const now = new Date()
      const due = dueWords(code, now, STORY_MAX_WORDS * 3)
      // Words whose review has come go first; when there are too few, the ones coming up next fill the story.
      const dueIds = new Set(due.map((word) => word.id))
      const pool = [...due, ...wordsByDue(code, 60).filter((word) => !dueIds.has(word.id))]
      const reachable = pool.filter((word) => withinReach(word, code, step))
      const chosen = (reachable.length >= STORY_MIN_WORDS ? reachable : pool).slice(0, STORY_MAX_WORDS)
      if (chosen.length < STORY_MIN_WORDS) throw failure('Save a few more words before asking for a story.', 409, 'STORY_NEEDS_WORDS', { needed: STORY_MIN_WORDS, saved: chosen.length })
      const draft = await writeStory({
        languageCode: code, languageName: current.learning.targetLanguage, interfaceLocale, step,
        words: chosen.map((word) => ({ term: word.term, lemma: word.lemma, meaning: word.meaning })),
      })
      const content: StoryContent = {
        languageName: current.learning.targetLanguage,
        sentences: draft.sentences,
        question: draft.question,
        words: chosen.map((word) => ({ wordId: word.id, term: word.term, lemma: word.lemma, meaning: word.meaning, locale: word.interface_locale })),
      }
      const id = nanoid()
      db.prepare('INSERT INTO word_stories (id, language_code, interface_locale, step, title, content_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, code, interfaceLocale, step, draft.title, JSON.stringify(content), now.toISOString())
      return { story: storyView(storyRow(id), interfaceLocale) }
    })
  })

  app.get<{ Params: { id: string }; Querystring: { interfaceLocale?: string } }>('/api/stories/:id', async (request) => {
    const stored = storyRow(request.params.id)
    return { story: storyView(stored, normalizeUiLocale(request.query.interfaceLocale, (await getConfig()).ui.locale)) }
  })

  app.post<{ Params: { id: string }; Body: { interfaceLocale?: string } }>('/api/stories/:id/talk', async (request) => {
    await assertModelConfigured()
    const stored = storyRow(request.params.id)
    const open = liveConversation(stored.conversation_id)
    if (open) return { id: open }
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(request.body?.interfaceLocale, current.ui.locale)
    const content = safeJson<StoryContent>(stored.content_json, { languageName: '', sentences: [], question: '', words: [] })
    const view = storyView(stored)
    const created = await deps.createConversation(null, interfaceLocale, learningFor(current, stored.language_code, content.languageName), stored.title, {
      material: { kind: 'story', title: stored.title, text: content.sentences.join(' ') },
      openingLine: content.question,
      // Only the words the story really has: those are the ones the learner has just read in use.
      words: { ids: view.words.filter((word) => word.used && word.saved).map((word) => word.wordId), source: 'story' },
    })
    db.prepare('UPDATE word_stories SET conversation_id = ? WHERE id = ?').run(created.id, stored.id)
    return created
  })

  // -------------------------------------------------------------------------------------------
  // Pasted material

  function importSource(stored: ImportRow) {
    return { kind: stored.source_kind === 'url' ? 'url' as const : 'text' as const, url: stored.source_url, title: stored.source_title }
  }

  /** The wordbook entry for a word of this language, if the learner already has one. */
  function savedWordId(term: string, languageCode: string) {
    const key = term.trim().toLowerCase()
    return rows<{ id: string; language: string }>('SELECT id, language FROM word_entries WHERE LOWER(term) = ? OR LOWER(lemma) = ? ORDER BY created_at', key, key)
      .find((word) => sameLanguage(word.language, languageCode))?.id || null
  }

  function importView(stored: ImportRow, interfaceLocale = stored.interface_locale): ImportedContent {
    const content = safeJson<ImportContent>(stored.content_json, { languageName: '', summary: '', questions: [], words: [] })
    return {
      id: stored.id,
      languageCode: stored.language_code,
      step: stored.step,
      title: stored.title,
      summary: content.summary,
      questions: content.questions,
      words: content.words.map((word) => {
        const wordId = savedWordId(word.term, stored.language_code)
        const meaning = (wordId && meaningIn(wordId, interfaceLocale)) || (stored.interface_locale === interfaceLocale ? word.meaning : '')
        return { term: word.term, meaning, wordId }
      }),
      source: importSource(stored),
      createdAt: stored.created_at,
    }
  }

  function importRow(id: string) {
    const stored = row<ImportRow>('SELECT * FROM content_imports WHERE id = ?', id)
    if (!stored) throw failure('That material is no longer here.', 404, 'IMPORT_NOT_FOUND')
    return stored
  }

  async function importFrom(input: { text?: string; url?: string; interfaceLocale?: string }) {
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(input.interfaceLocale, current.ui.locale)
    const pasted = String(input.text || '').trim()
    // A paste that is nothing but an address is a link to read, not text to retell.
    const address = String(input.url || '').trim() || (/^https?:\/\/\S+$/iu.test(pasted) ? pasted : '')
    let source: { kind: 'text' | 'url'; url: string | null; title: string; text: string }
    if (address) {
      let parsed: URL
      try { parsed = new URL(address) } catch { throw failure('That is not a web address.', 400, 'IMPORT_URL_INVALID') }
      if (!['http:', 'https:'].includes(parsed.protocol)) throw failure('That is not a web address.', 400, 'IMPORT_URL_INVALID')
      try {
        const page = await readPublicUrl(parsed.toString(), current.webLookup.timeoutMs)
        source = { kind: 'url', url: page.url, title: page.title, text: page.content }
      } catch (error) {
        const reason = error instanceof Error ? error.message : ''
        if (reason === 'UNSAFE_URL') throw failure('That address cannot be read from here.', 400, 'IMPORT_URL_INVALID')
        throw failure('That page could not be read.', 502, 'IMPORT_READ_FAILED', { reason: reason.slice(0, 80) })
      }
    } else {
      source = { kind: 'text', url: null, title: '', text: pasted }
    }
    const body = cleanPasted(source.text).slice(0, IMPORT_MAX_LENGTH)
    if ([...body].length < IMPORT_MIN_LENGTH) throw failure('There is too little text to work with.', 400, 'IMPORT_TOO_SHORT', { needed: IMPORT_MIN_LENGTH })
    const code = current.learning.targetLanguageCode
    const step = workingStepFor(code, current.learning.proficiency)
    const draft = await writeImport({
      languageCode: code, languageName: current.learning.targetLanguage, interfaceLocale, step,
      source: { title: source.title, text: body },
    })
    const content: ImportContent = { languageName: current.learning.targetLanguage, summary: draft.summary, questions: draft.questions, words: draft.words }
    const id = nanoid()
    db.prepare(`INSERT INTO content_imports (id, language_code, interface_locale, step, source_kind, source_url, source_title, title, content_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, code, interfaceLocale, step, source.kind, source.url, source.title.slice(0, 200), draft.title, JSON.stringify(content), new Date().toISOString())
    return { content: importView(importRow(id)) }
  }

  app.get('/api/imports', async () => {
    const current = await getConfig()
    const items: ImportedContentSummary[] = rows<ImportRow>('SELECT * FROM content_imports ORDER BY created_at DESC LIMIT 120')
      .filter((item) => sameLanguage(item.language_code, current.learning.targetLanguageCode))
      .slice(0, LISTED_IMPORTS)
      .map((item) => ({ id: item.id, languageCode: item.language_code, title: item.title, source: importSource(item), createdAt: item.created_at }))
    return { items }
  })

  app.post<{ Body: { text?: string; url?: string; interfaceLocale?: string } }>('/api/imports', async (request) => {
    await assertModelConfigured()
    const body = request.body || {}
    return once(`import:${String(body.url || body.text || '').slice(0, 200)}`, () => importFrom(body))
  })

  app.get<{ Params: { id: string }; Querystring: { interfaceLocale?: string } }>('/api/imports/:id', async (request) => {
    const stored = importRow(request.params.id)
    return { content: importView(stored, normalizeUiLocale(request.query.interfaceLocale, (await getConfig()).ui.locale)) }
  })

  /** Reads the same address again: for a page that changes, such as a news front page. */
  app.post<{ Params: { id: string }; Body: { interfaceLocale?: string } }>('/api/imports/:id/refresh', async (request) => {
    await assertModelConfigured()
    const stored = importRow(request.params.id)
    if (stored.source_kind !== 'url' || !stored.source_url) throw failure('Only material read from an address can be read again.', 409, 'IMPORT_NOT_A_LINK')
    return once(`import:${stored.source_url.slice(0, 200)}`, () => importFrom({ url: stored.source_url!, interfaceLocale: request.body?.interfaceLocale }))
  })

  app.delete<{ Params: { id: string } }>('/api/imports/:id', async (request) => {
    db.prepare('DELETE FROM content_imports WHERE id = ?').run(request.params.id)
    return { ok: true }
  })

  app.post<{ Params: { id: string }; Body: { question?: number; interfaceLocale?: string } }>('/api/imports/:id/talk', async (request) => {
    await assertModelConfigured()
    const stored = importRow(request.params.id)
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(request.body?.interfaceLocale, current.ui.locale)
    const content = safeJson<ImportContent>(stored.content_json, { languageName: '', summary: '', questions: [], words: [] })
    const asked = Number.isInteger(request.body?.question) ? Number(request.body.question) : 0
    const question = content.questions[Math.max(0, Math.min(content.questions.length - 1, asked))] || ''
    return deps.createConversation(null, interfaceLocale, learningFor(current, stored.language_code, content.languageName), stored.title, {
      material: { kind: 'import', title: stored.title, text: content.summary },
      openingLine: question,
    })
  })

  /** Keeps one of the words of the retelling in the wordbook, with the sentence it stands in. */
  app.post<{ Params: { id: string }; Body: { term?: string } }>('/api/imports/:id/words', async (request) => {
    const stored = importRow(request.params.id)
    const content = safeJson<ImportContent>(stored.content_json, { languageName: '', summary: '', questions: [], words: [] })
    const word = content.words.find((item) => item.term === String(request.body?.term || ''))
    if (!word) throw failure('That word is not part of this material.', 404, 'IMPORT_WORD_NOT_FOUND')
    const existing = savedWordId(word.term, stored.language_code)
    if (existing) return { wordId: existing }
    const sentence = sentencesOf(content.summary, stored.language_code).find((item) => wordUse(item, { term: word.term }, stored.language_code)) || ''
    const id = nanoid()
    const now = new Date().toISOString()
    // The meaning was written in the interface language the material was read in.
    db.prepare('INSERT INTO word_entries (id, term, lemma, language, interface_locale, meaning, details_json, source_sentence, conversation_id, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, word.term, word.term, stored.language_code, stored.interface_locale, word.meaning, '{}', sentence || null, null, now, now, now)
    return { wordId: id }
  })

  // -------------------------------------------------------------------------------------------
  // What to talk about next

  function pathView(stored: PathRow): LearningPath {
    const content = safeJson<PathContent>(stored.items_json, { languageName: '', step: 0, items: [] })
    return {
      id: stored.id,
      languageCode: stored.language_code,
      createdAt: stored.created_at,
      items: content.items.map((item) => ({
        id: item.id,
        title: item.setup.title,
        setting: item.setup.setting,
        partnerRole: item.setup.partnerRole,
        topic: item.setup.topicSeed,
        step: content.step,
        words: item.words.map((word) => ({ ...word, meaning: meaningIn(word.wordId, stored.interface_locale) || '' })),
        mistake: item.mistake,
        conversationId: liveConversation(item.conversationId),
      })),
    }
  }

  function currentPath(languageCode: string, interfaceLocale: string, now = new Date()) {
    const stored = row<PathRow>('SELECT * FROM learning_paths WHERE language_code = ? AND interface_locale = ? ORDER BY created_at DESC LIMIT 1', languageCode, interfaceLocale)
    return stored && now.getTime() - new Date(stored.created_at).getTime() < PATH_LIFETIME ? stored : undefined
  }

  /** What the learner has talked about most lately: scene titles, or the topic a free conversation settled on. */
  function usualTopics(languageCode: string, currentCode: string, now: Date) {
    const since = new Date(now.getTime() - USUAL_TOPIC_DAYS * DAY).toISOString()
    return rows<{ topic: string | null }>(`SELECT COALESCE(
        NULLIF(CASE WHEN json_valid(setup_json) THEN json_extract(setup_json, '$.title') END, ''),
        NULLIF(CASE WHEN json_valid(state_json) THEN json_extract(state_json, '$.currentTopic') END, '')
      ) AS topic, COUNT(*) AS count, MAX(updated_at) AS lastAt
      FROM conversations WHERE (target_language_code = ? OR (target_language_code = '' AND ? = ?)) AND updated_at > ?
        AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id AND m.role = 'user' AND m.status = 'complete')
      GROUP BY 1 ORDER BY count DESC, lastAt DESC LIMIT 8`, languageCode, languageCode, currentCode, since)
      .map((item) => String(item.topic || '').trim()).filter(Boolean).slice(0, 6)
  }

  app.get<{ Querystring: { interfaceLocale?: string } }>('/api/path', async (request) => {
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(request.query.interfaceLocale, current.ui.locale)
    const stored = currentPath(current.learning.targetLanguageCode, interfaceLocale)
    return { path: stored ? pathView(stored) : null }
  })

  app.post<{ Body: { interfaceLocale?: string } }>('/api/path', async (request) => {
    await assertModelConfigured()
    return once('path', async () => {
      const current = await getConfig()
      const interfaceLocale = normalizeUiLocale(request.body?.interfaceLocale, current.ui.locale)
      const code = current.learning.targetLanguageCode
      const now = new Date()
      const step = workingStepFor(code, current.learning.proficiency)
      const { avoidRecent, learner } = setupSteering(code, now)
      const due = current.learning.reviewInConversation === false
        ? []
        : dueWords(code, now, 40).filter((word) => withinReach(word, code, step)).slice(0, 8)
      const setups = await suggestSetups({
        interfaceLocale, avoidRecent, learner, difficultyStep: step,
        path: { savedWords: due.map((word) => word.term), usualTopics: usualTopics(code, code, now) },
      })
      const taken = new Set<string>()
      const content: PathContent = {
        languageName: current.learning.targetLanguage,
        step,
        items: setups.slice(0, PATH_ITEMS).map((suggested) => {
          const { practiceWords = [], weakSpot = '', ...setup } = suggested
          const words = practiceWords.flatMap((term) => {
            const word = due.find((item) => item.term.toLowerCase() === term.trim().toLowerCase() && !taken.has(item.id))
            if (!word) return []
            taken.add(word.id)
            return [{ wordId: word.id, term: word.term, meaning: word.meaning }]
          })
          const mistake = isErrorCategory(weakSpot) && learner.weakSpots.includes(weakSpot) ? weakSpot : null
          return { id: nanoid(), setup, words, mistake, conversationId: null }
        }),
      }
      const id = nanoid()
      db.prepare('INSERT INTO learning_paths (id, language_code, interface_locale, items_json, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, code, interfaceLocale, JSON.stringify(content), now.toISOString())
      return { path: pathView(row<PathRow>('SELECT * FROM learning_paths WHERE id = ?', id)!) }
    })
  })

  app.post<{ Params: { itemId: string }; Body: { interfaceLocale?: string } }>('/api/path/:itemId/start', async (request) => {
    await assertModelConfigured()
    const current = await getConfig()
    const interfaceLocale = normalizeUiLocale(request.body?.interfaceLocale, current.ui.locale)
    for (const stored of rows<PathRow>('SELECT * FROM learning_paths ORDER BY created_at DESC LIMIT 8')) {
      const content = safeJson<PathContent>(stored.items_json, { languageName: '', step: 0, items: [] })
      const item = content.items.find((entry) => entry.id === request.params.itemId)
      if (!item) continue
      const open = liveConversation(item.conversationId)
      if (open) return { id: open }
      const setup = normalizeConversationSetup(item.setup)
      if (!setup) break
      const created = await deps.createConversation(setup, interfaceLocale, learningFor(current, stored.language_code, content.languageName), undefined, {
        words: { ids: item.words.map((word) => word.wordId), source: 'path' },
      })
      item.conversationId = created.id
      db.prepare('UPDATE learning_paths SET items_json = ? WHERE id = ?').run(JSON.stringify(content), stored.id)
      return created
    }
    throw failure('That suggestion is no longer here.', 404, 'PATH_ITEM_NOT_FOUND')
  })
}
