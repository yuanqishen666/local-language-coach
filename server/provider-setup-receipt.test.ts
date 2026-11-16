import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { ProviderCapability } from './types.js'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'llc-setup-receipt-'))
process.env.LLC_DATA_DIR = dataDir

const { issueProviderSetupReceipt, resetProviderSetupSigningKey, verifyProviderSetupReceipt } = await import('./services/provider-setup-receipt.js')

const capability: ProviderCapability = {
  outputMode: 'json_object',
  conversationReady: true,
  lookupReady: true,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  contractVersion: 7,
  testedAt: '2026-11-16T00:00:00.000Z',
}

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true })
})

test('signed provider setup receipts survive independent verification without in-memory state', async () => {
  const receipt = await issueProviderSetupReceipt('deepseek', 'deepseek-chat', 'key-one', capability, 1_000)
  const claims = await verifyProviderSetupReceipt(receipt, {
    providerId: 'deepseek',
    model: 'deepseek-chat',
    apiKey: 'key-one',
    now: 2_000,
  })

  assert.deepEqual(claims.capability, capability)
  assert.equal(claims.providerId, 'deepseek')
  assert.equal((await stat(path.join(dataDir, 'setup-signing-key'))).mode & 0o777, 0o600)
})

test('provider setup receipts reject tampering, changed keys, changed models, and expiry', async () => {
  const receipt = await issueProviderSetupReceipt('deepseek', 'deepseek-chat', 'key-one', capability, 1_000)
  const [payload, signature] = receipt.split('.')

  await assert.rejects(
    verifyProviderSetupReceipt(`${payload}x.${signature}`, {
      providerId: 'deepseek', model: 'deepseek-chat', apiKey: 'key-one', now: 2_000,
    }),
    (error: any) => error.code === 'SETUP_RECEIPT_INVALID',
  )
  await assert.rejects(
    verifyProviderSetupReceipt(receipt, {
      providerId: 'deepseek', model: 'deepseek-chat', apiKey: 'key-two', now: 2_000,
    }),
    (error: any) => error.code === 'SETUP_RECEIPT_KEY_MISMATCH',
  )
  await assert.rejects(
    verifyProviderSetupReceipt(receipt, {
      providerId: 'deepseek', model: 'deepseek-reasoner', apiKey: 'key-one', now: 2_000,
    }),
    (error: any) => error.code === 'SETUP_RECEIPT_MODEL_MISMATCH',
  )
  await assert.rejects(
    verifyProviderSetupReceipt(receipt, {
      providerId: 'deepseek', model: 'deepseek-chat', apiKey: 'key-one', now: 1_000 + 30 * 60_000,
    }),
    (error: any) => error.code === 'SETUP_RECEIPT_EXPIRED',
  )
})

test('resetting the local signing key invalidates previously issued receipts', async () => {
  const receipt = await issueProviderSetupReceipt('deepseek', 'deepseek-chat', 'key-one', capability)
  await resetProviderSetupSigningKey()

  await assert.rejects(
    verifyProviderSetupReceipt(receipt, {
      providerId: 'deepseek', model: 'deepseek-chat', apiKey: 'key-one',
    }),
    (error: any) => error.code === 'SETUP_RECEIPT_INVALID',
  )
})
