import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'yujian-scene-presets-test-'))
process.env.NODE_ENV = 'test'
process.env.LLC_DATA_DIR = dataDirectory
const { app } = await import('./index.js')

after(async () => {
  await app.close()
  await rm(dataDirectory, { recursive: true, force: true })
})

test('preset catalog exposes instant and one-anchor choices without internal prompts', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/conversation-presets' })
  assert.equal(response.statusCode, 200)
  const body = response.json() as { presets: Array<Record<string, unknown>> }
  assert.equal(body.presets.filter((item) => item.kind === 'instant').length, 6)
  assert.equal(body.presets.filter((item) => item.kind === 'anchor').length, 9)
  assert.ok(body.presets.every((item) => !('promptBrief' in item)))
})

test('unknown preset and missing anchor fail before model generation', async () => {
  const missing = await app.inject({ method: 'POST', url: '/api/conversation-presets/unknown/start', payload: {} })
  assert.equal(missing.statusCode, 404)
  const anchor = await app.inject({ method: 'POST', url: '/api/conversation-presets/destination/start', payload: {} })
  assert.equal(anchor.statusCode, 400)
  assert.equal(anchor.json().code, 'SCENE_ANCHOR_REQUIRED')
})
