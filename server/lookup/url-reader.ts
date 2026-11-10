import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { LookupItem } from './types.js'

const blockedNames = new Set(['localhost', 'localhost.localdomain'])

function blockedIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
}

function blockedIp(address: string) {
  if (isIP(address) === 4) return blockedIpv4(address)
  if (isIP(address) === 6) {
    const value = address.toLocaleLowerCase()
    return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('::ffff:127.') || value.startsWith('::ffff:10.') || value.startsWith('::ffff:192.168.')
  }
  return true
}

async function assertPublicUrl(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('UNSAFE_URL')
  const hostname = url.hostname.toLocaleLowerCase().replace(/^\[|\]$/gu, '')
  if (!hostname || blockedNames.has(hostname) || hostname.endsWith('.local')) throw new Error('UNSAFE_URL')
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some((item) => blockedIp(item.address))) throw new Error('UNSAFE_URL')
  return url
}

function decodeHtml(value: string) {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (_match, entity: string) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLocaleLowerCase() === 'x'
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ' '
    }
    return entities[entity.toLocaleLowerCase()] ?? ' '
  })
}

function readableText(body: string, contentType: string) {
  if (!contentType.includes('html')) return body.replace(/\s+/gu, ' ').trim().slice(0, 24_000)
  return decodeHtml(body)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 24_000)
}

async function limitedBody(response: Response, limit = 1_000_000) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); throw new Error('PAGE_TOO_LARGE') }
    chunks.push(value)
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(result)
}

export async function readPublicUrl(input: string, timeoutMs: number): Promise<LookupItem> {
  let current = await assertPublicUrl(input)
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': 'LocalLanguageCoach/0.1 (+read-only user-requested fetch)', accept: 'text/html,text/plain,application/json,application/xml;q=0.8' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      await response.body?.cancel().catch(() => undefined)
      current = await assertPublicUrl(new URL(response.headers.get('location')!, current).toString())
      continue
    }
    if (!response.ok) throw new Error(`PAGE_HTTP_${response.status}`)
    const contentType = response.headers.get('content-type')?.toLocaleLowerCase() || 'text/plain'
    if (!/(text|json|xml|html)/u.test(contentType)) throw new Error('UNSUPPORTED_PAGE')
    const body = await limitedBody(response)
    const content = readableText(body, contentType)
    if (!content) throw new Error('EMPTY_PAGE')
    const title = /<title[^>]*>([\s\S]*?)<\/title>/iu.exec(body)?.[1]
    return { title: title ? decodeHtml(title).replace(/\s+/gu, ' ').trim() : current.hostname, url: current.toString(), summary: content.slice(0, 600), content }
  }
  throw new Error('TOO_MANY_REDIRECTS')
}
