import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'yujian-scene-start-api-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'

type Task = 'backgrounds' | 'encounters' | 'critic' | 'setups'
interface ModelCall { task: Task; count: number; compact: boolean; host: string; body: string }
interface ModelAnswer { content: string; truncated?: boolean }

let answer: (call: ModelCall) => ModelAnswer = wellBehaved
let calls: ModelCall[] = []

function backgroundItem(n: number) {
  return {
    candidateId: `bg-${n}`, identityKey: `cafe-regular-${n}`, title: `街角咖啡店 ${n}`, setting: '工作日下午的街角咖啡店', partnerRole: '常来的熟客',
    relationship: '见过几次的熟面孔', sharedContext: '都喜欢靠窗的位置', registerHint: '轻松随意',
    openAffordances: ['聊聊店里的新品'], destinationSpecificity: 'not_applicable', participants: [],
    localStyle: { locale: 'en-US', register: '日常口语', relationshipDistance: '熟面孔', addressNorms: [], turnTaking: [], pragmaticNotes: [], avoidPhrases: [] },
    factPolicy: { stableFacts: [], doNotAssert: [], asOf: '2026-11-20' }, safetyClass: 'normal',
  }
}

const openings = [
  'Oh hey, the window seat is finally free today.',
  'I think they changed the playlist, did you notice?',
  'Careful, that mug is hotter than it looks.',
  'You picked the last almond croissant, good choice.',
]
const moments = ['窗边的位置刚空出来', '店里换了背景音乐', '刚端上来的咖啡还很烫', '柜台只剩最后一个可颂']

function encounterItem(n: number, changes: Record<string, unknown> = {}, setupChanges: Record<string, unknown> = {}) {
  return {
    candidateId: `run-${n}`, transientState: moments[n - 1], socialEnergy: '放松', openingAct: '随口一提', initialAffordance: moments[n - 1],
    initiativeMode: 'CO_LEAD', dynamicSummary: `对方注意到${moments[n - 1]}`,
    ...changes,
    setup: {
      title: '咖啡店的下午', category: '日常', setting: '工作日下午的街角咖啡店', partnerName: 'Maya', partnerRole: '常来的熟客',
      relationship: '见过几次的熟面孔', tone: '轻松随意', personalityCues: ['随和'], interests: ['手冲咖啡'], currentMood: '放松',
      topicSeed: moments[n - 1], openingLine: openings[n - 1], difficulty: 'B1',
      ...setupChanges,
    },
  }
}

function setupItem(n: number, changes: Record<string, unknown> = {}) {
  return {
    title: `周末市集 ${n}`, category: '日常', setting: '周六上午的社区市集', partnerName: 'Liam', partnerRole: '面包摊主',
    relationship: '第一次见面', tone: '友好自然', personalityCues: ['健谈'], interests: ['烘焙'], currentMood: '心情不错',
    topicSeed: '刚出炉的面包', openingLine: openings[n - 1], difficulty: 'B1',
    ...changes,
  }
}

function list(count: number, item: (n: number) => unknown) {
  return Array.from({ length: count }, (_, index) => item(index + 1))
}

function critique(call: ModelCall, eligible: boolean) {
  const ids = [...new Set(call.body.match(/run-\d+/g) || [])]
  return JSON.stringify({
    evaluations: ids.map((candidateId) => ({ candidateId, eligible, issues: [] })),
    rankedCandidateIds: eligible ? ids : [],
  })
}

function wellBehaved(call: ModelCall): ModelAnswer {
  if (call.task === 'backgrounds') return { content: JSON.stringify({ backgrounds: list(call.count, backgroundItem) }) }
  if (call.task === 'encounters') return { content: JSON.stringify({ encounters: list(call.count, (n) => encounterItem(n)) }) }
  if (call.task === 'setups') return { content: JSON.stringify({ setups: list(call.count, (n) => setupItem(n)) }) }
  return { content: critique(call, true) }
}

