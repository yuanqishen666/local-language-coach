import assert from 'node:assert/strict'
import test from 'node:test'
import { runsForOneself, servedByHost } from './install.js'
import { checkLimit } from './usage.js'

function answering(body: unknown) {
  const asked: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = async (input) => {
    asked.push(String(input))
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return { asked, restore: () => { globalThis.fetch = original } }
}

test('someone who runs the app for themselves is told when the month’s spending reaches their amount', async () => {
  const server = answering({ overLimit: true })
  try {
    assert.equal(runsForOneself(), true)
    assert.equal(await checkLimit(true), true)
    assert.equal(server.asked.length, 1)
    assert.ok(server.asked[0].includes('/usage?offset='), server.asked[0])
  } finally {
    server.restore()
  }
})

test('once a host serves the app with a model of its own, nothing asks what the requests came to', async () => {
  const server = answering({ overLimit: true })
  try {
    servedByHost()
    assert.equal(runsForOneself(), false)
    assert.equal(await checkLimit(true), false)
    assert.deepEqual(server.asked, [])
  } finally {
    server.restore()
  }
})
