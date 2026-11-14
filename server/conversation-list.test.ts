import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'yanxi-conversation-list-test-'))
process.env.NODE_ENV = 'test'
process.env.LLC_DATA_DIR = dataDirectory
const { app } = await import('./index.js')
const { db } = await import('./services/database.js')

after(async () => {
  await app.close()
  await rm(dataDirectory, { recursive: true, force: true })
})

test('conversation list distinguishes direct and scene chats and returns a bounded first-message preview', async () => {
  const now = '2026-11-11T12:00:00.000Z'
  db.prepare(`INSERT INTO conversations
    (id, mode, title, setup_json, state_json, status, created_at, updated_at)
    VALUES (?, 'conversation', ?, ?, '{}', 'active', ?, ?)`).run('direct-1', '直接聊天', null, now, now)
  db.prepare(`INSERT INTO conversations
    (id, mode, title, setup_json, state_json, status, created_at, updated_at)
    VALUES (?, 'conversation', ?, ?, '{}', 'archived', ?, ?)`).run('scene-1', '海边闲聊', JSON.stringify({ title: '海边闲聊' }), now, now)
  db.prepare(`INSERT INTO conversations
    (id, mode, title, setup_json, state_json, status, created_at, updated_at)
    VALUES (?, 'conversation', ?, ?, '{}', 'active', ?, ?)`).run('empty-direct', '直接聊天', null, now, now)
  db.prepare(`INSERT INTO conversations
    (id, mode, title, setup_json, state_json, status, created_at, updated_at)
    VALUES (?, 'conversation', ?, ?, '{}', 'active', ?, ?)`).run('assistant-only-scene', '咖啡店闲聊', JSON.stringify({ title: '咖啡店闲聊' }), now, now)
  const longMessage = `我想聊聊安静又水清的海边，${'以及附近适合散步的地方。'.repeat(30)}`
  db.prepare(`INSERT INTO messages
    (id, conversation_id, role, content, status, created_at)
    VALUES (?, ?, 'user', ?, 'complete', ?)`).run('message-1', 'direct-1', longMessage, now)
  db.prepare(`INSERT INTO messages
    (id, conversation_id, role, content, status, created_at)
    VALUES (?, ?, 'user', ?, 'complete', ?)`).run('message-2', 'scene-1', '我更喜欢安静的海岸线。', now)
  db.prepare(`INSERT INTO messages
    (id, conversation_id, role, content, status, created_at)
    VALUES (?, ?, 'assistant', ?, 'complete', ?)`).run('opening-message', 'assistant-only-scene', '欢迎来到咖啡店。', now)

  const response = await app.inject({ method: 'GET', url: '/api/conversations' })
  assert.equal(response.statusCode, 200)
  const items = response.json() as Array<{ id: string; kind: string; firstMessage: string }>
  const direct = items.find((item) => item.id === 'direct-1')
  const scene = items.find((item) => item.id === 'scene-1')
  assert.equal(items.length, 2)
  assert.equal(direct?.kind, 'direct')
  assert.equal(scene?.kind, 'scene')
  assert.equal(direct?.firstMessage, longMessage.slice(0, 240))
  assert.equal(scene?.firstMessage, '我更喜欢安静的海岸线。')
  assert.ok(!items.some((item) => item.id === 'empty-direct'))
  assert.ok(!items.some((item) => item.id === 'assistant-only-scene'))
})

test('conversation list includes a failed turn because the learner submitted content', async () => {
  const now = '2026-11-14T12:00:00.000Z'
  db.prepare(`INSERT INTO conversations
    (id, mode, title, setup_json, state_json, status, created_at, updated_at)
    VALUES (?, 'conversation', ?, ?, '{}', 'active', ?, ?)`).run('failed-turn', '直接聊天', null, now, now)
  db.prepare(`INSERT INTO messages
    (id, conversation_id, role, content, status, created_at)
    VALUES (?, ?, 'user', ?, 'failed', ?)`).run('failed-message', 'failed-turn', '这条消息确实发送过。', now)

  const response = await app.inject({ method: 'GET', url: '/api/conversations' })
  assert.equal(response.statusCode, 200)
  const items = response.json() as Array<{ id: string; firstMessage: string }>
  assert.equal(items.find((item) => item.id === 'failed-turn')?.firstMessage, '这条消息确实发送过。')
})