/** Two items were being written; the answer stops inside the second one. */
function cutInsideSecond(key: string, items: unknown[], marker: string): ModelAnswer {
  const full = JSON.stringify({ [key]: items })
  return { content: full.slice(0, full.lastIndexOf(marker) + marker.length + 4), truncated: true }
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  const body = String(init.body || '')
  const task: Task = body.includes('reusable background seed') ? 'backgrounds'
    : body.includes('runtime encounter candidate') ? 'encounters'
    : body.includes('Locale/Register Critic') ? 'critic'
    : 'setups'
  const call: ModelCall = {
    task,
    count: Number(/(?:exactly|up to) (\d+)/.exec(body)?.[1] || 0),
    compact: body.includes('The previous answer was cut off or incomplete.'),
    host: url.hostname,
    body,
  }
  calls.push(call)
  const { content, truncated } = answer(call)
  if (url.hostname === 'api.anthropic.com') {
    return jsonResponse({ content: [{ type: 'text', text: content }], stop_reason: truncated ? 'max_tokens' : 'end_turn' })
  }
  if (url.hostname === 'generativelanguage.googleapis.com') {
    return jsonResponse({ candidates: [{ content: { parts: [{ text: content }] }, finishReason: truncated ? 'MAX_TOKENS' : 'STOP' }] })
  }
  return jsonResponse({ choices: [{ finish_reason: truncated ? 'length' : 'stop', message: { content } }] })
}

const { app } = await import('./index.js')
const { db } = await import('./services/database.js')
const { defaultConfig, saveConfigAndSecrets } = await import('./services/config.js')
const { STRUCTURED_CONTRACT_VERSION } = await import('./ai/provider.js')

const models = { openai: 'gpt-4.1', anthropic: 'claude-sonnet-5-5', gemini: 'gemini-3-pro', deepseek: 'deepseek-chat', kimi: 'kimi-k3' } as const
type ProviderId = keyof typeof models

async function useProvider(id: ProviderId, maxOutputTokens = 1_200) {
  const config = structuredClone(defaultConfig)
  config.setupComplete = true
  config.llm.defaultProvider = id
  config.providers = config.providers.map((provider) => provider.id === id ? {
    ...provider,
    enabled: true,
    model: models[id],
    maxOutputTokens,
    capability: {
      outputMode: id === 'deepseek' ? 'json_object' as const : 'json_schema' as const,
      conversationReady: true as const,
      lookupReady: true as const,
      baseUrl: provider.baseUrl,
      model: models[id],
      contractVersion: STRUCTURED_CONTRACT_VERSION,
      testedAt: '2026-11-20T00:00:00.000Z',
    },
  } : provider)
  await saveConfigAndSecrets(config, { [`providers.${id}.apiKey`]: 'test-key' })
}

function reset(next: (call: ModelCall) => ModelAnswer = wellBehaved) {
  for (const table of ['scene_runs', 'messages', 'conversations', 'scene_backgrounds', 'scene_anchors']) db.exec(`DELETE FROM ${table}`)
  calls = []
  answer = next
}

function startScene(presetId = 'cafe-moment') {
  return app.inject({ method: 'POST', url: `/api/conversation-presets/${presetId}/start`, payload: { interfaceLocale: 'zh-CN' } })
}

function suggest() {
  return app.inject({ method: 'POST', url: '/api/conversation-setups/suggest', payload: { domain: '日常', place: '社区市集', detail: '买面包', interfaceLocale: 'zh-CN' } })
}

function requested(task: Task) {
  return calls.filter((call) => call.task === task).map((call) => ({ count: call.count, compact: call.compact }))
}

function storedOpening() {
  return (db.prepare("SELECT content FROM messages WHERE role = 'assistant'").all() as Array<{ content: string }>).map((row) => row.content)
}

function storedBackgrounds() {
  return (db.prepare('SELECT COUNT(*) AS total FROM scene_backgrounds').get() as { total: number }).total
}

test.after(async () => {
  await app.close()
  await rm(dataDir, { recursive: true, force: true })
})

test('the default output limit asks for one background and two openings', async () => {
  await useProvider('openai')
  reset()
  const response = await startScene()
  assert.equal(response.statusCode, 200, response.body)
  assert.deepEqual(requested('backgrounds'), [{ count: 1, compact: false }])
  assert.deepEqual(requested('encounters'), [{ count: 2, compact: false }])
  assert.equal(storedOpening().length, 1)
  assert.ok(openings.includes(storedOpening()[0]))
})

test('a larger output limit asks for more in one answer', async () => {
  await useProvider('openai', 4_000)
  reset()
  const response = await startScene()
  assert.equal(response.statusCode, 200, response.body)
  assert.deepEqual(requested('backgrounds'), [{ count: 4, compact: false }])
  assert.deepEqual(requested('encounters'), [{ count: 4, compact: false }])
  assert.equal(storedBackgrounds(), 4)
})

