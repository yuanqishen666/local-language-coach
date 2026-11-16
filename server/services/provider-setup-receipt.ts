import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { ProviderCapability } from '../types.js'
import { dataRoot } from './config.js'

const RECEIPT_VERSION = 1
const RECEIPT_TTL_MS = 30 * 60_000
const signingKeyPath = path.join(dataRoot, 'setup-signing-key')

export interface ProviderSetupReceiptClaims {
  version: 1
  providerId: string
  model: string
  keyDigest: string
  capability: ProviderCapability
  issuedAt: number
  expiresAt: number
  nonce: string
}

type ReceiptExpectation = {
  providerId: string
  model: string
  apiKey: string
  now?: number
}

function receiptError(message: string, code: string) {
  return Object.assign(new Error(message), { statusCode: 409, code })
}

function hmac(key: Buffer, value: string) {
  return createHmac('sha256', key).update(value).digest('base64url')
}

function equalEncoded(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

async function signingKey() {
  await mkdir(dataRoot, { recursive: true, mode: 0o700 })
  try {
    const encoded = (await readFile(signingKeyPath, 'utf8')).trim()
    const key = Buffer.from(encoded, 'base64url')
    if (key.length !== 32) throw new Error('Expected a 32-byte setup signing key')
    return key
  } catch (error) {
    if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw Object.assign(new Error('The local provider setup signing key is invalid.', { cause: error }), {
        code: 'LOCAL_SETUP_SIGNING_KEY_INVALID',
      })
    }
  }

  const key = randomBytes(32)
  let handle
  try {
    handle = await open(signingKeyPath, 'wx', 0o600)
    await handle.writeFile(`${key.toString('base64url')}\n`)
    await handle.sync()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const existing = await readFile(signingKeyPath, 'utf8').catch(() => '')
    const existingKey = Buffer.from(existing.trim(), 'base64url')
    if (existingKey.length === 32) return existingKey
    throw error
  } finally {
    await handle?.close()
  }
  return key
}

function keyDigest(key: Buffer, apiKey: string) {
  return hmac(key, `provider-api-key-v1\0${apiKey}`)
}

function parseClaims(payload: string): ProviderSetupReceiptClaims {
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    throw receiptError('The provider setup receipt is invalid. Test the model again.', 'SETUP_RECEIPT_INVALID')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw receiptError('The provider setup receipt is invalid. Test the model again.', 'SETUP_RECEIPT_INVALID')
  }
  const claims = value as Partial<ProviderSetupReceiptClaims>
  if (claims.version !== RECEIPT_VERSION || typeof claims.providerId !== 'string' ||
    typeof claims.model !== 'string' || typeof claims.keyDigest !== 'string' ||
    typeof claims.issuedAt !== 'number' || typeof claims.expiresAt !== 'number' ||
    typeof claims.nonce !== 'string' || !claims.capability || typeof claims.capability !== 'object') {
    throw receiptError('The provider setup receipt is invalid. Test the model again.', 'SETUP_RECEIPT_INVALID')
  }
  return claims as ProviderSetupReceiptClaims
}

export async function issueProviderSetupReceipt(
  providerId: string,
  model: string,
  apiKey: string,
  capability: ProviderCapability,
  now = Date.now(),
) {
  const key = await signingKey()
  const claims: ProviderSetupReceiptClaims = {
    version: RECEIPT_VERSION,
    providerId,
    model,
    keyDigest: keyDigest(key, apiKey),
    capability,
    issuedAt: now,
    expiresAt: now + RECEIPT_TTL_MS,
    nonce: randomUUID(),
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${payload}.${hmac(key, payload)}`
}

export async function verifyProviderSetupReceipt(receipt: string | undefined, expected: ReceiptExpectation) {
  if (!receipt) {
    throw receiptError('Test this model and API key before saving.', 'SETUP_RECEIPT_REQUIRED')
  }
  const [payload, signature, extra] = receipt.split('.')
  if (!payload || !signature || extra) {
    throw receiptError('The provider setup receipt is invalid. Test the model again.', 'SETUP_RECEIPT_INVALID')
  }
  const key = await signingKey()
  if (!equalEncoded(signature, hmac(key, payload))) {
    throw receiptError('The provider setup receipt is invalid. Test the model again.', 'SETUP_RECEIPT_INVALID')
  }
  const claims = parseClaims(payload)
  if (claims.expiresAt <= (expected.now ?? Date.now())) {
    throw receiptError('The provider setup receipt expired. Test the model again.', 'SETUP_RECEIPT_EXPIRED')
  }
  if (claims.providerId !== expected.providerId) {
    throw receiptError('The provider setup receipt belongs to another provider.', 'SETUP_RECEIPT_PROVIDER_MISMATCH')
  }
  if (claims.model !== expected.model) {
    throw receiptError('The model changed after testing. Test it again.', 'SETUP_RECEIPT_MODEL_MISMATCH')
  }
  if (!expected.apiKey || !equalEncoded(claims.keyDigest, keyDigest(key, expected.apiKey))) {
    throw receiptError('The API key changed after testing. Test it again.', 'SETUP_RECEIPT_KEY_MISMATCH')
  }
  return claims
}

export async function resetProviderSetupSigningKey() {
  await unlink(signingKeyPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
  await signingKey()
}
