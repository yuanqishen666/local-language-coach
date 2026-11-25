import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { fetchWithRetry, ProviderRequestError } from './provider.js'
import { setUsageGate, withUsageScope, type UsageScope } from './usage-meter.js'

const realFetch = globalThis.fetch
let sent = 0
globalThis.fetch = (async () => { sent += 1; return new Response('{}') }) as typeof fetch

afterEach(() => {
  setUsageGate()
  sent = 0
})
test.after(() => { globalThis.fetch = realFetch })

test('a request to a model service is sent when nobody turns it away', async () => {
  const response = await fetchWithRetry('https://model.example/v1/chat', { method: 'POST' })
  assert.equal(response.status, 200)
  assert.equal(sent, 1)
})

test('whoever keeps the books is asked first, is told what the request is for, and can turn it away', async () => {
  const asked: UsageScope[] = []
  setUsageGate((scope) => {
    asked.push({ ...scope })
    if (scope.task === 'chat') throw Object.assign(new Error('Nothing left for today'), { statusCode: 429 })
  })
  await assert.rejects(
    withUsageScope({ task: 'chat', conversationId: 'c1' }, () => fetchWithRetry('https://model.example/v1/chat', { method: 'POST' })),
    { message: 'Nothing left for today', statusCode: 429 },
  )
  assert.equal(sent, 0, 'a request turned away is never sent')
  await withUsageScope({ task: 'help' }, () => fetchWithRetry('https://model.example/v1/chat', { method: 'POST' }))
  assert.equal(sent, 1)
  assert.deepEqual(asked, [{ task: 'chat', conversationId: 'c1' }, { task: 'help' }])
})

test('being turned away is passed on the way a refusal by the model service is: in its own words, with its status and code', async () => {
  setUsageGate(() => { throw Object.assign(new Error('Nothing left for today'), { statusCode: 429, code: 'NOTHING_LEFT' }) })
  const refusal = await fetchWithRetry('https://model.example/v1/chat', { method: 'POST' }, { retries: 2 }).catch((error) => error)
  assert.ok(refusal instanceof ProviderRequestError)
  assert.deepEqual([refusal.message, refusal.statusCode, refusal.code], ['Nothing left for today', 429, 'NOTHING_LEFT'])
  assert.equal(sent, 0)
})

test('the answer may take a moment', async () => {
  setUsageGate(async () => { await new Promise((resolve) => setTimeout(resolve, 5)) })
  await fetchWithRetry('https://model.example/v1/chat', { method: 'POST' })
  assert.equal(sent, 1)
})