test('the next start tops the background pool up without asking for more than is missing', async () => {
  await useProvider('openai')
  reset()
  assert.equal((await startScene()).statusCode, 200)
  assert.equal(storedBackgrounds(), 1)
  calls = []
  answer = (call) => call.task === 'backgrounds'
    ? { content: JSON.stringify({ backgrounds: [{ ...backgroundItem(2), setting: '周末早晨的社区咖啡馆', partnerRole: '刚搬来的邻居', relationship: '第一次搭话' }] }) }
    : call.task === 'encounters'
      ? { content: JSON.stringify({ encounters: [encounterItem(3), encounterItem(4)] }) }
      : wellBehaved(call)
  assert.equal((await startScene()).statusCode, 200)
  assert.deepEqual(requested('backgrounds'), [{ count: 1, compact: false }])
  assert.equal(storedBackgrounds(), 2)
})

test('a failed top-up does not block a scene that already has a background', async () => {
  await useProvider('openai')
  reset()
  assert.equal((await startScene()).statusCode, 200)
  calls = []
  answer = (call) => call.task === 'backgrounds'
    ? { content: '', truncated: true }
    : call.task === 'encounters'
      ? { content: JSON.stringify({ encounters: [encounterItem(3), encounterItem(4)] }) }
      : wellBehaved(call)
  const response = await startScene()
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(storedBackgrounds(), 1)
})

test('a cut-off background answer keeps the seed that was finished', async () => {
  await useProvider('openai')
  for (const marker of ['"sharedContext"', '"factPolicy"']) {
    reset((call) => call.task === 'backgrounds'
      ? cutInsideSecond('backgrounds', [backgroundItem(1), backgroundItem(2)], marker)
      : wellBehaved(call))
    const response = await startScene()
    assert.equal(response.statusCode, 200, response.body)
    assert.equal(requested('backgrounds').length, 1, marker)
    assert.equal(storedBackgrounds(), 1, marker)
  }
})

test('a cut-off answer with nothing finished is asked again in the shortest form', async () => {
  await useProvider('openai', 4_000)
  reset((call) => {
    if (call.compact) return wellBehaved(call)
    if (call.task === 'backgrounds') return { content: '{"backgrounds":[{"candidateId":"bg-1","title":"街角', truncated: true }
    if (call.task === 'encounters') return { content: '', truncated: true }
    return wellBehaved(call)
  })
  const response = await startScene()
  assert.equal(response.statusCode, 200, response.body)
  assert.deepEqual(requested('backgrounds'), [{ count: 4, compact: false }, { count: 1, compact: true }])
  assert.deepEqual(requested('encounters'), [{ count: 4, compact: false }, { count: 1, compact: true }])
})

test('an answer that never fits reports the output limit and the value to raise it to', async () => {
  await useProvider('openai')
  reset((call) => call.task === 'backgrounds' ? { content: '{"backgrounds":[{"candidateId":"bg-1","title":"街角', truncated: true } : wellBehaved(call))
  const small = await startScene()
  assert.equal(small.statusCode, 422)
  assert.equal(small.json().code, 'PROVIDER_TRUNCATED_RESPONSE')
  assert.deepEqual(small.json().details, { maxOutputTokens: 1_200, recommendedMaxOutputTokens: 2_000 })
  assert.deepEqual(requested('backgrounds'), [{ count: 1, compact: false }, { count: 1, compact: true }])

  await useProvider('openai', 3_000)
  reset((call) => call.task === 'encounters' ? { content: '', truncated: true } : wellBehaved(call))
  const large = await startScene()
  assert.equal(large.statusCode, 422)
  assert.deepEqual(large.json().details, { maxOutputTokens: 3_000, recommendedMaxOutputTokens: 6_000 })
  assert.ok(!('partialContent' in large.json()))
})

test('one unusable opening does not discard the others', async () => {
  await useProvider('openai')
  reset((call) => call.task === 'encounters'
    ? { content: JSON.stringify({ encounters: [
        encounterItem(1, {}, { openingLine: '今天靠窗的位置终于空出来了。' }),
        encounterItem(2, { transientState: undefined, socialEnergy: undefined }, { category: undefined, currentMood: undefined }),
      ] }) }
    : wellBehaved(call))
  const response = await startScene()
  assert.equal(response.statusCode, 200, response.body)
  assert.deepEqual(storedOpening(), [openings[1]])
  assert.equal(requested('encounters').length, 1)
})

test('a scene still starts when the critic approves nothing', async () => {
  await useProvider('openai')
  reset((call) => call.task === 'critic' ? { content: critique(call, false) } : wellBehaved(call))
  const response = await startScene()
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(requested('encounters').length, 2)
  assert.equal(requested('critic').length, 2)
  assert.equal(storedOpening().length, 1)
})

