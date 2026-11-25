import { lookup } from 'node:dns/promises'
import http, { type IncomingMessage } from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import type { LookupItem } from './types.js'

const blockedNames = new Set(['localhost', 'localhost.localdomain'])

/** Prefer GitHub's plain-text endpoint over scraping the much larger blob UI. */
export function preferredPublicUrl(input: string) {
  const url = new URL(input)
  const hostname = url.hostname.toLocaleLowerCase()
  const match = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/u.exec(url.pathname)
  if ((hostname === 'github.com' || hostname === 'www.github.com') && match) {
    return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`
  }
  return url.toString()
}

/** An address as the name service gives it. */
export interface Address { address: string; family: number }

function ipv4Bytes(text: string) {
  const parts = text.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part) || Number(part) > 255)) return undefined
  return parts.map(Number)
}

/** The eight groups of an IPv6 address, however it is written: shortened with `::`, or ending in a dotted IPv4 address. */
function ipv6Groups(text: string) {
  let value = text.toLowerCase()
  const dotted = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(value)?.[1]
  if (dotted) {
    const bytes = ipv4Bytes(dotted)
    if (!bytes) return undefined
    value = `${value.slice(0, -dotted.length)}${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`
  }
  const halves = value.split('::')
  if (halves.length > 2) return undefined
  const [head, tail] = halves.map((half) => (half ? half.split(':') : []))
  const left = 8 - head.length - (tail?.length || 0)
  if (tail ? left < 1 : left !== 0) return undefined
  const groups = tail ? [...head, ...Array<string>(left).fill('0'), ...tail] : head
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return undefined
  return groups.map((group) => Number.parseInt(group, 16))
}

function publicIpv4([a, b, c]: number[]) {
  // This machine and this network, private networks, and the link-local range where clouds keep their own services.
  if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false
  // The range carriers share with their customers, which is as private as the ones above.
  if (a === 100 && b >= 64 && b <= 127) return false
  // Set aside for protocols, relays, benchmarks and examples: nothing public answers there.
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if ((a === 192 && b === 88 && c === 99) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return false
  // From 224 up: multicast, reserved, broadcast.
  return a < 224
}

function publicIpv6(groups: number[]) {
  const [first, second, third] = groups
  const carried = (high: number, low: number) => publicIpv4([high >> 8, high & 255, low >> 8, low & 255])
  // An IPv4 address written as an IPv6 one reaches the IPv4 host, so it is judged as that host: ::ffff:a.b.c.d and the
  // older ::a.b.c.d (which takes in :: and ::1), 64:ff9b::a.b.c.d through a translator, 2002:aabb:ccdd:: through a relay.
  if (groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0 || groups[5] === 0xffff)) return carried(groups[6], groups[7])
  if (first === 0x64 && second === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) return carried(groups[6], groups[7])
  if (first === 0x2002) return carried(second, third)
  // Only 2000::/3 is handed out for public use. Everything else is link-local, private, multicast or not assigned.
  if ((first & 0xe000) !== 0x2000) return false
  // 2001::/23 is set aside for protocols (one of them tunnels to an IPv4 host), 2001:db8::/32 for examples.
  return !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
}

/** Whether an address is out on the public internet: not this machine, not a network it sits on, not a cloud's own services. */
export function isPublicAddress(address: string) {
  const kind = isIP(address)
  const parts = kind === 4 ? ipv4Bytes(address) : kind === 6 ? ipv6Groups(address) : undefined
  if (!parts) return false
  return kind === 4 ? publicIpv4(parts) : publicIpv6(parts)
}

/** The addresses a web address stands for, given only when every one of them is public. */
export async function publicAddressesOf(url: URL): Promise<Address[]> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('UNSAFE_URL')
  const hostname = url.hostname.toLocaleLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/u, '')
  if (!hostname || blockedNames.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.localhost')) throw new Error('UNSAFE_URL')
  const written = isIP(hostname)
  const addresses = written ? [{ address: hostname, family: written }] : await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) throw new Error('UNSAFE_URL')
  return addresses
}

const ASKED_AS = { 'user-agent': 'LocalLanguageCoach/0.1 (+read-only user-requested fetch)', accept: 'text/html,text/plain,application/json,application/xml;q=0.8', 'accept-encoding': 'gzip' }

/**
 * Asks for a page at `addresses` and nowhere else. They are the addresses that were checked: connecting does not look
 * the name up a second time, when it could answer with an address on this machine or its network.
 */
function requestFrom(url: URL, addresses: Address[], signal: AbortSignal) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      agent: false,
      signal,
      headers: ASKED_AS,
      lookup: (_name, options, found) => {
        if (options.all) found(null, addresses)
        else found(null, addresses[0].address, addresses[0].family)
      },
    }, resolve)
    request.once('error', reject)
  })
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

async function limitedBody(response: IncomingMessage, limit = 1_000_000) {
  const packed = String(response.headers['content-encoding'] || 'identity').trim().toLocaleLowerCase()
  if (!['identity', 'gzip', 'x-gzip'].includes(packed)) throw new Error('UNSUPPORTED_PAGE')
  const parts: AsyncIterator<Uint8Array<ArrayBuffer>> = response[Symbol.asyncIterator]()
  const sent = new ReadableStream<Uint8Array<ArrayBuffer>>({
    async pull(controller) {
      const { done, value } = await parts.next()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    async cancel() { await parts.return?.() },
  })
  const reader = (packed === 'identity' ? sent : sent.pipeThrough(new DecompressionStream('gzip'))).getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel().catch(() => undefined); throw new Error('PAGE_TOO_LARGE') }
    chunks.push(value)
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(result)
}

/** One request for the page: where it sends the reader on to, or what kind of page it is and its text. */
async function ask(url: URL, timeoutMs: number, addressesOf: typeof publicAddressesOf): Promise<{ next: URL } | { contentType: string; body: string }> {
  const addresses = await addressesOf(url)
  const signal = AbortSignal.timeout(timeoutMs)
  let response: IncomingMessage | undefined
  try {
    response = await requestFrom(url, addresses, signal)
    const status = response.statusCode || 0
    const location = response.headers.location
    if (status >= 300 && status < 400 && location) return { next: new URL(location, url) }
    if (status < 200 || status > 299) throw new Error(`PAGE_HTTP_${status}`)
    const contentType = String(response.headers['content-type'] || 'text/plain').toLocaleLowerCase()
    if (!/(text|json|xml|html)/u.test(contentType)) throw new Error('UNSUPPORTED_PAGE')
    return { contentType, body: await limitedBody(response) }
  } catch (error) {
    if (signal.aborted) throw signal.reason
    // A connection that fails is told apart from a page that answers badly, the way `fetch` tells it.
    if (error instanceof Error && typeof (error as NodeJS.ErrnoException).code === 'string') throw new TypeError('fetch failed', { cause: error })
    throw error
  } finally {
    response?.destroy()
  }
}

/** Reads a page a learner pointed at. Every address on the way, the ones a page sends the reader on to as well, is asked of `addressesOf` first. */
export async function readPublicUrl(input: string, timeoutMs: number, addressesOf = publicAddressesOf): Promise<LookupItem> {
  const requested = new URL(input)
  const preferred = preferredPublicUrl(requested.toString())
  const transformed = preferred !== requested.toString()
  let current = new URL(preferred)
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const answer = await ask(current, timeoutMs, addressesOf)
    if ('next' in answer) {
      current = answer.next
      continue
    }
    const { body, contentType } = answer
    const content = readableText(body, contentType)
    if (!content) throw new Error('EMPTY_PAGE')
    const title = /<title[^>]*>([\s\S]*?)<\/title>/iu.exec(body)?.[1]
    const requestedParts = requested.pathname.split('/').filter(Boolean)
    const fallbackTitle = transformed && requestedParts.length >= 5
      ? `${requestedParts.at(-1)} · ${requestedParts[0]}/${requestedParts[1]}`
      : current.hostname
    return {
      title: title ? decodeHtml(title).replace(/\s+/gu, ' ').trim() : fallbackTitle,
      url: transformed ? requested.toString() : current.toString(),
      summary: content.slice(0, 600),
      content,
    }
  }
  throw new Error('TOO_MANY_REDIRECTS')
}
