import assert from 'node:assert/strict'
import test from 'node:test'
import type { TurnLookupDecision } from './types.js'
import { runLookup, type LookupRouterDependencies } from './lookup/router.js'
import type { LookupItem, LookupRequest } from './lookup/types.js'

const url = 'https://github.com/example/project/blob/main/README.md'
const item: LookupItem = {
  title: 'Project README',
  url,
  summary: 'Project README overview',
  content: 'Project README with installation and feature details.',
}
const decision: TurnLookupDecision = {
  action: 'lookup',
  parts: [{ text: 'review the project README', needsLookup: true, reason: 'user_requested', subject: 'Project README' }],
  query: 'Project README',
  locator: { kind: 'url', value: url, domain: 'github.com', quote: url },
}

function request(providerId: string): LookupRequest {
  return {
    decision,
    latestUserMessage: `Please review ${url}`,
    ordinaryLookupEnabled: false,
    providerId,
    targetLanguage: 'English',
    timeoutMs: 8_000,
    maxResults: 5,
  }
}

function unused(name: string): never {
  throw new Error(`${name} should not be called`)
}

test('every configurable provider uses the shared direct URL reader first', async () => {
  for (const providerId of ['openai', 'anthropic', 'gemini', 'deepseek', 'kimi']) {
    const outcome = await runLookup(request(providerId), {
      readPublicUrl: async () => item,
      fetchWithSelectedProvider: async () => unused('provider fetch'),
      searchWithSelectedProvider: async () => unused('provider search'),
      supportsProviderFetch: () => unused('fetch capability check'),
      supportsProviderLookup: () => unused('lookup capability check'),
      reportFailure: () => unused('failure reporter'),
    })
    assert.equal(outcome.kind, 'found', providerId)
    assert.equal(outcome.items[0].url, url, providerId)
  }
})

test('all providers search after direct read fails, including fetch-capable DeepSeek and Kimi', async () => {
  for (const providerId of ['openai', 'anthropic', 'gemini', 'deepseek', 'kimi']) {
    const calls: string[] = []
    const fetchCapable = providerId === 'deepseek' || providerId === 'kimi'
    const dependencies: Partial<LookupRouterDependencies> = {
      readPublicUrl: async () => { calls.push('direct'); throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }) },
      supportsProviderFetch: () => fetchCapable,
      fetchWithSelectedProvider: async () => { calls.push('fetch'); throw new Error('LOOKUP_HTTP_503') },
      supportsProviderLookup: () => true,
      searchWithSelectedProvider: async () => { calls.push('search'); return { items: [item] } },
      reportFailure: () => undefined,
    }
    const outcome = await runLookup(request(providerId), dependencies)
    assert.equal(outcome.kind, 'found', providerId)
    assert.deepEqual(calls, fetchCapable ? ['direct', 'fetch', 'search'] : ['direct', 'search'], providerId)
    assert.deepEqual(
      outcome.diagnostics?.map((entry) => entry.stage),
      fetchCapable ? ['direct_read', 'provider_fetch'] : ['direct_read'],
      providerId,
    )
  }
})

test('an unavailable page retains safe failure reasons and reports every attempted layer', async () => {
  const reported: string[] = []
  const outcome = await runLookup(request('deepseek'), {
    readPublicUrl: async () => { throw new Error('PAGE_HTTP_403') },
    supportsProviderFetch: () => true,
    fetchWithSelectedProvider: async () => { throw new Error('LOOKUP_HTTP_404') },
    supportsProviderLookup: () => true,
    searchWithSelectedProvider: async () => { throw Object.assign(new Error('request expired'), { name: 'TimeoutError' }) },
    reportFailure: (diagnostic) => reported.push(`${diagnostic.stage}:${diagnostic.code}`),
  })

  assert.equal(outcome.kind, 'unavailable')
  assert.equal(outcome.note, 'The learner-supplied page returned HTTP 403. The configured provider fallbacks also failed.')
  assert.deepEqual(reported, [
    'direct_read:PAGE_HTTP_403',
    'provider_fetch:LOOKUP_HTTP_404',
    'provider_search:TIMEOUT',
  ])
  assert.deepEqual(outcome.diagnostics?.map((entry) => entry.code), ['PAGE_HTTP_403', 'LOOKUP_HTTP_404', 'TIMEOUT'])
})
