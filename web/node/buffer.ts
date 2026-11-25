/** The part of Node's Buffer the app uses: bytes made from text in a named encoding, and read back as text in one. */

type Encoding = 'utf8' | 'utf-8' | 'hex' | 'base64' | 'base64url' | 'latin1' | 'binary'

/** Bytes that know how to be read as text, the way a Node Buffer does. */
export type Bytes = Uint8Array & { toString(encoding?: Encoding): string }

// The browser turns characters into base64 a string at a time, and a call takes only so many arguments.
const CHUNK = 0x8000

function fromBase64(text: string) {
  const plain = atob(text.replace(/-/gu, '+').replace(/_/gu, '/').replace(/[^A-Za-z0-9+/]/gu, ''))
  const bytes = new Uint8Array(plain.length)
  for (let at = 0; at < plain.length; at += 1) bytes[at] = plain.charCodeAt(at)
  return bytes
}

function toLatin1(bytes: Uint8Array) {
  let text = ''
  for (let at = 0; at < bytes.length; at += CHUNK) text += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
  return text
}

function encode(text: string, encoding: Encoding) {
  if (encoding === 'utf8' || encoding === 'utf-8') return new TextEncoder().encode(text)
  if (encoding === 'base64' || encoding === 'base64url') return fromBase64(text)
  if (encoding === 'hex') return Uint8Array.from(text.match(/[0-9a-f]{2}/giu) || [], (pair) => Number.parseInt(pair, 16))
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff)
}

function decode(bytes: Uint8Array, encoding: Encoding) {
  if (encoding === 'utf8' || encoding === 'utf-8') return new TextDecoder().decode(bytes)
  if (encoding === 'base64') return btoa(toLatin1(bytes))
  if (encoding === 'base64url') return btoa(toLatin1(bytes)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
  if (encoding === 'hex') return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return toLatin1(bytes)
}

function readable(bytes: Uint8Array): Bytes {
  return Object.defineProperty(bytes, 'toString', { value: (encoding: Encoding = 'utf8') => decode(bytes, encoding) }) as Bytes
}

export const Buffer = {
  /** Text in `encoding`, or a copy of some bytes. */
  from(value: string | ArrayLike<number> | ArrayBufferLike, encoding: Encoding = 'utf8'): Bytes {
    if (typeof value === 'string') return readable(encode(value, encoding))
    return readable(new Uint8Array(value as ArrayLike<number>).slice())
  },
}
