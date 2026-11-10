import { createHash } from 'node:crypto'
import { getConfig, getSecrets } from '../services/config.js'
import type { ProviderConfig, ProviderKind } from '../types.js'
import type { LookupCitation, LookupItem, LookupPresentation, ProviderLookupResult } from './types.js'

const lookupProviders = new Set<ProviderKind>(['openai', 'anthropic', 'gemini', 'deepseek', 'kimi'])
const rawLookupProviders = new Set<ProviderKind>(['deepseek', 'kimi'])

export function supportsProviderLookup(providerId: string) {
  return lookupProviders.has(providerId as ProviderKind)
}

export function supportsProviderFetch(providerId: string) {
  return rawLookupProviders.has(providerId as ProviderKind)
}

function digest(value: string) {
  return createHash('sha256').update(value.normalize('NFC').trim().replace(/\s+/gu, ' ')).digest('hex')
}

async function credentials(providerId?: string) {
  const config = await getConfig()
  const selectedId = providerId || config.llm.defaultProvider
  if (!supportsProviderLookup(selectedId)) throw new Error('LOOKUP_NOT_SUPPORTED')
  const provider = config.providers.find((item) => item.id === selectedId)
  const secrets = await getSecrets()
  const key = provider?.apiKeySecret ? secrets[provider.apiKeySecret] || '' : ''
  if (!provider || !key) throw new Error('LOOKUP_NOT_CONFIGURED')
  return { provider, key }
}

function toolPath(provider: ProviderConfig, tool: 'search' | 'fetch') {
  if (provider.id === 'deepseek') return `/v1/tools/${tool}`
  return tool === 'search' ? '/tools/search_pro' : '/tools/fetch'
}

async function requestJson(url: string, init: RequestInit, timeoutMs: number) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  const value = await response.text()
  if (!response.ok) throw new Error(`LOOKUP_HTTP_${response.status}`)
  try { return JSON.parse(value) as Record<string, any> }
  catch { throw new Error('LOOKUP_INVALID_RESPONSE') }
}

