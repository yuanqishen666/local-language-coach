import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Fastify from 'fastify'

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'yujian-reply-writer-test-'))
process.env.NODE_ENV = 'test'
process.env.LLC_DATA_DIR = dataDirectory

type Stage = 'memory' | 'analysis' | 'reply' | 'repair'
let calls: Stage[] = []

const lookup = { action: 'reply', parts: [{ text: 'went to the market', needsLookup: false, reason: 'stable', subject: 'market' }], query: '', locator: null }
const plainReply = 'Nice! Fresh bread is the best. Which market do you go to?'
const formalReply = 'Notwithstanding the committee’s reservations, the proposal was ratified after a protracted deliberation that exposed deep ideological rifts.'
const learnerLine = 'Yesterday I goed to the market and bought two loaves of bread for my family.'
const correction = { original: 'goed', improved: 'went', explanation: '过去式是 went。', severity: 'meaning', category: 'grammar' }

function replyOf(roleReply: string) {
  return { roleReply, reconstruction: null, corrections: [], lookup, statePatch: { currentTopic: 'market', openedLoops: [], resolvedLoops: [], sceneFacts: [], userFacts: [] } }
}

const answers: Record<Stage, unknown> = {
  memory: {
    disposition: 'ignore', userFacts: [], replyType: 'casual', relevantTopics: [], relevantMemoryKeys: [],
    dialoguePlan: {
      mode: 'casual', anchorQuote: 'the market', anchorMeaning: 'The learner went to the market.', move: 'observe', topic: 'shopping', branch: 'market',
      contribution: 'Fresh bread is worth the trip.', questionPolicy: 'optional', questionPurpose: 'Which market they go to.', previousMoveOutcome: 'none', callbackMemoryKey: '', reopenBranch: false,
    },
  },
  analysis: { languageMatch: 'target', lookup, reconstruction: null, corrections: [correction] },
  reply: replyOf(plainReply),
  repair: replyOf(plainReply),
}

// Stands in for the model: answers each call of a turn and keeps count of them.
globalThis.fetch = async (_input, init = {}) => {
  const body = String(init.body || '')
  const stage: Stage = body.includes('Analyze durable user memory') ? 'memory'
    : body.includes('Analyze the latest learner turn before a conversation partner replies') ? 'analysis'
    : body.includes('Rewrite one conversation turn so it sounds like a real person') ? 'repair'
    : 'reply'
  calls.push(stage)
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answers[stage]) } }] }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

const { registerRoutes } = await import('./routes.js')
const { writeReply } = await import('./ai/engine.js')
type ReplyWriter = typeof writeReply
const { db } = await import('./services/database.js')
const { defaultConfig, saveConfigAndSecrets } = await import('./services/config.js')
const { STRUCTURED_CONTRACT_VERSION } = await import('./ai/provider.js')

const config = structuredClone(defaultConfig)
config.setupComplete = true
config.llm.defaultProvider = 'openai'
config.learning.proficiency = 'A2'
config.providers = config.providers.map((provider) => provider.id === 'openai' ? {
  ...provider,
  enabled: true,
  model: 'gpt-4.1',
  capability: {
    outputMode: 'json_schema' as const, conversationReady: true as const, lookupReady: true as const,
    baseUrl: provider.baseUrl, model: 'gpt-4.1', contractVersion: STRUCTURED_CONTRACT_VERSION, testedAt: '2026-11-20T00:00:00.000Z',
  },
} : provider)
await saveConfigAndSecrets(config, { 'providers.openai.apiKey': 'test-key' })

// A host that writes replies its own way. Each test says what that way is.
let write: ReplyWriter = writeReply
let seen: Array<Parameters<ReplyWriter>> = []
const hosted = Fastify({ logger: false })
registerRoutes(hosted, { port: () => 0, writeReply: (input, reading) => { seen.push([input, reading]); return write(input, reading) } })

// A host that leaves replies to be written the way they are here.
const plain = Fastify({ logger: false })
registerRoutes(plain, { port: () => 0 })

const beats = [
  { type: 'narration' as const, text: '你刚踩上沙滩，一个抱着图册的男人迎面走来。' },
  { type: 'say' as const, name: 'Marco', text: 'Hello my friend! Island hopping today?' },
  { type: 'say' as const, name: 'Ana', text: 'Leave them alone, Marco.' },
]
const spoken = 'Hello my friend! Island hopping today? Leave them alone, Marco.'

/** A reply in several parts, written without asking the model again, around what the reading settled. */
const inParts: ReplyWriter = async (input, reading) => ({
  coaching: {
    interfaceLocale: reading.config.ui.locale,
    roleReply: spoken,
    beats,
    reconstruction: reading.turnAnalysis.reconstruction,
    corrections: reading.turnAnalysis.corrections,
    lookup: reading.lookupDecision,
    statePatch: { currentTopic: 'island trip', openedLoops: [], resolvedLoops: [], sceneFacts: [], userFacts: reading.memoryAnalysis.userFacts },
    memoryCandidates: [],
  },
  ...(reading.level ? { level: reading.level } : {}),
  context: {
    tight: false, recentMessages: input.messages.length, episodes: 0, memories: 0, memoryIds: [], usedMemories: [],
    dialoguePlan: reading.memoryAnalysis.dialoguePlan, dialoguePolicy: reading.dialoguePolicy,
  },
})

