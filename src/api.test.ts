import assert from 'node:assert/strict'
import test from 'node:test'
import { api } from './api.js'

test('DELETE without a body does not claim to contain JSON', async () => {
  const originalFetch = globalThis.fetch
  let capturedHeaders = new Headers()
  globalThis.fetch = async (_input, init) => {
    capturedHeaders = new Headers(init?.headers)
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    await api.delete('/conversations/missing')
    assert.equal(capturedHeaders.has('content-type'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('JSON requests still send the JSON content type', async () => {
  const originalFetch = globalThis.fetch
  let capturedHeaders = new Headers()
  globalThis.fetch = async (_input, init) => {
    capturedHeaders = new Headers(init?.headers)
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    await api.post('/example', { ok: true })
    assert.equal(capturedHeaders.get('content-type'), 'application/json')
  } finally {
    globalThis.fetch = originalFetch
  }
})