async function requestRawToolWithCredentials(provider: ProviderConfig, key: string, tool: 'search' | 'fetch', body: unknown, timeoutMs: number) {
  if (!supportsProviderFetch(provider.id)) throw new Error('LOOKUP_FETCH_NOT_SUPPORTED')
  return requestJson(`${provider.baseUrl.replace(/\/$/u, '')}${toolPath(provider, tool)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs)
}

async function requestRawTool(providerId: string, tool: 'search' | 'fetch', body: unknown, timeoutMs: number) {
  const { provider, key } = await credentials(providerId)
  return requestRawToolWithCredentials(provider, key, tool, body, timeoutMs)
}

export function providerSearchBody(providerId: string, query: string, count: number, timeoutMs: number, domain = '') {
  if (providerId === 'deepseek') return { query, count, need_content: true }
  if (providerId === 'kimi') return {
    text_query: query,
    limit: count,
    timeout_seconds: Math.max(1, Math.min(60, Math.ceil(timeoutMs / 1_000))),
    ...(domain ? { sites: [domain] } : {}),
  }
  throw new Error('RAW_LOOKUP_NOT_SUPPORTED')
}

export function providerSearchItems(providerId: string, json: Record<string, any>): LookupItem[] {
  const values = providerId === 'kimi' ? json.search_results : json.results
  return (Array.isArray(values) ? values : []).map((item: any) => ({
    title: typeof item.title === 'string' ? item.title : '',
    url: typeof item.url === 'string' ? item.url : '',
    summary: typeof item.summary === 'string'
      ? item.summary
      : typeof item.snippet === 'string' ? item.snippet : '',
    content: typeof item.content === 'string'
      ? item.content.slice(0, 18_000)
      : typeof item.text === 'string'
        ? item.text.slice(0, 18_000)
        : Array.isArray(item.chunks)
          ? item.chunks.map((chunk: any) => typeof chunk?.text === 'string' ? chunk.text : '').filter(Boolean).join('\n').slice(0, 18_000)
          : '',
  })).filter((item: LookupItem) => item.url && (item.summary || item.content))
}

function uniqueCitations(values: LookupCitation[]) {
  const seen = new Set<string>()
  return values.filter((item) => {
    if (!/^https?:\/\//iu.test(item.url) || seen.has(item.url)) return false
    seen.add(item.url)
    return true
  }).slice(0, 8)
}

function groundedResult(provider: ProviderKind, answer: string, citations: LookupCitation[], searchSuggestionsHtml?: string): ProviderLookupResult {
  const text = answer.trim()
  const usableCitations = uniqueCitations(citations)
  const items = usableCitations.map((citation) => ({
    title: citation.title || new URL(citation.url).hostname,
    url: citation.url,
    summary: text.slice(0, 1_200),
    content: text.slice(0, 18_000),
  }))
  if (!text) return { items: [] }
  const presentation: LookupPresentation = {
    provider,
    text,
    citations: usableCitations,
    ...(searchSuggestionsHtml ? { searchSuggestionsHtml } : {}),
    preserveText: true,
  }
  return { items, presentation }
}

export interface ProviderSearchInput {
  providerId: string
  query: string
  latestUserMessage: string
  subject: string
  domain?: string
  targetLanguage?: string
  count: number
  timeoutMs: number
}

function naturalSearchPrompt(input: ProviderSearchInput) {
  return [
    `Search the web for the learner's exact request, then answer as a natural conversation partner in ${input.targetLanguage || 'the learner’s target language'}.`,
    `Current date and timezone: ${new Date().toISOString()} / Asia/Shanghai.`,
    `Exact subject: ${input.subject}.`,
    `Learner message: ${input.latestUserMessage}.`,
    `Focused search query: ${input.query}.`,
    'Answer the clear question directly. Use the amount of speech that feels natural for this moment, without turning the reply into a report or lecture. Preserve every named person, place, team, product, event, platform, and time range.',
    'Name the requested person, place, team, product, or event at least once in the answer instead of referring to it only with a pronoun.',
    'Do not replace the requested entity with a related one. Do not say “according to search results”, “sources”, “evidence”, or describe your research process. Ask at most one natural follow-up question.',
  ].join('\n')
}

export function openAiSearchBody(provider: Pick<ProviderConfig, 'model'>, prompt: string, domain = '') {
  return {
    model: provider.model,
    input: prompt,
    tools: [{
      type: 'web_search',
      search_context_size: 'low',
      ...(domain ? { filters: { allowed_domains: [domain] } } : {}),
    }],
    tool_choice: 'required',
    reasoning: { effort: 'low' },
    max_output_tokens: 1_200,
  }
}

export function parseOpenAiSearch(json: Record<string, any>): ProviderLookupResult {
  const parts = (Array.isArray(json.output) ? json.output : [])
    .filter((item: any) => item?.type === 'message')
    .flatMap((item: any) => Array.isArray(item.content) ? item.content : [])
    .filter((item: any) => item?.type === 'output_text' && typeof item.text === 'string')
  const answer = parts.map((part: any) => part.text).join('\n').trim() || (typeof json.output_text === 'string' ? json.output_text.trim() : '')
  const citations = parts.flatMap((part: any) => (Array.isArray(part.annotations) ? part.annotations : []))
    .filter((item: any) => item?.type === 'url_citation' && typeof item.url === 'string')
    .map((item: any) => ({
      url: item.url,
      title: typeof item.title === 'string' ? item.title : '',
      ...(Number.isInteger(item.start_index) ? { startIndex: item.start_index } : {}),
      ...(Number.isInteger(item.end_index) ? { endIndex: item.end_index } : {}),
    }))
  return groundedResult('openai', answer, citations)
}

async function searchOpenAi(provider: ProviderConfig, key: string, input: ProviderSearchInput) {
  const json = await requestJson(`${provider.baseUrl.replace(/\/$/u, '')}/responses`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(openAiSearchBody(provider, naturalSearchPrompt(input), input.domain)),
  }, input.timeoutMs)
  return parseOpenAiSearch(json)
}