test('descriptions in the wrong language are a last resort, not a failure', async () => {
  await useProvider('openai')
  reset((call) => {
    if (call.task === 'backgrounds') return { content: JSON.stringify({ backgrounds: [{ ...backgroundItem(1), title: 'Corner cafe', setting: 'A corner cafe on a weekday afternoon', partnerRole: 'A regular customer', relationship: 'A familiar face', sharedContext: 'Both like the window seats', registerHint: 'Relaxed' }] }) }
    return wellBehaved(call)
  })
  const response = await startScene()
  assert.equal(response.statusCode, 200, response.body)
  assert.deepEqual(requested('backgrounds'), [{ count: 1, compact: false }, { count: 1, compact: true }])
})

test('an answer without the expected wrapper is still read', async () => {
  await useProvider('deepseek')
  reset((call) => {
    if (call.task === 'backgrounds') return { content: JSON.stringify(backgroundItem(1)) }
    if (call.task === 'encounters') return { content: JSON.stringify([encounterItem(1), encounterItem(2)]) }
    return wellBehaved(call)
  })
  const response = await startScene()
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(requested('backgrounds').length, 1)
  assert.equal(requested('encounters').length, 1)

  reset(() => ({ content: JSON.stringify({ openings: [setupItem(1)] }) }))
  const custom = await suggest()
  assert.equal(custom.statusCode, 200, custom.body)
  assert.equal(custom.json().setups.length, 1)
})

test('every supported provider recovers a cut-off answer', async () => {
  for (const id of Object.keys(models) as ProviderId[]) {
    await useProvider(id)
    reset((call) => {
      if (call.task === 'backgrounds') return cutInsideSecond('backgrounds', [backgroundItem(1), backgroundItem(2)], '"sharedContext"')
      if (call.task === 'encounters') return cutInsideSecond('encounters', [encounterItem(1), encounterItem(2)], '"openingLine"')
      return wellBehaved(call)
    })
    const response = await startScene()
    assert.equal(response.statusCode, 200, `${id}: ${response.body}`)
    assert.equal(requested('backgrounds').length, 1, id)
    assert.equal(requested('encounters').length, 1, id)
    assert.deepEqual(storedOpening(), [openings[0]], id)

    reset((call) => call.task === 'backgrounds' ? { content: '', truncated: true } : wellBehaved(call))
    const failed = await startScene()
    assert.equal(failed.statusCode, 422, id)
    assert.equal(failed.json().code, 'PROVIDER_TRUNCATED_RESPONSE', id)
    assert.equal(failed.json().details.maxOutputTokens, 1_200, id)
  }
})

test('custom openings are sized to the output limit and survive a cut-off answer', async () => {
  await useProvider('openai')
  reset()
  const sized = await suggest()
  assert.equal(sized.statusCode, 200, sized.body)
  assert.deepEqual(requested('setups'), [{ count: 2, compact: false }])
  assert.equal(sized.json().setups.length, 2)

  reset(() => cutInsideSecond('setups', [setupItem(1), setupItem(2)], '"openingLine"'))
  const cut = await suggest()
  assert.equal(cut.statusCode, 200, cut.body)
  assert.equal(requested('setups').length, 1)
  assert.deepEqual(cut.json().setups.map((setup: { openingLine: string }) => setup.openingLine), [openings[0]])
})

test('custom openings keep the usable ones and report the output limit when nothing fits', async () => {
  await useProvider('openai')
  reset(() => ({ content: JSON.stringify({ setups: [
    setupItem(1, { openingLine: '早上好，这些面包刚出炉。' }),
    setupItem(2, { partnerRole: undefined, relationship: undefined, tone: undefined, currentMood: undefined }),
  ] }) }))
  const kept = await suggest()
  assert.equal(kept.statusCode, 200, kept.body)
  assert.deepEqual(kept.json().setups.map((setup: { openingLine: string }) => setup.openingLine), [openings[1]])

  reset(() => ({ content: '{"setups":[{"title":"周末', truncated: true }))
  const failed = await suggest()
  assert.equal(failed.statusCode, 422)
  assert.equal(failed.json().code, 'PROVIDER_TRUNCATED_RESPONSE')
  assert.deepEqual(failed.json().details, { maxOutputTokens: 1_200, recommendedMaxOutputTokens: 2_000 })
  assert.deepEqual(requested('setups'), [{ count: 2, compact: false }, { count: 1, compact: true }])
})

const interviewOpenings = [
  'Welcome! Please take a seat and tell me a little about yourself.',
  'Morning! Coffee first, or shall we dive straight into the system design question?',
]
const corrected = 'An earlier answer was turned down because of the language it was written in.'

