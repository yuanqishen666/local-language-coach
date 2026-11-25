/** The part of node:crypto the app uses, on what a browser has. Hashing here answers at once, which the browser's own does not. */
import { Buffer, type Bytes } from './buffer'

type Encoding = 'hex' | 'base64' | 'base64url'
type Data = string | Uint8Array

const K = Uint32Array.of(
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
)

const turn = (value: number, by: number) => (value >>> by) | (value << (32 - by))

function sha256(data: Uint8Array) {
  const state = Uint32Array.of(0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19)
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(data.length / 0x20000000))
  view.setUint32(padded.length - 4, (data.length << 3) >>> 0)
  const w = new Uint32Array(64)
  for (let block = 0; block < padded.length; block += 64) {
    for (let at = 0; at < 16; at += 1) w[at] = view.getUint32(block + at * 4)
    for (let at = 16; at < 64; at += 1) {
      const early = turn(w[at - 15], 7) ^ turn(w[at - 15], 18) ^ (w[at - 15] >>> 3)
      const late = turn(w[at - 2], 17) ^ turn(w[at - 2], 19) ^ (w[at - 2] >>> 10)
      w[at] = w[at - 16] + early + w[at - 7] + late
    }
    let [a, b, c, d, e, f, g, h] = state
    for (let at = 0; at < 64; at += 1) {
      const first = (h + (turn(e, 6) ^ turn(e, 11) ^ turn(e, 25)) + ((e & f) ^ (~e & g)) + K[at] + w[at]) | 0
      const second = ((turn(a, 2) ^ turn(a, 13) ^ turn(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      h = g
      g = f
      f = e
      e = (d + first) | 0
      d = c
      c = b
      b = a
      a = (first + second) | 0
    }
    state[0] += a
    state[1] += b
    state[2] += c
    state[3] += d
    state[4] += e
    state[5] += f
    state[6] += g
    state[7] += h
  }
  const digest = new Uint8Array(32)
  const out = new DataView(digest.buffer)
  state.forEach((word, at) => out.setUint32(at * 4, word))
  return digest
}

function joined(parts: Uint8Array[]) {
  const all = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let at = 0
  for (const part of parts) {
    all.set(part, at)
    at += part.length
  }
  return all
}

const bytesOf = (data: Data) => typeof data === 'string' ? new TextEncoder().encode(data) : data

function only256(algorithm: string) {
  if (algorithm.toLowerCase() !== 'sha256') throw new Error(`Digest method not supported: ${algorithm}`)
}

function digesting(finish: (data: Uint8Array) => Uint8Array) {
  const parts: Uint8Array[] = []
  const hash = {
    update(data: Data) {
      parts.push(bytesOf(data))
      return hash
    },
    digest(encoding?: Encoding): any {
      const digest = Buffer.from(finish(joined(parts)))
      return encoding ? digest.toString(encoding) : digest
    },
  }
  return hash
}

export function createHash(algorithm: string) {
  only256(algorithm)
  return digesting(sha256)
}

export function createHmac(algorithm: string, key: Data) {
  only256(algorithm)
  const given = bytesOf(key)
  const block = new Uint8Array(64)
  block.set(given.length > 64 ? sha256(given) : given)
  const inner = block.map((byte) => byte ^ 0x36)
  const outer = block.map((byte) => byte ^ 0x5c)
  return digesting((data) => sha256(joined([outer, sha256(joined([inner, data]))])))
}

export function randomUUID() {
  return crypto.randomUUID()
}

export function randomBytes(size: number): Bytes {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(size)))
}

/** A whole number from `min` up to but not including `max`, each as likely as any other. */
export function randomInt(min: number, max?: number) {
  const from = max === undefined ? 0 : min
  const span = (max === undefined ? min : max) - from
  if (!Number.isSafeInteger(span) || span <= 0 || span > 0x100000000) throw new RangeError('The range must be between 1 and 2 ** 32 wide')
  // Draws past the last whole multiple of the span are thrown away, or the low numbers would come up more often.
  const limit = 0x100000000 - (0x100000000 % span)
  const draw = new Uint32Array(1)
  do crypto.getRandomValues(draw)
  while (draw[0] >= limit)
  return from + (draw[0] % span)
}

export function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) throw new RangeError('Input buffers must have the same byte length')
  let differing = 0
  for (let at = 0; at < left.length; at += 1) differing |= left[at] ^ right[at]
  return differing === 0
}