export function anthropicSearchBody(provider: Pick<ProviderConfig, 'model'>, prompt: string, domain = '') {
  return {
    model: provider.model,
    system: 'Use web search for this turn. Return only the final, natural conversational answer after searching; do not narrate the search.',
    messages: [{ role: 'user', content: prompt }],
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 3,
      ...(domain ? { allowed_domains: [domain] } : {}),
    }],
    max_tokens: 1_200,
    ...(/^claude-(?:fable|mythos|opus|sonnet|haiku)-5/iu.test(provider.model)
      ? { output_config: { effort: 'low' } }
      : {}),
    ...(/^claude-sonnet-5-5(?:$|-)/iu.test(provider.model) ? { thinking: { type: 'between_tools' } } : {}),
  }
}

export function parseAnthropicSearch(json: Record<string, any>): ProviderLookupResult {
  const blocks = Array.isArray(json.content) ? json.content : []
  const lastResult = blocks.reduce((found: number, block: any, index: number) => block?.type === 'web_search_tool_result' ? index : found, -1)
  const finalTextBlocks = blocks.slice(lastResult + 1).filter((item: any) => item?.type === 'text' && typeof item.text === 'string')
  const answer = finalTextBlocks.map((item: any) => item.text).join('\n').trim()
  const cited = finalTextBlocks.flatMap((item: any) => Array.isArray(item.citations) ? item.citations : [])
  const resultLinks = blocks
    .filter((item: any) => item?.type === 'web_search_tool_result' && Array.isArray(item.content))
    .flatMap((item: any) => item.content)
  const citations = [...cited, ...resultLinks]
    .filter((item: any) => typeof item?.url === 'string')
    .map((item: any) => ({ url: item.url, title: typeof item.title === 'string' ? item.title : '' }))
  return groundedResult('anthropic', answer, citations)
}

async function searchAnthropic(provider: ProviderConfig, key: string, input: ProviderSearchInput) {
  const json = await requestJson(`${provider.baseUrl.replace(/\/$/u, '')}/messages`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2026-10-21', 'content-type': 'application/json' },
    body: JSON.stringify(anthropicSearchBody(provider, naturalSearchPrompt(input), input.domain)),
  }, input.timeoutMs)
  return parseAnthropicSearch(json)
}