test('openings made of short everyday sentences start a custom chat and a preset scene on the first answer', async () => {
  await useProvider('openai')
  reset(() => ({ content: JSON.stringify({ setups: list(2, (n) => setupItem(n, { title: `程序员面试模拟 ${n}`, category: '工作', setting: '一家 SaaS 公司的会议室', partnerRole: '技术面试官', interests: ['TypeScript'], openingLine: interviewOpenings[n - 1] })) }) }))
  const custom = await app.inject({ method: 'POST', url: '/api/conversation-setups/suggest', payload: { domain: '工作', place: '程序员面试技巧', detail: '面试模拟', interfaceLocale: 'zh-CN' } })
  assert.equal(custom.statusCode, 200, custom.body)
  assert.deepEqual(requested('setups'), [{ count: 2, compact: false }])
  assert.deepEqual(custom.json().setups.map((setup: { openingLine: string }) => setup.openingLine), interviewOpenings)

  reset((call) => call.task === 'encounters'
    ? { content: JSON.stringify({ encounters: list(call.count, (n) => encounterItem(n, {}, { openingLine: interviewOpenings[n - 1] })) }) }
    : wellBehaved(call))
  const scene = await startScene()
  assert.equal(scene.statusCode, 200, scene.body)
  assert.equal(requested('encounters').length, 1)
  assert.equal(interviewOpenings.includes(storedOpening()[0]), true)
})

test('an opening in the wrong language is asked for again with the correction, and is reported as a language problem if it stays wrong', async () => {
  await useProvider('openai')
  const inInterfaceLanguage = { openingLine: '早上好，这些面包刚出炉。' }

  reset((call) => ({ content: JSON.stringify({ setups: list(call.count, (n) => setupItem(n, call.body.includes(corrected) ? {} : inInterfaceLanguage)) }) }))
  const recovered = await suggest()
  assert.equal(recovered.statusCode, 200, recovered.body)
  assert.deepEqual(calls.map((call) => call.body.includes(corrected)), [false, true])
  assert.deepEqual(recovered.json().setups.map((setup: { openingLine: string }) => setup.openingLine), [openings[0]])

  reset(() => ({ content: JSON.stringify({ setups: [setupItem(1, inInterfaceLanguage)] }) }))
  const failed = await suggest()
  assert.equal(failed.statusCode, 502, failed.body)
  assert.equal(failed.json().code, 'PROVIDER_WRONG_LANGUAGE')
  assert.deepEqual(failed.json().details, { targetLanguage: 'English', targetLanguageCode: 'en' })
  assert.equal(requested('setups').length, 2)

  reset((call) => call.task === 'encounters'
    ? { content: JSON.stringify({ encounters: list(call.count, (n) => encounterItem(n, {}, { openingLine: '窗边的位置终于空出来了。' })) }) }
    : wellBehaved(call))
  const scene = await startScene()
  assert.equal(scene.statusCode, 502, scene.body)
  assert.equal(scene.json().code, 'PROVIDER_WRONG_LANGUAGE')
  assert.deepEqual(calls.filter((call) => call.task === 'encounters').map((call) => call.body.includes(corrected)), [false, true])
  assert.equal(storedOpening().length, 0)
})

test('a provider that ignores the requested structure is asked once more in plain JSON, on every provider', async () => {
  for (const id of Object.keys(models) as ProviderId[]) {
    await useProvider(id)
    // The first answer of each kind uses field names of the model's own; the plain-JSON request carries the example.
    reset((call) => {
      if (call.body.includes('Compact example')) return wellBehaved(call)
      if (call.task === 'setups') return { content: JSON.stringify({ scenarios: [{ name: 'Market', firstLine: openings[0] }] }) }
      return wellBehaved(call)
    })
    const custom = await suggest()
    assert.equal(custom.statusCode, 200, `${id}: ${custom.body}`)
    assert.equal(custom.json().setups.length > 0, true, id)
    // DeepSeek is never in schema mode, so its first request already carries the example.
    assert.equal(requested('setups').length, id === 'deepseek' ? 1 : 2, id)

    // A reply wrapped in prose and a code fence is still read.
    reset((call) => call.task === 'setups'
      ? { content: 'Here you go:\n```json\n' + JSON.stringify({ setups: list(call.count, (n) => setupItem(n)) }) + '\n```\nLet me know if you need more.' }
      : wellBehaved(call))
    const fenced = await suggest()
    assert.equal(fenced.statusCode, 200, `${id}: ${fenced.body}`)
    assert.equal(requested('setups').length, 1, id)
  }
})
