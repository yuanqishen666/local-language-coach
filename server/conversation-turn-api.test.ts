import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'llc-conversation-turn-api-'))
process.env.LLC_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'

const { app } = await import('./index.js')
const { db } = await import('./services/database.js')
const conversationId = 'conversation-turn-test'

db.prepare(`INSERT INTO conversations (id, mode, title, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)`).run(conversationId, 'conversation', 'Test', 'active', '2026-11-17T00:00:00.000Z', '2026-11-17T00:00:00.000Z')

test.after(async () => {
  await app.close()
  await rm(dataDir, { recursive: true, force: true })
})

test('turn status distinguishes missing, pending, failed, and complete sends', async () => {
  const missing = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}/turns/missing` })
  assert.equal(missing.statusCode, 200)
  assert.equal(missing.json().status, 'missing')

  db.prepare(`INSERT INTO messages (id, conversation_id, role, content, client_message_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run('pending-user', conversationId, 'user', 'pending text', 'pending-client', 'pending', '2026-11-17T00:01:00.000Z')
  const pending = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}/turns/pending-client` })
  assert.equal(pending.json().status, 'pending')
  assert.equal(pending.json().userMessage.clientMessageId, 'pending-client')

  db.prepare(`INSERT INTO messages (id, conversation_id, role, content, client_message_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run('failed-user', conversationId, 'user', 'failed text', 'failed-client', 'failed', '2026-11-17T00:02:00.000Z')
  const failed = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}/turns/failed-client` })
  assert.equal(failed.json().status, 'failed')

  db.prepare(`INSERT INTO messages (id, conversation_id, role, content, client_message_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run('complete-user', conversationId, 'user', 'complete text', 'complete-client', 'complete', '2026-11-17T00:03:00.000Z')
  db.prepare(`INSERT INTO messages (id, conversation_id, role, content, meta_json, reply_to_message_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('complete-assistant', conversationId, 'assistant', 'reply', '{}', 'complete-user', 'complete', '2026-11-17T00:03:01.000Z')
  const complete = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}/turns/complete-client` })
  assert.equal(complete.json().status, 'complete')
  assert.equal(complete.json().assistantMessage.content, 'reply')
})

test('a client message id cannot be reused for different content', async () => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { content: 'different text', clientMessageId: 'complete-client', interfaceLocale: 'zh-CN' },
  })

  assert.equal(response.statusCode, 409)
  assert.equal(response.json().code, 'CLIENT_MESSAGE_ID_CONFLICT')
})

test('an identical completed send returns its stored reply without calling the model again', async () => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { content: 'complete text', clientMessageId: 'complete-client', interfaceLocale: 'zh-CN' },
  })

  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.json().userMessage.id, 'complete-user')
  assert.equal(response.json().assistantMessage.id, 'complete-assistant')
})
