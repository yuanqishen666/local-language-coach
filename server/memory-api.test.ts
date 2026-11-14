import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'yanxi-memory-test-'))
const legacy = new DatabaseSync(path.join(dataDirectory, 'app.db'))
legacy.exec(`CREATE TABLE memories (
  id TEXT PRIMARY KEY, category TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1, sensitive INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed', source_conversation_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(category, key)
);
CREATE TABLE conversation_episodes (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, start_message_id TEXT NOT NULL, end_message_id TEXT NOT NULL,
  thread TEXT NOT NULL, summary TEXT NOT NULL, facts_json TEXT NOT NULL DEFAULT '[]',
  open_loops_json TEXT NOT NULL DEFAULT '[]', keywords_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`)
legacy.prepare(`INSERT INTO memories
  (id, category, key, value, confidence, sensitive, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, 1, 0, 'confirmed', ?, ?)`).run('legacy-memory', 'personal', '称呼偏好', '喜欢被叫作 Alex', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
legacy.prepare(`INSERT INTO conversation_episodes
  (id, conversation_id, start_message_id, end_message_id, thread, summary, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
  'legacy-episode', 'legacy-conversation', 'm1', 'm2', '旧话题', '旧摘要',
  '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
)
legacy.close()

process.env.NODE_ENV = 'test'
process.env.LLC_DATA_DIR = dataDirectory
const { app } = await import('./index.js')

after(async () => {
  await app.close()
  await rm(dataDirectory, { recursive: true, force: true })
})

test('legacy memories migrate without data loss', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/memories' })
  assert.equal(response.statusCode, 200)
  const memory = response.json().find((item: { id: string }) => item.id === 'legacy-memory')
  assert.equal(memory.value, '喜欢被叫作 Alex')
  assert.equal(memory.tier, 'long_term')
  assert.equal(memory.validFrom, '2026-01-01T00:00:00.000Z')
  assert.equal(memory.interfaceLocale, '')
  assert.equal(memory.lastMentionedAt, null)
  assert.equal(memory.mentionCount, 0)
  assert.equal(memory.semanticSlot, 'profile.preferred-name')

  const exported = await app.inject({ method: 'GET', url: '/api/export' })
  const episode = exported.json().episodes.find((item: { id: string }) => item.id === 'legacy-episode')
  assert.equal(episode.topic_arcs_json, '[]')
  assert.equal(episode.interaction_signals_json, '[]')
})

test('a localized key with the same semantic slot updates one memory instead of creating a duplicate', async () => {
  let response = await app.inject({
    method: 'POST',
    url: '/api/memories',
    payload: { category: 'personal', key: '职业', semanticSlot: 'profile.occupation', value: '软件工程师', memoryType: 'profile', topic: 'work' },
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().action, 'create')
  const id = response.json().id as string

  response = await app.inject({
    method: 'POST',
    url: '/api/memories',
    payload: { category: 'personal', key: 'occupation', semanticSlot: 'profile.occupation', value: 'product manager', memoryType: 'profile', topic: 'work' },
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().action, 'update')
  assert.equal(response.json().id, id)

  response = await app.inject({ method: 'GET', url: '/api/memories' })
  const matching = response.json().filter((item: { semanticSlot: string }) => item.semanticSlot === 'profile.occupation')
  assert.equal(matching.length, 1)
  assert.equal(matching[0].value, 'product manager')
})

test('memory updates preserve revisions and core tier', async () => {
  let response = await app.inject({
    method: 'POST',
    url: '/api/memories',
    payload: { category: 'personal', key: '海边偏好', value: '喜欢安静、水清的海边', tier: 'long_term', memoryType: 'preference', topic: 'beach', importance: 0.8, interfaceLocale: 'zh-CN' },
  })
  assert.equal(response.statusCode, 200)
  const id = response.json().id as string

  response = await app.inject({ method: 'PATCH', url: `/api/memories/${id}/tier`, payload: { tier: 'core' } })
  assert.equal(response.statusCode, 200)
  response = await app.inject({
    method: 'POST',
    url: '/api/memories',
    payload: { category: 'personal', key: '海边偏好', value: '现在更喜欢热闹的海边', tier: 'core', memoryType: 'preference', topic: 'beach', importance: 0.9 },
  })
  assert.equal(response.statusCode, 200)
  response = await app.inject({
    method: 'POST',
    url: '/api/memories',
    payload: { category: 'personal', key: '海边偏好', value: '现在更喜欢有活动但不拥挤的海边' },
  })
  assert.equal(response.statusCode, 200)

  response = await app.inject({ method: 'GET', url: '/api/memories' })
  const memory = response.json().find((item: { id: string }) => item.id === id)
  assert.equal(memory.tier, 'core')
  assert.equal(memory.value, '现在更喜欢有活动但不拥挤的海边')
  assert.equal(memory.memoryType, 'preference')
  assert.equal(memory.topic, 'beach')
  assert.equal(memory.importance, 0.9)
  assert.equal(memory.interfaceLocale, 'zh-CN')

  response = await app.inject({ method: 'GET', url: '/api/export' })
  const revisions = response.json().memoryRevisions.filter((item: { memory_id: string }) => item.memory_id === id)
  assert.deepEqual(revisions.map((item: { change_type: string }) => item.change_type).sort(), ['create', 'promote', 'update', 'update'])
})

test('sensitive memory can be stored and promoted into always-injected core memory', async () => {
  let response = await app.inject({
    method: 'POST',
    url: '/api/memories',
    payload: { category: 'personal', key: '健康限制', value: '敏感内容', tier: 'core', memoryType: 'constraint', topic: 'health', sensitive: true },
  })
  assert.equal(response.statusCode, 200)
  const id = response.json().id as string
  response = await app.inject({ method: 'GET', url: '/api/memories' })
  assert.equal(response.json().find((item: { id: string }) => item.id === id).tier, 'core')
  response = await app.inject({ method: 'PATCH', url: `/api/memories/${id}/tier`, payload: { tier: 'long_term' } })
  assert.equal(response.statusCode, 200)
  response = await app.inject({ method: 'PATCH', url: `/api/memories/${id}/tier`, payload: { tier: 'core' } })
  assert.equal(response.statusCode, 200)
})

test('core memory has a hard fifteen-item ceiling', async () => {
  let response = await app.inject({ method: 'GET', url: '/api/memories' })
  const currentCoreCount = response.json().filter((item: { tier: string }) => item.tier === 'core').length
  for (let index = currentCoreCount; index < 15; index += 1) {
    response = await app.inject({
      method: 'POST',
      url: '/api/memories',
      payload: { category: 'personal', key: `核心测试 ${index}`, value: `value ${index}`, tier: 'core', memoryType: 'constraint', topic: 'test' },
    })
    assert.equal(response.statusCode, 200)
  }
  response = await app.inject({
    method: 'POST',
    url: '/api/memories',
    payload: { category: 'personal', key: '超出核心上限', value: 'should fail', tier: 'core', memoryType: 'constraint', topic: 'test' },
  })
  assert.equal(response.statusCode, 409)
  assert.equal(response.json().code, 'CORE_MEMORY_LIMIT')
})