let sent = 0
async function turn(app: typeof hosted) {
  const started = await app.inject({ method: 'POST', url: '/api/conversations', payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(started.statusCode, 200, started.body)
  const conversationId = started.json().id as string
  calls = []
  seen = []
  sent += 1
  const response = await app.inject({
    method: 'POST', url: `/api/conversations/${conversationId}/messages`,
    payload: { content: learnerLine, clientMessageId: `turn-${sent}`, interfaceLocale: 'zh-CN' },
  })
  assert.equal(response.statusCode, 200, response.body)
  return { conversationId, ...response.json() as { assistantMessage: { id: string; content: string; meta: Record<string, any> } } }
}

function count(stage: Stage) {
  return calls.filter((call) => call === stage).length
}

after(async () => {
  await hosted.close()
  await plain.close()
  db.close()
  await rm(dataDirectory, { recursive: true, force: true })
})

test('a host that gives no writer gets the reply written the way it is here', async () => {
  const { assistantMessage } = await turn(plain)
  assert.equal(assistantMessage.content, plainReply)
  assert.equal(assistantMessage.meta.beats, undefined)
  assert.deepEqual(assistantMessage.meta.corrections.map((item: { improved: string }) => item.improved), ['went'])
  assert.deepEqual([count('memory'), count('analysis'), count('reply')], [1, 1, 1])
})

test('a writer given by the host writes the reply from the same reading, and may tell it in several parts', async () => {
  write = inParts
  const { conversationId, assistantMessage } = await turn(hosted)

  // The turn was read as always, and the reply cost no model call of the built-in kind.
  assert.deepEqual([count('memory'), count('analysis'), count('reply')], [1, 1, 0])
  assert.equal(seen.length, 1)
  const [input, reading] = seen[0]
  assert.equal(input.conversationId, conversationId)
  assert.equal(reading.latestUser, learnerLine)
  assert.equal(reading.memoryAnalysis.dialoguePlan.topic, 'shopping')
  assert.ok(reading.dialoguePolicy)
  assert.ok(reading.level)

  // What is said is the message; the parts travel with it, and the coaching is what the reading found.
  assert.equal(assistantMessage.content, spoken)
  assert.deepEqual(assistantMessage.meta.beats, beats)
  assert.deepEqual(assistantMessage.meta.corrections.map((item: { improved: string }) => item.improved), ['went'])

  // They are still there when the conversation is opened again.
  const opened = await hosted.inject({ method: 'GET', url: `/api/conversations/${conversationId}?interfaceLocale=zh-CN` })
  assert.equal(opened.statusCode, 200, opened.body)
  const stored = (opened.json().messages as Array<{ id: string; content: string; meta: Record<string, any> }>).find((message) => message.id === assistantMessage.id)
  assert.equal(stored?.content, spoken)
  assert.deepEqual(stored?.meta.beats, beats)

  // The next turn is read against what was said, not against the narration.
  calls = []
  sent += 1
  const next = await hosted.inject({
    method: 'POST', url: `/api/conversations/${conversationId}/messages`,
    payload: { content: learnerLine, clientMessageId: `turn-${sent}`, interfaceLocale: 'zh-CN' },
  })
  assert.equal(next.statusCode, 200, next.body)
  const history = seen[seen.length - 1][0].messages.filter((message) => message.role === 'assistant').map((message) => message.content)
  assert.ok(history.includes(spoken))
  assert.ok(!history.some((line) => line.includes(beats[0].text)))
})

test('a writer that cannot answer its own way hands the same reading to the built-in one', async (context) => {
  // The built-in writer's first draft is too hard for this learner, so it finds something out about the level.
  answers.reply = replyOf(formalReply)
  context.after(() => { answers.reply = replyOf(plainReply) })
  let found: boolean | undefined
  write = async (input, reading) => {
    try {
      throw new Error('this way of writing failed')
    } catch {
      const result = await writeReply(input, reading)
      found = result.level?.rewritten
      return result
    }
  }
  const { assistantMessage } = await turn(hosted)
  assert.equal(assistantMessage.content, plainReply)
  assert.equal(assistantMessage.meta.beats, undefined)
  // The turn is read once; only the writing happens again.
  assert.deepEqual([count('memory'), count('analysis'), count('reply'), count('repair')], [1, 1, 1, 1])
  // What the writing found stays with its result; the reading is as it was and can be written from again.
  assert.equal(found, true)
  assert.equal(seen[0][1].level?.rewritten, false)
})

test('a reply told in several parts is not written again as one simpler line', async () => {
  write = inParts
  const { conversationId, assistantMessage } = await turn(hosted)
  calls = []
  const response = await hosted.inject({ method: 'POST', url: `/api/conversations/${conversationId}/messages/${assistantMessage.id}/simpler`, payload: {} })
  assert.equal(response.statusCode, 409, response.body)
  assert.equal(response.json().code, 'SIMPLER_UNAVAILABLE')
  assert.equal(calls.length, 0)
})