export function geminiSearchBody(provider: Pick<ProviderConfig, 'model'>, prompt: string) {
  return {
    systemInstruction: { parts: [{ text: 'Use Google Search for this turn. Return one natural conversational answer to the exact request.' }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      ...(/^gemini-3/iu.test(provider.model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
      maxOutputTokens: 1_200,
    },
  }
}

export function parseGeminiSearch(json: Record<string, any>): ProviderLookupResult {
  const candidate = json.candidates?.[0]
  const answer = (Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .filter((part: any) => !part?.thought && typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('\n')
    .trim()
  const metadata = candidate?.groundingMetadata || {}
  const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : []
  const citations = chunks
    .map((chunk: any) => chunk?.web)
    .filter((web: any) => typeof web?.uri === 'string')
    .map((web: any) => ({ url: web.uri, title: typeof web.title === 'string' ? web.title : '' }))
  const searchSuggestionsHtml = typeof metadata.searchEntryPoint?.renderedContent === 'string'
    ? metadata.searchEntryPoint.renderedContent
    : undefined
  return groundedResult('gemini', answer, citations, searchSuggestionsHtml)
}

async function searchGemini(provider: ProviderConfig, key: string, input: ProviderSearchInput) {
  const url = `${provider.baseUrl.replace(/\/$/u, '')}/models/${encodeURIComponent(provider.model)}:generateContent`
  const json = await requestJson(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify(geminiSearchBody(provider, naturalSearchPrompt(input))),
  }, input.timeoutMs)
  return parseGeminiSearch(json)
}

async function performSearch(input: ProviderSearchInput): Promise<ProviderLookupResult> {
  const { provider, key } = await credentials(input.providerId)
  if (provider.id === 'openai') return searchOpenAi(provider, key, input)
  if (provider.id === 'anthropic') return searchAnthropic(provider, key, input)
  if (provider.id === 'gemini') return searchGemini(provider, key, input)
  const query = provider.id === 'kimi' && input.domain
    ? input.query.replace(new RegExp(`\\s*site:${input.domain.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*`, 'iu'), ' ').trim()
    : input.query
  const json = await requestRawToolWithCredentials(provider, key, 'search', providerSearchBody(provider.id, query, input.count, input.timeoutMs, input.domain), input.timeoutMs)
  return { items: providerSearchItems(provider.id, json) }
}

/** One real, low-cost lookup is part of provider certification. This prevents
 * an arbitrary chat-capable model from entering the formal list when that
 * exact model/key cannot use its provider's official search path. */
export async function probeProviderLookup(provider: ProviderConfig, key: string, timeoutMs: number) {
  if (!supportsProviderLookup(provider.id)) throw new Error('LOOKUP_NOT_SUPPORTED')
  const subject = `${provider.name} official website`
  const input: ProviderSearchInput = {
    providerId: provider.id,
    query: `${provider.name} official website`,
    latestUserMessage: `What is the official website for ${provider.name}?`,
    subject,
    targetLanguage: 'English',
    count: 2,
    timeoutMs,
  }
  let result: ProviderLookupResult
  if (provider.id === 'openai') result = await searchOpenAi(provider, key, input)
  else if (provider.id === 'anthropic') result = await searchAnthropic(provider, key, input)
  else if (provider.id === 'gemini') result = await searchGemini(provider, key, input)
  else {
    const json = await requestRawToolWithCredentials(provider, key, 'search', providerSearchBody(provider.id, input.query, input.count, timeoutMs, input.domain), timeoutMs)
    result = { items: providerSearchItems(provider.id, json) }
  }
  if (!result.items.length) throw new Error('The model/key did not return a usable web lookup result')
  return true
}

export async function searchWithSelectedProvider(input: ProviderSearchInput): Promise<ProviderLookupResult> {
  const { db, row } = await import('../services/database.js')
  const focusedQuery = [...input.query.trim()].slice(0, 128).join('')
  if (!focusedQuery) return { items: [] }
  const cacheKey = digest(['provider-lookup-v2', input.providerId, focusedQuery, input.latestUserMessage, input.subject, input.domain || '', input.targetLanguage || '', input.count].join('\n'))
  const now = new Date()
  const cached = row<{ result_json: string; expires_at: string }>('SELECT result_json, expires_at FROM web_lookup_cache WHERE cache_key = ?', cacheKey)
  if (cached && cached.expires_at > now.toISOString()) {
    db.prepare('UPDATE web_lookup_cache SET last_accessed = ? WHERE cache_key = ?').run(now.toISOString(), cacheKey)
    return JSON.parse(cached.result_json) as ProviderLookupResult
  }
  const result = await performSearch({ ...input, query: focusedQuery })
  const expires = new Date(now.getTime() + 15 * 60_000).toISOString()
  db.prepare(`INSERT INTO web_lookup_cache (cache_key, query, result_json, expires_at, created_at, last_accessed)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET result_json = excluded.result_json, expires_at = excluded.expires_at, last_accessed = excluded.last_accessed`)
    .run(cacheKey, focusedQuery, JSON.stringify(result), expires, now.toISOString(), now.toISOString())
  db.prepare('DELETE FROM web_lookup_cache WHERE expires_at <= ?').run(now.toISOString())
  return result
}

export async function fetchWithSelectedProvider(providerId: string, url: string, timeoutMs: number): Promise<LookupItem> {
  const json = await requestRawTool(providerId, 'fetch', { url }, timeoutMs)
  const content = typeof json.content === 'string' ? json.content : typeof json.markdown === 'string' ? json.markdown : ''
  if (!content.trim()) throw new Error('EMPTY_PAGE')
  return {
    title: typeof json.title === 'string' ? json.title : new URL(url).hostname,
    url: typeof json.url === 'string' ? json.url : url,
    summary: content.trim().slice(0, 600),
    content: content.trim().slice(0, 24_000),
  }
}

export async function selectedProviderLookupReady(providerId?: string) {
  try { await credentials(providerId); return true } catch { return false }
}
